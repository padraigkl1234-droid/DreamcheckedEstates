'use client';

// Firebase Cloud Messaging (FCM) client helpers.
//
// Flow:
//  1. The user taps "Enable notifications" in Settings.
//  2. We ask the browser for Notification permission.
//  3. We register the background service worker (firebase-messaging-sw.js).
//  4. We fetch an FCM registration token (needs the public VAPID key).
//  5. We store the token on users/{uid}.fcmTokens so the server can push to it.
//
// The VAPID key is a public key — safe to ship in the client bundle. It is
// provided via NEXT_PUBLIC_FIREBASE_VAPID_KEY.

import { arrayUnion, arrayRemove, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Strip any whitespace/newlines that may have crept in when the key was copied
// out of the Firebase console (it's displayed wrapped across many lines there).
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.replace(/\s+/g, '');

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

async function getMessagingIfSupported() {
  const { isSupported, getMessaging } = await import('firebase/messaging');
  if (!(await isSupported())) return null;
  const { getApp } = await import('firebase/app');
  return getMessaging(getApp());
}

// Register the dedicated FCM service worker under its own scope, so it doesn't
// evict the PWA caching worker (sw.js) which owns the root '/' scope. A given
// scope can only have one active worker, hence the distinct sub-scope.
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';
async function registerSw(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE);
  if (existing) return existing;
  return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: FCM_SW_SCOPE });
}

export interface EnableResult {
  ok: boolean;
  token?: string;
  reason?: 'unsupported' | 'denied' | 'no-vapid' | 'no-token' | 'error';
  detail?: string; // the underlying error message, for diagnostics
}

// Ask permission, get a token, and save it to the user's profile. Idempotent:
// calling again just refreshes/re-stores the current token.
export async function enablePush(uid: string): Promise<EnableResult> {
  try {
    if (!pushSupported()) return { ok: false, reason: 'unsupported' };
    if (!VAPID_KEY) return { ok: false, reason: 'no-vapid' };

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };

    const messaging = await getMessagingIfSupported();
    if (!messaging) return { ok: false, reason: 'unsupported' };

    const registration = await registerSw();
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: 'no-token' };

    await setDoc(
      doc(db, 'users', uid),
      { fcmTokens: arrayUnion(token) },
      { merge: true }
    );
    return { ok: true, token };
  } catch (error) {
    console.error('enablePush failed:', error);
    const detail =
      (error as { code?: string })?.code || (error as Error)?.message || String(error);
    return { ok: false, reason: 'error', detail };
  }
}

// Remove the current device's token (used when the user turns notifications
// off, so the server stops pushing to this device).
export async function disablePush(uid: string): Promise<void> {
  try {
    if (!pushSupported() || !VAPID_KEY) return;
    const messaging = await getMessagingIfSupported();
    if (!messaging) return;
    const { getToken, deleteToken } = await import('firebase/messaging');
    const registration = await registerSw();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    }).catch(() => null);
    if (token) {
      await setDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) }, { merge: true });
      await deleteToken(messaging).catch(() => {});
    }
  } catch (error) {
    console.error('disablePush failed:', error);
  }
}

// Foreground messages: when the app is open and focused, FCM doesn't show a
// system notification. Subscribe here to surface an in-app toast instead.
export async function onForegroundMessage(
  handler: (payload: { title: string; body: string; url?: string }) => void
): Promise<() => void> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  const { onMessage } = await import('firebase/messaging');
  return onMessage(messaging, (payload) => {
    const n = payload.notification;
    const d = payload.data || {};
    handler({
      title: n?.title || d.title || 'INVICTUS',
      body: n?.body || d.body || '',
      url: d.url,
    });
  });
}

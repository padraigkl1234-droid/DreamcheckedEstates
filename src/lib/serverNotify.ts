import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';

// Server-side push helper. Sends a data-only message to every device token a
// user has registered, and prunes tokens the FCM backend reports as dead.
//
// We send data-only (no `notification` block) so the service worker fully
// controls how the notification looks and where a click goes, and so the
// foreground handler can turn it into an in-app toast without a duplicate.

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // where a click should take the user
  tag?: string; // collapses repeat notifications of the same kind
}

export interface PushResult {
  sent: number;
  pruned: number;
}

export async function pushToTokens(
  db: Firestore,
  messaging: Messaging,
  uid: string,
  tokens: string[],
  payload: PushPayload
): Promise<PushResult> {
  const unique = Array.from(new Set(tokens)).filter(Boolean);
  if (unique.length === 0) return { sent: 0, pruned: 0 };

  const res = await messaging.sendEachForMulticast({
    tokens: unique,
    data: {
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      ...(payload.tag ? { tag: payload.tag } : {}),
    },
    webpush: {
      fcmOptions: { link: payload.url || '/' },
    },
  });

  // Collect tokens FCM says are permanently invalid so we can drop them.
  const dead: string[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code || '';
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      dead.push(unique[i]);
    }
  });

  if (dead.length) {
    await db
      .collection('users')
      .doc(uid)
      .set({ fcmTokens: FieldValue.arrayRemove(...dead) }, { merge: true })
      .catch(() => {});
  }

  return { sent: res.successCount, pruned: dead.length };
}

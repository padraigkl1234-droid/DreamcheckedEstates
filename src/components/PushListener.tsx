'use client';

// Wires up Cloud Messaging on the client for signed-in users:
//   • surfaces an in-app toast when a push arrives while the app is focused
//     (FCM suppresses the system notification in that case), and
//   • silently refreshes this device's token on load when permission is already
//     granted, so tokens stay valid and survive reinstalls/rotation.

import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { onForegroundMessage, enablePush, notificationPermission } from '@/lib/messaging';

export function PushListener() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    // Keep this device's token fresh on load — but only if the user has this
    // device turned ON (the per-user flag Settings sets). Without that gate we'd
    // re-register a token every load even after the user turned notifications
    // off. No permission prompt here: permission is already granted.
    let deviceOn = false;
    try {
      deviceOn = window.localStorage.getItem(`invictus-push-${user.uid}`) === '1';
    } catch {
      /* ignore */
    }
    if (deviceOn && notificationPermission() === 'granted') {
      enablePush(user.uid).catch(() => {});
    }

    onForegroundMessage((payload) => {
      toast({ title: payload.title, description: payload.body });
    }).then((fn) => {
      if (cancelled) fn();
      else unsub = fn;
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, toast]);

  return null;
}

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

    // Keep this device's token fresh (no permission prompt — enablePush only
    // requests if not already granted, and here it already is).
    if (notificationPermission() === 'granted') {
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

'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Plus, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome/Edge (desktop and Android) fire `beforeinstallprompt` and let us
// trigger the native install dialog directly. Safari — iOS and macOS — never
// fires it; there's no programmatic install API at all, only the manual
// Share-sheet flow, so we show instructions instead. Everything else
// (Firefox, in-app browsers, etc.) has no install path either, so it also
// falls back to instructions rather than silently showing nothing.
function getPlatform(): 'ios' | 'macos-safari' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  if (isSafari) return 'macos-safari';
  return 'other';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** `compact` is the icon-only form the desktop rail uses, where there is no
 *  room for the words. */
export function InstallPwaButton({ compact = false }: { compact?: boolean } = {}) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallEvent(null);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (!mounted || installed) return null;

  const platform = getPlatform();

  return (
    <>
      <Button
        variant={compact ? 'ghost' : 'outline'}
        size="sm"
        className={compact ? 'h-9 w-9 rounded-lg p-0 text-header-text hover:bg-ink/[0.06] hover:text-ink' : 'gap-2'}
        title={compact ? 'Install INVICTUS as an app' : undefined}
        aria-label="Install INVICTUS as an app"
        onClick={async () => {
          if (installEvent) {
            await installEvent.prompt();
            setInstallEvent(null);
          } else {
            setShowInstructions(true);
          }
        }}
      >
        <Download className="h-4 w-4" />
        {!compact && 'Install App'}
      </Button>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install INVICTUS</DialogTitle>
            <DialogDescription>
              {platform === 'ios'
                ? 'Add it to your home screen for quick, full-screen access.'
                : 'Add it to your device for quick, app-like access.'}
            </DialogDescription>
          </DialogHeader>
          {platform === 'ios' ? (
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span>
                Tap the <Share className="mx-1 inline h-4 w-4" /> Share button in Safari&apos;s toolbar.
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>
                Scroll down and tap <Plus className="mx-1 inline h-4 w-4" /> <strong>Add to Home Screen</strong>.
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">3</span>
                Tap <strong>Add</strong> to confirm.
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span>
                Open your browser&apos;s menu <MoreVertical className="mx-1 inline h-4 w-4" /> (or the address-bar install icon).
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span>
                Choose <strong>Add to Home Screen</strong> or <strong>Install App</strong>.
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

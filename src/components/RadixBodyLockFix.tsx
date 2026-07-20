'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Radix portals (Select/Dialog/DropdownMenu — used by the sidebar's mobile
// menu, the account menu, and the "Add checklist/audit" category pickers)
// lock the body — `pointer-events: none` plus a scroll-lock attribute —
// while open, and undo it again when they close normally. Navigating away
// while one is still open or mid-close (e.g. clicking a sidebar link right
// after picking a dropdown option) can skip that cleanup, leaving the whole
// page unresponsive to clicks until a refresh. Force-clear the lock on every
// route change so a stuck lock never survives a navigation.
export function RadixBodyLockFix() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.removeProperty('pointer-events');
    document.body.removeAttribute('data-scroll-locked');
  }, [pathname]);

  return null;
}

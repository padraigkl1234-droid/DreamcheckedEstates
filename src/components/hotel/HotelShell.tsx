'use client';

// The hotel hub's own navigation: a bar under the app header on
// desktop/tablet — the same place and style as the estates sub-nav, so the
// two halves of the app share one shell — and a bottom tab bar on phones
// (one-handed reach). Either way it shows only what the signed-in person's
// hotel role uses.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  BedDouble,
  FileText,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  UserCheck,
  WifiOff,
  Wrench,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHotel } from '@/components/hotel/HotelProvider';
import { ROLE_LABELS } from '@/lib/hotel/constants';
import { pendingPhotoCount } from '@/lib/hotel/photos';
import type { HotelRole } from '@/lib/hotel/types';

interface HotelNavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  roles: HotelRole[];
  /** Roles for whom this sits under "More" on the phone tab bar. */
  moreFor?: HotelRole[];
}

export const HOTEL_NAV: HotelNavItem[] = [
  { href: '/hotel/board', label: 'Today', icon: LayoutGrid, roles: ['manager'] },
  { href: '/hotel/assign', label: 'Assign', icon: UserCheck, roles: ['manager'] },
  { href: '/hotel/my-tasks', label: 'My tasks', icon: ListChecks, roles: ['manager', 'housekeeper'], moreFor: ['manager'] },
  { href: '/hotel/maintenance', label: 'Faults', icon: Wrench, roles: ['manager', 'maintenance'] },
  { href: '/hotel/compliance', label: 'Compliance', icon: ShieldCheck, roles: ['manager', 'maintenance'] },
  { href: '/hotel/report', label: 'Report fault', icon: AlertTriangle, roles: ['manager', 'housekeeper', 'maintenance'], moreFor: ['manager'] },
  { href: '/hotel/summary', label: 'End of day', icon: FileText, roles: ['manager'], moreFor: ['manager'] },
  { href: '/hotel/settings', label: 'Settings', icon: Settings, roles: ['manager'], moreFor: ['manager'] },
];

/** Where each role lands when they open the hub. */
export const HOME_FOR_ROLE: Record<HotelRole, string> = {
  manager: '/hotel/board',
  housekeeper: '/hotel/my-tasks',
  maintenance: '/hotel/maintenance',
};

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function usePendingPhotos() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => void pendingPhotoCount().then(setCount).catch(() => setCount(0));
    update();
    window.addEventListener('hotel-outbox-changed', update);
    window.addEventListener('online', update);
    const timer = window.setInterval(update, 15_000);
    return () => {
      window.removeEventListener('hotel-outbox-changed', update);
      window.removeEventListener('online', update);
      window.clearInterval(timer);
    };
  }, []);
  return count;
}

export function HotelShell({ children }: { children: React.ReactNode }) {
  const { role, teamName } = useHotel();
  const pathname = usePathname();
  const online = useOnline();
  const pendingPhotos = usePendingPhotos();

  const items = role ? HOTEL_NAV.filter((i) => i.roles.includes(role)) : [];
  const primary = items.filter((i) => !role || !i.moreFor?.includes(role));
  const more = items.filter((i) => role && i.moreFor?.includes(role));
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="flex min-h-[calc(100vh-var(--chrome-h))] flex-col bg-invictus-base font-sans text-ink md:h-[calc(100vh-var(--chrome-h))]">
      {/* The hub's own bar, sitting under the app header in the same place
          and style as the Actions sub-nav on the estates side — so the whole
          app reads as one shell rather than two. The side rail is gone. */}
      {items.length > 0 && (
        <div className="hidden shrink-0 border-b border-line bg-white md:block">
          <nav className="flex h-[50px] items-center gap-0 overflow-x-auto px-8">
            <span className="mr-5 flex shrink-0 items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-dim">
              <BedDouble className="h-4 w-4" />
              <span className="max-w-[14rem] truncate">{teamName}</span>
              {role && <span className="font-bold text-ink-placeholder">· {ROLE_LABELS[role]}</span>}
            </span>
            {items.map((item) => {
              const Icon = item.icon;
              const on = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-[50px] items-center gap-2 whitespace-nowrap border-b-[3px] px-3.5 text-sm font-bold transition-colors duration-[120ms] ${
                    on ? 'border-brand text-ink' : 'border-transparent text-ink-dim hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <main className="relative flex-1 overflow-y-auto pb-24 md:pb-0">
        {(!online || pendingPhotos > 0) && (
          <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-sun bg-sun-panel px-8 py-2.5 text-[13px] font-bold text-sun-ink max-md:px-4">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            {!online
              ? "You're offline. Changes are saved on this device and will sync when you're back online."
              : `Sending ${pendingPhotos} photo${pendingPhotos === 1 ? '' : 's'}…`}
          </div>
        )}
        {children}
      </main>

      {/* Phones keep the bottom tab bar. The handoff doesn't cover the hub on
          a phone, and a thumb-reachable bar beats a dropdown for someone
          working a corridor with a trolley. */}
      {items.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {primary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  active ? 'text-brand' : 'text-ink-dim'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {more.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide ${
                  more.some((m) => isActive(m.href)) ? 'text-brand' : 'text-ink-dim'
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
                More
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-52">
                {more.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} className="cursor-pointer gap-2 py-3 font-semibold">
                        <Icon className="h-4 w-4" /> {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      )}
    </div>
  );
}

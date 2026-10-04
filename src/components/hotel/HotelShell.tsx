'use client';

// The hotel hub's own navigation: a side rail on desktop/tablet and a bottom
// tab bar on phones (one-handed reach), showing only what the signed-in
// person's hotel role uses.

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
import { useProfile } from '@/components/ProfileProvider';
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
  const { role, teamName, chooseHotel } = useHotel();
  const { isMaster } = useProfile();
  const pathname = usePathname();
  const online = useOnline();
  const pendingPhotos = usePendingPhotos();

  const items = role ? HOTEL_NAV.filter((i) => i.roles.includes(role)) : [];
  const primary = items.filter((i) => !role || !i.moreFor?.includes(role));
  const more = items.filter((i) => role && i.moreFor?.includes(role));
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-invictus-base font-sans text-neutral-100 md:h-[calc(100vh-4rem)] md:flex-row">
      <aside className="hidden flex-col border-r border-neutral-400/20 bg-invictus-base/70 shadow-glow-subtle backdrop-blur-xl md:flex md:w-56">
        <div className="flex h-16 items-center gap-2.5 border-b border-neutral-400/20 px-5">
          <BedDouble className="h-5 w-5 shrink-0 text-neutral-100" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-neutral-100">{teamName}</p>
            {role && <p className="text-[10px] uppercase tracking-widest text-neutral-500">{isMaster ? 'Master' : ROLE_LABELS[role]}</p>}
          </div>
        </div>
        {isMaster && (
          <button onClick={() => chooseHotel(null)} className="mx-3 mt-3 rounded-md border border-neutral-400/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 hover:text-neutral-100">
            Switch hotel
          </button>
        )}
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-invictus-crimson-bright/[0.16] text-invictus-crimson-bright'
                    : 'text-neutral-500 hover:bg-invictus-crimson-bright/[0.06] hover:text-neutral-200'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="relative flex-1 overflow-y-auto pb-24 md:pb-0">
        {(!online || pendingPhotos > 0) && (
          <div className="sticky top-16 z-20 flex items-center gap-2 border-b border-amber-400/30 md:top-0 bg-amber-400/10 px-4 py-2 text-xs text-amber-300 backdrop-blur-md">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            {!online
              ? "You're offline. Changes are saved on this device and will sync when you're back online."
              : `Sending ${pendingPhotos} photo${pendingPhotos === 1 ? '' : 's'}…`}
          </div>
        )}
        {isMaster && (
          <div className="flex items-center justify-between border-b border-neutral-400/15 px-4 py-2 text-[11px] text-neutral-500 md:hidden">
            <span>Viewing {teamName} as master</span>
            <button onClick={() => chooseHotel(null)} className="font-semibold uppercase tracking-widest text-invictus-crimson-bright">
              Switch
            </button>
          </div>
        )}
        {children}
      </main>

      {items.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-400/20 bg-invictus-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          {primary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
                  active ? 'text-invictus-crimson-bright' : 'text-neutral-500'
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
                className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
                  more.some((m) => isActive(m.href)) ? 'text-invictus-crimson-bright' : 'text-neutral-500'
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
                      <Link href={item.href} className="cursor-pointer gap-2 py-3">
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

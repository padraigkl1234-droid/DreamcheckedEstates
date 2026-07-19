'use client';

// Shared left-hand navigation — the single persistent sidebar used across the
// whole app (the INVICTUS tracker's own tabs, plus the standalone Estate
// Requests / Checklists / Audits pages). Two render modes per item:
//  - Tab items (no `route`) are switched via activePage/onNavigate when
//    rendered inside the tracker itself; from any OTHER page they become a
//    plain link to `/jarvis-tracker?page=<key>` (the tracker already reads
//    that query param on mount).
//  - Route items (`route` set) are always plain links, highlighted by the
//    current pathname — they work identically everywhere.

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Clapperboard,
  Wrench,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  Map as MapIcon,
  ShieldCheck,
  Archive,
  FileText,
  UserCog,
  ChevronDown,
  Cloud,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Pinwheel } from '@/components/icons/Pinwheel';
import { useSound } from '@/components/SoundProvider';
import { usePreferences } from '@/components/PreferencesProvider';
import { useT } from '@/components/LanguageProvider';
import { featureEnabled, type TeamFeatures } from '@/lib/teams';
import type { User } from '@/lib/firebase';

export type PageKey =
  | 'dashboard'
  | 'calendar'
  | 'shows'
  | 'estateRequests'
  | 'checklists'
  | 'audits'
  | 'tasks'
  | 'sitemap'
  | 'compliance'
  | 'archive'
  | 'reports'
  | 'admin';

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof LayoutDashboard;
  gapBefore?: boolean;
  adminOnly?: boolean;
  feature?: string;
  route?: string; // present => always a plain link, not an activePage tab
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays, feature: 'calendar' },
  { key: 'shows', label: 'Show Board', icon: Clapperboard, feature: 'showBoard' },
  { key: 'estateRequests', label: 'Estate Requests', icon: Wrench, feature: 'estateRequests', route: '/estate-requests' },
  { key: 'checklists', label: 'Checklists', icon: ClipboardCheck, feature: 'checklists', route: '/checklists' },
  { key: 'audits', label: 'Audits', icon: ClipboardList, feature: 'audits', route: '/audits' },
  { key: 'tasks', label: 'Task Manager', icon: ListChecks, feature: 'taskManager' },
  { key: 'sitemap', label: 'Site Map', icon: MapIcon, feature: 'siteMap' },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck, feature: 'compliance' },
  { key: 'archive', label: 'Archive', icon: Archive, gapBefore: true, feature: 'archive' },
  { key: 'reports', label: 'Reports', icon: FileText, feature: 'reports' },
  { key: 'admin', label: 'Team Control', icon: UserCog, gapBefore: true, adminOnly: true },
];

// Maps each sidebar entry to its i18n key — shared by the desktop rail and the
// mobile section-picker dropdown so both stay in sync.
export const NAV_LABEL_KEYS: Record<PageKey, string> = {
  dashboard: 'nav.dashboard',
  calendar: 'nav.calendar',
  shows: 'nav.showBoard',
  estateRequests: 'nav.estateRequests',
  checklists: 'nav.checklists',
  audits: 'nav.audits',
  tasks: 'nav.taskManager',
  sitemap: 'nav.siteMap',
  compliance: 'nav.compliance',
  archive: 'nav.archive',
  reports: 'nav.reports',
  admin: 'nav.teamControl',
};

// Nav items visible to this user: admin-only entries need isAdmin, and
// feature-gated entries need the team feature enabled (master sees all).
export function getVisibleNavItems(isAdmin: boolean, features: TeamFeatures | undefined, isMaster: boolean) {
  return NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.feature || isMaster || featureEnabled(features, item.feature))
  );
}

interface SharedNavProps {
  // Only meaningful when rendered inside the tracker itself (jarvis-tracker).
  // Omit both on every other page — tab items then render as links to
  // /jarvis-tracker?page=<key> instead.
  activePage?: PageKey;
  onNavigate?: (page: PageKey) => void;
  isAdmin?: boolean;
  features?: TeamFeatures;
  isMaster?: boolean;
}

export function AppSidebar({
  activePage,
  onNavigate,
  user,
  syncStatus,
  syncError,
  isAdmin = false,
  features,
  isMaster = false,
}: SharedNavProps & {
  user?: User | null;
  syncStatus?: 'idle' | 'loading' | 'synced' | 'error';
  syncError?: string | null;
}) {
  const { playHover } = useSound();
  const t = useT();
  const { online } = usePreferences();
  const pathname = usePathname();
  const navItems = getVisibleNavItems(isAdmin, features, isMaster);

  return (
    // Desktop-only: the permanent icon/label rail. Hidden below md — mobile
    // gets its own compact dropdown nav instead (see AppMobileNav).
    <aside className="hidden md:flex md:w-60 flex-col border-r border-neutral-400/20 bg-invictus-base/70 shadow-glow-subtle backdrop-blur-xl">
      <div className="flex h-16 items-center justify-center gap-2.5 border-b border-neutral-400/20 px-2 md:justify-start md:px-5">
        <Pinwheel className="h-6 w-6 text-neutral-100" />
        <p className="hidden text-lg font-bold tracking-tight text-neutral-100 md:block">Invictus</p>
      </div>

      <nav className="flex flex-col gap-1 p-2 md:p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.route ? pathname === item.route : activePage === item.key;
          const className = `flex items-center justify-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors md:justify-start ${
            active
              ? 'bg-invictus-crimson-bright/[0.16] text-invictus-crimson-bright'
              : 'text-neutral-500 hover:bg-invictus-crimson-bright/[0.06] hover:text-neutral-200'
          }`;
          const content = (
            <>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{t(NAV_LABEL_KEYS[item.key])}</span>
            </>
          );
          return (
            <React.Fragment key={item.key}>
              {item.gapBefore && <div className="mx-1 my-2 border-t border-neutral-400/15" />}
              {item.route ? (
                <Link href={item.route} onMouseEnter={playHover} className={className}>
                  {content}
                </Link>
              ) : onNavigate ? (
                <button onClick={() => onNavigate(item.key)} onMouseEnter={playHover} className={className}>
                  {content}
                </button>
              ) : (
                <Link href={`/jarvis-tracker?page=${item.key}`} onMouseEnter={playHover} className={className}>
                  {content}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-400/20 p-3">
        <div className="flex items-center justify-center gap-2 md:justify-start">
          <span className="relative flex h-2 w-2">
            {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </span>
          <span className={`hidden text-[10px] uppercase tracking-widest md:inline ${online ? 'text-emerald-400' : 'text-amber-400'}`}>
            {online ? t('status.online') : t('settings.offline')}
          </span>
        </div>
        {syncStatus !== undefined && (
          <div className="mt-2 flex items-center justify-center gap-2 md:justify-start">
            <Cloud
              className={`h-3.5 w-3.5 ${
                !user
                  ? 'text-neutral-700'
                  : syncStatus === 'error'
                  ? 'text-alert'
                  : syncStatus === 'loading'
                  ? 'animate-pulse text-invictus-crimson-bright'
                  : 'text-emerald-400'
              }`}
            />
            <span
              className={`hidden text-[10px] uppercase tracking-widest md:inline ${
                !user
                  ? 'text-neutral-700'
                  : syncStatus === 'error'
                  ? 'text-alert'
                  : syncStatus === 'loading'
                  ? 'text-invictus-crimson-bright'
                  : 'text-emerald-400'
              }`}
            >
              {!user
                ? t('status.signInToSave')
                : syncStatus === 'error'
                ? t('status.syncError')
                : syncStatus === 'loading'
                ? t('status.syncing')
                : t('status.progressSaved')}
            </span>
          </div>
        )}
        {user && syncStatus === 'error' && syncError && (
          <p className="mt-1 hidden break-words text-[9px] leading-snug text-alert/80 md:block" title={syncError}>
            {syncError}
          </p>
        )}
      </div>
    </aside>
  );
}

// Mobile-only section picker: replaces the desktop rail with a compact
// dropdown so the section list doesn't eat screen width on a phone. Hidden at
// md and up, where AppSidebar takes over.
export function AppMobileNav({ activePage, onNavigate, isAdmin = false, features, isMaster = false }: SharedNavProps) {
  const t = useT();
  const pathname = usePathname();
  const navItems = getVisibleNavItems(isAdmin, features, isMaster);
  const current = activePage
    ? navItems.find((item) => item.key === activePage)
    : navItems.find((item) => item.route === pathname);
  const CurrentIcon = current?.icon ?? LayoutDashboard;

  return (
    <div className="flex items-center border-b border-neutral-400/20 bg-invictus-base/70 px-3 py-2 shadow-glow-subtle backdrop-blur-xl md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex min-h-[44px] items-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-200 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
            aria-label="Choose section"
          >
            <CurrentIcon className="h-4 w-4 shrink-0 text-invictus-crimson-bright" />
            <span className="truncate">{current ? t(NAV_LABEL_KEYS[current.key]) : 'Menu'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.route ? pathname === item.route : activePage === item.key;
            const label = (
              <>
                <Icon className="h-4 w-4 shrink-0" />
                {t(NAV_LABEL_KEYS[item.key])}
              </>
            );
            return item.route ? (
              <DropdownMenuItem key={item.key} asChild className={`min-h-[44px] cursor-pointer gap-3 text-sm ${active ? 'bg-accent text-accent-foreground' : ''}`}>
                <Link href={item.route}>{label}</Link>
              </DropdownMenuItem>
            ) : onNavigate ? (
              <DropdownMenuItem
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`min-h-[44px] cursor-pointer gap-3 text-sm ${active ? 'bg-accent text-accent-foreground' : ''}`}
              >
                {label}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem key={item.key} asChild className="min-h-[44px] cursor-pointer gap-3 text-sm">
                <Link href={`/jarvis-tracker?page=${item.key}`}>{label}</Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

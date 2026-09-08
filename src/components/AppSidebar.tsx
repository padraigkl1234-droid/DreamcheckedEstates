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
//
// Related items are grouped under a collapsible header (see NAV_GROUPS) so
// the rail doesn't read as one long flat list. Grouping is purely a
// *presentation* concern here — PageKey, routing and feature-gating all
// still come from the flat NAV_ITEMS below, unchanged by which group (if
// any) an item is shown under.

import React, { useEffect, useState } from 'react';
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
  SearchCheck,
  ShieldCheck,
  Archive,
  FileText,
  UserCog,
  ChevronDown,
  Cloud,
  Radio,
  Users,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  | 'eventMode'
  | 'estateRequests'
  | 'checklists'
  | 'inspections'
  | 'audits'
  | 'incidents'
  | 'assignments'
  | 'tasks'
  | 'sitemap'
  | 'team'
  | 'compliance'
  | 'archive'
  | 'reports'
  | 'admin';

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  feature?: string;
  route?: string; // present => always a plain link, not an activePage tab
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays, feature: 'calendar' },
  { key: 'shows', label: 'Show Board', icon: Clapperboard, feature: 'showBoard' },
  { key: 'eventMode', label: 'Event Mode', icon: Radio, feature: 'eventMode', route: '/event-mode' },
  { key: 'estateRequests', label: 'Estate Requests', icon: Wrench, feature: 'estateRequests', route: '/estate-requests' },
  { key: 'checklists', label: 'Checklists', icon: ClipboardCheck, feature: 'checklists', route: '/checklists' },
  { key: 'inspections', label: 'Inspections', icon: SearchCheck, feature: 'inspections', route: '/inspections' },
  { key: 'audits', label: 'Audits', icon: ClipboardList, feature: 'audits', route: '/audits' },
  { key: 'incidents', label: 'Incident Reports', icon: AlertTriangle, feature: 'incidents', route: '/incidents' },
  { key: 'assignments', label: 'Assignments', icon: UserCheck, feature: 'assignments', route: '/assignments' },
  { key: 'tasks', label: 'Task Manager', icon: ListChecks, feature: 'taskManager' },
  { key: 'sitemap', label: 'Site Map', icon: MapIcon, feature: 'siteMap' },
  { key: 'team', label: 'Team', icon: Users, feature: 'team', route: '/team' },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck, feature: 'compliance' },
  { key: 'archive', label: 'Archive', icon: Archive, feature: 'archive' },
  { key: 'reports', label: 'Reports', icon: FileText, feature: 'reports' },
  { key: 'admin', label: 'Team Control', icon: UserCog, adminOnly: true },
];

// Maps each sidebar entry to its i18n key — shared by the desktop rail and the
// mobile section-picker dropdown so both stay in sync.
export const NAV_LABEL_KEYS: Record<PageKey, string> = {
  dashboard: 'nav.dashboard',
  calendar: 'nav.calendar',
  shows: 'nav.showBoard',
  eventMode: 'nav.eventMode',
  estateRequests: 'nav.estateRequests',
  checklists: 'nav.checklists',
  inspections: 'nav.inspections',
  audits: 'nav.audits',
  incidents: 'nav.incidents',
  assignments: 'nav.assignments',
  tasks: 'nav.taskManager',
  sitemap: 'nav.siteMap',
  team: 'nav.team',
  compliance: 'nav.compliance',
  archive: 'nav.archive',
  reports: 'nav.reports',
  admin: 'nav.teamControl',
};

// Collapsible groups shown on the rail — purely a layout grouping of the
// PageKeys above. Add a new group here (and to NAV_LAYOUT below) rather than
// growing the flat list further as more pages arrive.
export type NavGroupKey = 'events' | 'actions';

interface NavGroup {
  key: NavGroupKey;
  labelKey: string;
  icon: typeof LayoutDashboard;
  items: PageKey[];
}

const NAV_GROUPS: NavGroup[] = [
  { key: 'events', labelKey: 'nav.group.events', icon: Clapperboard, items: ['shows', 'eventMode'] },
  {
    key: 'actions',
    labelKey: 'nav.group.actions',
    icon: ClipboardCheck,
    items: ['checklists', 'inspections', 'estateRequests', 'audits', 'incidents', 'assignments', 'compliance'],
  },
];

// Top-level rail order: standalone PageKeys interleaved with group keys at
// the position their contents used to occupy.
const NAV_LAYOUT: { key: PageKey | NavGroupKey; gapBefore?: boolean }[] = [
  { key: 'dashboard' },
  { key: 'calendar' },
  { key: 'events' },
  { key: 'actions' },
  { key: 'tasks' },
  { key: 'sitemap' },
  { key: 'team' },
  { key: 'archive', gapBefore: true },
  { key: 'reports' },
  { key: 'admin', gapBefore: true },
];

type NavLayoutEntry =
  | { type: 'item'; item: NavItem; gapBefore?: boolean }
  | { type: 'group'; key: NavGroupKey; labelKey: string; icon: typeof LayoutDashboard; items: NavItem[]; gapBefore?: boolean };

// Nav items visible to this user: admin-only entries need isAdmin, and
// feature-gated entries need the team feature enabled (master sees all).
export function getVisibleNavItems(isAdmin: boolean, features: TeamFeatures | undefined, isMaster: boolean) {
  return NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.feature || isMaster || featureEnabled(features, item.feature))
  );
}

// Same visibility rule as above, but laid out into the top-level rail order
// with related items nested under their group. A group with nothing visible
// inside it (e.g. every "Actions" page disabled for this team) is omitted
// entirely rather than showing an empty header.
function getVisibleNavLayout(isAdmin: boolean, features: TeamFeatures | undefined, isMaster: boolean): NavLayoutEntry[] {
  const isVisible = (item: NavItem) => (!item.adminOnly || isAdmin) && (!item.feature || isMaster || featureEnabled(features, item.feature));
  const byKey = new Map(NAV_ITEMS.map((i) => [i.key, i] as const));
  const groupsByKey = new Map(NAV_GROUPS.map((g) => [g.key, g] as const));
  const entries: NavLayoutEntry[] = [];
  for (const layout of NAV_LAYOUT) {
    const group = groupsByKey.get(layout.key as NavGroupKey);
    if (group) {
      const items = group.items.map((k) => byKey.get(k)).filter((i): i is NavItem => !!i && isVisible(i));
      if (items.length > 0) {
        entries.push({ type: 'group', key: group.key, labelKey: group.labelKey, icon: group.icon, items, gapBefore: layout.gapBefore });
      }
      continue;
    }
    const item = byKey.get(layout.key as PageKey);
    if (item && isVisible(item)) entries.push({ type: 'item', item, gapBefore: layout.gapBefore });
  }
  return entries;
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
  const layout = getVisibleNavLayout(isAdmin, features, isMaster);

  const isItemActive = (item: NavItem) => (item.route ? pathname === item.route : activePage === item.key);

  // Collapsed by default; a group auto-opens the moment one of its items
  // becomes the active page, but never auto-collapses on its own — only the
  // header toggle does that — so navigating around doesn't fight the user.
  const [expandedGroups, setExpandedGroups] = useState<Set<NavGroupKey>>(() => {
    const initial = new Set<NavGroupKey>();
    for (const entry of layout) {
      if (entry.type === 'group' && entry.items.some(isItemActive)) initial.add(entry.key);
    }
    return initial;
  });

  useEffect(() => {
    for (const entry of layout) {
      if (entry.type !== 'group') continue;
      if (entry.items.some(isItemActive)) {
        setExpandedGroups((prev) => (prev.has(entry.key) ? prev : new Set(prev).add(entry.key)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, pathname]);

  const toggleGroup = (key: NavGroupKey) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderItem = (item: NavItem, indent?: boolean) => {
    const Icon = item.icon;
    const active = isItemActive(item);
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
    const el = item.route ? (
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
    );
    return indent ? (
      <div key={item.key} className="border-l border-neutral-400/15 pl-3">
        {el}
      </div>
    ) : (
      <React.Fragment key={item.key}>{el}</React.Fragment>
    );
  };

  return (
    // Desktop-only: the permanent icon/label rail. Hidden below md — mobile
    // gets its own compact dropdown nav instead (see AppMobileNav).
    <aside className="hidden md:flex md:w-60 flex-col border-r border-neutral-400/20 bg-invictus-base/70 shadow-glow-subtle backdrop-blur-xl">
      <div className="flex h-16 items-center justify-center gap-2.5 border-b border-neutral-400/20 px-2 md:justify-start md:px-5">
        <Pinwheel className="h-6 w-6 text-neutral-100" />
        <p className="hidden text-lg font-bold tracking-tight text-neutral-100 md:block">Invictus</p>
      </div>

      <nav className="flex flex-col gap-1 p-2 md:p-3">
        {layout.map((entry) => {
          if (entry.type === 'item') {
            return (
              <React.Fragment key={entry.item.key}>
                {entry.gapBefore && <div className="mx-1 my-2 border-t border-neutral-400/15" />}
                {renderItem(entry.item)}
              </React.Fragment>
            );
          }
          const GroupIcon = entry.icon;
          const expanded = expandedGroups.has(entry.key);
          const groupActive = entry.items.some(isItemActive);
          return (
            <React.Fragment key={entry.key}>
              {entry.gapBefore && <div className="mx-1 my-2 border-t border-neutral-400/15" />}
              <button
                onClick={() => toggleGroup(entry.key)}
                onMouseEnter={playHover}
                className={`flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors ${
                  groupActive && !expanded ? 'text-neutral-200' : 'text-neutral-500 hover:bg-invictus-crimson-bright/[0.06] hover:text-neutral-200'
                }`}
              >
                <span className="flex items-center justify-center gap-3 md:justify-start">
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{t(entry.labelKey)}</span>
                </span>
                <ChevronDown
                  className={`hidden h-3.5 w-3.5 shrink-0 text-neutral-600 transition-transform duration-200 md:inline ${
                    expanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {expanded && <div className="ml-4 flex flex-col gap-1">{entry.items.map((item) => renderItem(item, true))}</div>}
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
// md and up, where AppSidebar takes over. Groups render as a plain label
// above their items — the menu already closes on pick, so there's no need
// for the desktop rail's collapse/expand state here.
export function AppMobileNav({ activePage, onNavigate, isAdmin = false, features, isMaster = false }: SharedNavProps) {
  const t = useT();
  const pathname = usePathname();
  const navItems = getVisibleNavItems(isAdmin, features, isMaster);
  const layout = getVisibleNavLayout(isAdmin, features, isMaster);
  const current = activePage
    ? navItems.find((item) => item.key === activePage)
    : navItems.find((item) => item.route === pathname);
  const CurrentIcon = current?.icon ?? LayoutDashboard;

  const isItemActive = (item: NavItem) => (item.route ? pathname === item.route : activePage === item.key);

  const renderItem = (item: NavItem, indent?: boolean) => {
    const Icon = item.icon;
    const active = isItemActive(item);
    const label = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        {t(NAV_LABEL_KEYS[item.key])}
      </>
    );
    const cls = `min-h-[44px] cursor-pointer gap-3 text-sm ${indent ? 'pl-8' : ''} ${active ? 'bg-accent text-accent-foreground' : ''}`;
    if (item.route) {
      return (
        <DropdownMenuItem key={item.key} asChild className={cls}>
          <Link href={item.route}>{label}</Link>
        </DropdownMenuItem>
      );
    }
    if (onNavigate) {
      return (
        <DropdownMenuItem key={item.key} onClick={() => onNavigate(item.key)} className={cls}>
          {label}
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem key={item.key} asChild className={cls}>
        <Link href={`/jarvis-tracker?page=${item.key}`}>{label}</Link>
      </DropdownMenuItem>
    );
  };

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
          {layout.map((entry) => {
            if (entry.type === 'item') return renderItem(entry.item);
            const GroupIcon = entry.icon;
            return (
              <React.Fragment key={entry.key}>
                <DropdownMenuLabel className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                  <GroupIcon className="h-3.5 w-3.5 shrink-0" /> {t(entry.labelKey)}
                </DropdownMenuLabel>
                {entry.items.map((item) => renderItem(item, true))}
              </React.Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

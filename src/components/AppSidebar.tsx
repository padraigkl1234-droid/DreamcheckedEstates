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
  Ban,
  Pin,
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
  History,
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
  | 'showLog'
  | 'eventMode'
  | 'estateRequests'
  | 'checklists'
  | 'inspections'
  | 'audits'
  | 'incidents'
  | 'assignments'
  | 'tasks'
  | 'sitemap'
  | 'siteStatus'
  | 'projectBoard'
  | 'team'
  | 'compliance'
  | 'archive'
  | 'reports'
  | 'admin';

export interface NavItem {
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
  { key: 'showLog', label: 'Show Log', icon: History, feature: 'showLog' },
  { key: 'eventMode', label: 'Event Mode', icon: Radio, feature: 'eventMode', route: '/event-mode' },
  { key: 'estateRequests', label: 'Estate Requests', icon: Wrench, feature: 'estateRequests', route: '/estate-requests' },
  { key: 'checklists', label: 'Checklists', icon: ClipboardCheck, feature: 'checklists', route: '/checklists' },
  { key: 'inspections', label: 'Inspections', icon: SearchCheck, feature: 'inspections', route: '/inspections' },
  { key: 'audits', label: 'Audits', icon: ClipboardList, feature: 'audits', route: '/audits' },
  { key: 'incidents', label: 'Incident Reports', icon: AlertTriangle, feature: 'incidents', route: '/incidents' },
  { key: 'assignments', label: 'Assignments', icon: UserCheck, feature: 'assignments', route: '/assignments' },
  { key: 'tasks', label: 'Task Manager', icon: ListChecks, feature: 'taskManager' },
  { key: 'sitemap', label: 'Site Map', icon: MapIcon, feature: 'siteMap' },
  { key: 'siteStatus', label: 'Site Status', icon: Ban, feature: 'siteStatus', route: '/site-status' },
  { key: 'projectBoard', label: 'Project Board', icon: Pin, feature: 'projectBoard', route: '/project-board' },
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
  showLog: 'nav.showLog',
  eventMode: 'nav.eventMode',
  estateRequests: 'nav.estateRequests',
  checklists: 'nav.checklists',
  inspections: 'nav.inspections',
  audits: 'nav.audits',
  incidents: 'nav.incidents',
  assignments: 'nav.assignments',
  tasks: 'nav.taskManager',
  sitemap: 'nav.siteMap',
  siteStatus: 'nav.siteStatus',
  projectBoard: 'nav.projectBoard',
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

export const NAV_GROUPS: NavGroup[] = [
  { key: 'events', labelKey: 'nav.group.events', icon: Clapperboard, items: ['shows', 'showLog', 'eventMode'] },
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
  { key: 'siteStatus' },
  { key: 'projectBoard' },
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

// --- Deprecated shells -----------------------------------------------------
// The redesign replaces the left rail and the phone section-picker with the
// top bar in AppHeader, which reads the same NAV_ITEMS / NAV_GROUPS above.
// These two are kept as no-ops so every page that still renders them keeps
// compiling and simply has no sidebar; the props are accepted and ignored.

export function AppSidebar(_props: SharedNavProps & Record<string, unknown>) {
  return null;
}

export function AppMobileNav(_props: SharedNavProps & Record<string, unknown>) {
  return null;
}

'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { zonePlanFor } from '@/lib/zonePlans';

// Zones with a registered 2.5D floor plan (see lib/zonePlans.ts) get a
// drill-down link from their grid square's side panel. Add an entry here
// alongside the plan itself when a new zone gets one.
const ZONE_PLAN_ROUTES: Record<string, string> = {
  Ballroom: '/site-map/ballroom',
  Boardroom: '/site-map/boardroom',
  Concourse: '/site-map/concourse',
  Arcade: '/site-map/arcade',
  'Hall by the Sea': '/site-map/hall-by-the-sea',
};
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, onSnapshot, query, where, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, type User } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useSound } from '@/components/SoundProvider';
import { BRAND_NAME, BRAND_NAME_DOTTED } from '@/lib/brand';
import { CHECKLIST_SECTIONS, type ChecklistSection } from '@/lib/checklists';
import { DREAMLAND_TEAM_ID, featureEnabled, type TeamFeatures } from '@/lib/teams';
import { useProfile } from '@/components/ProfileProvider';
import { useT } from '@/components/LanguageProvider';
import { usePreferences } from '@/components/PreferencesProvider';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { drawDreamlandWordmark, drawInvictusCorner, drawInvictusFooter } from '@/lib/brandMark';
import { InvictusSelect } from '@/components/InvictusSelect';
import { ReportsView, type ReportDraft } from '@/components/ReportsView';
import { Pinwheel } from '@/components/icons/Pinwheel';
import { AppSidebar, AppMobileNav, NAV_ITEMS, type PageKey } from '@/components/AppSidebar';
import {
  type ComplianceItem,
  type ComplianceAttachment,
  type ComplianceUrgency,
  getOutstandingCompliances,
  getComplianceAttachments,
} from '@/lib/complianceCountdown';
import {
  Power,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Plus,
  Trash2,
  Wifi,
  Newspaper,
  CheckCircle2,
  Circle,
  AlertTriangle,
  X,
  Gauge,
  ExternalLink,
  Cloud,
  Droplets,
  Eye,
  Wind,
  Music2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Archive,
  ArchiveRestore,
  FileText,
  Search,
  Download,
  Repeat,
  Check,
  Map as MapIcon,
  MapPin,
  Clapperboard,
  Users,
  UserPlus,
  Inbox,
  Pencil,
  UserCog,
  ShieldOff,
  Paperclip,
  Loader2,
  ImagePlus,
  ChevronDown,
  Tag,
  Package,
  MessageSquarePlus,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';
// A scheduled show. `type` matches a CHECKLIST_SECTIONS name and `completed`
// maps each checklist's name to whether its light is green. Structured this way
// so a future Power Automate feed can flip lights by writing to `completed`.
interface Show {
  id: string;
  date: string;
  type: string;
  title?: string;
  completed: Record<string, boolean>;
}

interface Task {
  id: string;
  name: string;
  priority: Priority;
  dueDate: string;
  status: TaskStatus;
  archivedAt?: number;
  completedAt?: number;
  createdAt?: number;
  category?: string;
  notes?: string;
  images?: TaskImage[]; // photos attached to the task
  materials?: TaskMaterial[]; // parts/products needed to do the task
  updates?: TaskUpdate[]; // timestamped additions to the description, oldest first
  source?: 'estateRequest'; // created by an intake webhook rather than a person
  area?: string; // Dreamland site-map zone this task is pinned to, if any
  // --- Sharing (tasks live in a shared `tasks` collection, private by default) ---
  ownerUid?: string;
  ownerName?: string;
  participants?: string[]; // uids who can see this task (owner + anyone who accepted)
  participantNames?: Record<string, string>;
  pendingUids?: string[]; // people this task is offered to, each awaiting their own accept
  pendingNames?: Record<string, string>;
  archived?: boolean;
}

interface TaskImage {
  url: string;
  path: string; // storage path, for deletion
  uploadedAt: number;
}

// A product/part needed to complete a task. Price is per-unit, so the line
// total is price × quantity; both price and url are optional, since you often
// know what you need before you've found where to buy it.
interface TaskMaterial {
  id: string;
  name: string;
  url?: string;
  price?: number;
  quantity: number;
}

// One dated addition to a task's description. Entries are append-only — the
// point is the audit trail, so they're never edited in place, only added to.
interface TaskUpdate {
  id: string;
  text: string;
  at: number;
  byUid?: string;
  byName?: string;
}

function formatUpdateStamp(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' }
  )}`;
}

// Materials are priced in GBP — this app is used by a UK operator.
function formatMoney(value: number): string {
  return `£${value.toFixed(2)}`;
}

// Short form for map badges, where there's only room for a few characters.
function formatMoneyCompact(value: number): string {
  if (value >= 1000) return `£${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(value)}`;
}

function materialsTotal(materials: TaskMaterial[] | undefined): number {
  return (materials ?? []).reduce((sum, m) => sum + (m.price ?? 0) * (m.quantity || 1), 0);
}

// A user who has signed in at least once — the assignable-people roster.
interface TeamMember {
  uid: string;
  name: string;
  email?: string | null;
  role?: string;
  blocked?: boolean;
  lastSeen?: number;
}

type RecurrenceFreq = 'weekly' | 'fortnightly' | 'monthly';

interface EventRecurrence {
  freq: RecurrenceFreq;
  until: string; // ISO date, inclusive
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // first occurrence
  time?: string; // optional start time, "HH:MM" 24h
  priority: Priority;
  notes: string;
  recurrence?: EventRecurrence;
  completedDates?: string[]; // occurrence dates (YYYY-MM-DD) ticked off as done
}

// Turn a 24h "HH:MM" string into a friendly "2:30 PM". Returns '' if empty/bad.
function formatDisplayTime(time: string | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function addRecurrenceStep(d: Date, freq: RecurrenceFreq): Date {
  if (freq === 'weekly') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  if (freq === 'fortnightly') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14);
  return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Expands a (possibly recurring) event into every occurrence date that falls within [rangeStart, rangeEnd].
function getOccurrencesInRange(event: CalendarEvent, rangeStart: string, rangeEnd: string): string[] {
  if (!event.recurrence) {
    return event.date >= rangeStart && event.date <= rangeEnd ? [event.date] : [];
  }
  const occurrences: string[] = [];
  const until = event.recurrence.until && event.recurrence.until < rangeEnd ? event.recurrence.until : rangeEnd;
  const [y, m, d] = event.date.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  while (toDateInputValue(cur) <= until) {
    const curStr = toDateInputValue(cur);
    if (curStr >= rangeStart && curStr >= event.date) occurrences.push(curStr);
    cur = addRecurrenceStep(cur, event.recurrence.freq);
  }
  return occurrences;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const SEED_TASKS: Task[] = [
  { id: 't1', name: 'Inspect rooftop HVAC unit 4', priority: 'High', dueDate: '2026-06-20', status: 'In Progress' },
  { id: 't2', name: 'Replace lobby lighting fixtures', priority: 'Medium', dueDate: '2026-06-22', status: 'Not Started' },
  { id: 't3', name: 'Service car park barrier system', priority: 'Low', dueDate: '2026-06-25', status: 'Completed', completedAt: Date.now() - 5 * DAY_MS },
  { id: 't4', name: 'Audit fire extinguisher inventory', priority: 'High', dueDate: '2026-06-19', status: 'Completed', completedAt: Date.now() - 2 * DAY_MS },
];

const SEED_EVENTS: CalendarEvent[] = [
  { id: 'e1', title: 'Ansul Meeting', date: '2026-06-20', priority: 'High', notes: 'It is with Paul A.' },
];

// Compliance divisions, shown in this order in the tracker. Items are sorted into
// a division by keyword on their name, so seeded, Firestore-loaded and custom
// items all group consistently without needing a stored field.
const COMPLIANCE_DIVISION_ORDER = [
  'Fire Safety',
  'Electrical',
  'Mechanical & Plant',
  'Lifting & Access',
  'Water Hygiene',
  'Security & Monitoring',
  'Site & Hazards',
  'General',
] as const;

function classifyComplianceDivision(name: string): string {
  const n = name.toLowerCase();
  if (/fire|ansul|pava|extinguisher|sprinkler|suppression|emergency light/.test(n)) return 'Fire Safety';
  if (/loler|lift|scaffold|hoist|mewp|working at height/.test(n)) return 'Lifting & Access';
  if (/legionella|water hygiene|water sampl|cwst|tank clean/.test(n)) return 'Water Hygiene';
  if (/wiring|pat testing|\bpat\b|generator|lightning|lighting protection|electric|rcbo/.test(n)) return 'Electrical';
  if (/ac system|air con|boiler|hvac|extract|\blev\b|machinery|carpentry|plant|gas safe/.test(n)) return 'Mechanical & Plant';
  if (/cctv|people counter|security|surveillance/.test(n)) return 'Security & Monitoring';
  if (/asbestos|pest/.test(n)) return 'Site & Hazards';
  return 'General';
}

// Per-card stagger timing for the dashboard's reveal animation.
const CARD_REVEAL_STEP_MS = 90;
const CARD_REVEAL_DURATION_MS = 420;

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'text-alert border-alert/30 bg-alert/10',
  Medium: 'text-amber-300 border-amber-400/25 bg-amber-400/10',
  Low: 'text-neutral-400 border-neutral-400/25 bg-neutral-400/10',
};

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

const STATUS_STYLES: Record<TaskStatus, string> = {
  'Not Started': 'text-neutral-400 border-neutral-500/40 bg-neutral-500/10',
  'In Progress': 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  Completed: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

// Order in which task status groups are shown in the Active Tasks list.
const STATUS_ORDER: TaskStatus[] = ['Not Started', 'In Progress', 'Completed'];

const URGENCY_STYLES: Record<ComplianceUrgency, string> = {
  red: 'text-alert border-alert/30 bg-alert/10',
  amber: 'text-amber-300 border-amber-400/25 bg-amber-400/10',
  green: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10',
};

function formatDueIn(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const overdue = Math.abs(daysUntilDue);
    return `Overdue ${overdue}d`;
  }
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  return `Due in ${daysUntilDue}d`;
}

// Whole-day difference between two YYYY-MM-DD strings, ignoring time of day.
function daysFromToday(dateStr: string, todayStr: string): number {
  const [y1, m1, d1] = dateStr.split('-').map(Number);
  const [y2, m2, d2] = todayStr.split('-').map(Number);
  return Math.round((new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime()) / DAY_MS);
}

interface TimelinePoint {
  label: string;
  iso: string;
  tasks: number;
  compliance: number;
}

const TIMELINE_DAYS = 14;

// Buckets completions into a rolling N-day window for the dashboard chart.
// Tasks use their completedAt timestamp (active and archived alike, since
// archiving only hides a task from the active list — it doesn't undo the
// completion); compliance items reuse the existing "Last Completed" date
// field already entered in the tracker.
function buildCompletionTimeline(tasks: Task[], archivedTasks: Task[], compliances: ComplianceItem[]): TimelinePoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: TimelinePoint[] = Array.from({ length: TIMELINE_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (TIMELINE_DAYS - 1 - i));
    return {
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      iso: toDateInputValue(d),
      tasks: 0,
      compliance: 0,
    };
  });

  const indexByIso = new Map(days.map((p, idx) => [p.iso, idx]));

  for (const task of [...tasks, ...archivedTasks]) {
    if (task.status !== 'Completed' || !task.completedAt) continue;
    const idx = indexByIso.get(toDateInputValue(new Date(task.completedAt)));
    if (idx !== undefined) days[idx].tasks += 1;
  }

  for (const item of compliances) {
    if (!item.completed || !item.date) continue;
    const idx = indexByIso.get(item.date);
    if (idx !== undefined) days[idx].compliance += 1;
  }

  return days;
}

interface ReportEntry {
  id: string;
  kind: 'task' | 'compliance';
  name: string;
  completedAt: number;
  hasTimeOfDay: boolean;
  priority?: Priority;
  dueDate?: string;
  nextDueDate?: string;
  comments?: string;
}

// A chronological completion log — one entry per completed task (active or
// archived) and per compliance item marked complete. Compliance items only
// carry a date (no time-of-day), so those entries are flagged accordingly
// rather than implying a precision the source data doesn't have.
function buildReportLog(tasks: Task[], archivedTasks: Task[], compliances: ComplianceItem[]): ReportEntry[] {
  const entries: ReportEntry[] = [];

  for (const task of [...tasks, ...archivedTasks]) {
    if (task.status !== 'Completed' || !task.completedAt) continue;
    entries.push({
      id: `task-${task.id}`,
      kind: 'task',
      name: task.name,
      completedAt: task.completedAt,
      hasTimeOfDay: true,
      priority: task.priority,
      dueDate: task.dueDate,
    });
  }

  for (const item of compliances) {
    if (!item.completed || !item.date) continue;
    const parsed = new Date(`${item.date}T00:00:00`).getTime();
    if (Number.isNaN(parsed)) continue;
    entries.push({
      id: `compliance-${item.id}`,
      kind: 'compliance',
      name: item.name,
      completedAt: parsed,
      hasTimeOfDay: false,
      nextDueDate: item.nextDueDate,
      comments: item.comments,
    });
  }

  return entries.sort((a, b) => b.completedAt - a.completedAt);
}

function genId() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRelativeTime(pubDate: string | null): string {
  if (!pubDate) return '';
  const then = new Date(pubDate).getTime();
  if (Number.isNaN(then)) return '';
  const diffMins = Math.round((Date.now() - then) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// HUD bracket corners (Iron Man style panel frame accents)
// ---------------------------------------------------------------------------

// Decorative HUD corner brackets — removed in the minimal re-skin. Kept as a
// no-op so every call site (there are many) stays valid without edits.
function HudCorners(_props: { tone?: 'crimson' | 'amber' }) {
  return null;
}

// ---------------------------------------------------------------------------
// Telemetry scaffolding — crosshairs, micro corner brackets, serial tags
// ---------------------------------------------------------------------------

function Crosshair({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={`h-2 w-2 shrink-0 ${className}`} fill="none">
      <line x1="5" y1="0" x2="5" y2="3.2" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="6.8" x2="5" y2="10" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="5" x2="3.2" y2="5" stroke="currentColor" strokeWidth="1" />
      <line x1="6.8" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
      <circle cx="5" cy="5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function SysRef({ code, className = '' }: { code: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] tracking-widest text-neutral-500/70 ${className}`}>
      <Crosshair className="text-invictus-crimson-bright/50" />
      SYS_REF: {code}
    </span>
  );
}

function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500 ${className}`}>
      {children}
    </span>
  );
}

// Decorative micro corner brackets — removed in the minimal re-skin (no-op).
function MicroCorners() {
  return null;
}

function ConcentricPulse() {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-invictus-crimson-bright/40 animate-ping"
        style={{ animationDuration: '2.6s' }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-invictus-crimson-bright/25 animate-ping"
        style={{ animationDuration: '2.6s', animationDelay: '0.9s' }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-invictus-crimson-bright/15 animate-ping"
        style={{ animationDuration: '2.6s', animationDelay: '1.8s' }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Boot dial — layered sci-fi HUD reactor ring, rotating clockwise
// ---------------------------------------------------------------------------

// All geometry below is centered on a 200x200 viewBox. Angles are degrees
// clockwise from 12 o'clock so the "letter port" placements below read the
// same way a clock face does.
function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Closed cog outline: alternates outer/inner radius around the circle to
// produce square-toothed gear teeth, matching the blocky HUD aesthetic.
function gearPath(cx: number, cy: number, teeth: number, outerR: number, innerR: number, toothRatio = 0.5) {
  const step = 360 / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * toothRatio;
    const a2 = a0 + step;
    const p0 = polarPoint(cx, cy, outerR, a0);
    const p1 = polarPoint(cx, cy, outerR, a1);
    const p2 = polarPoint(cx, cy, innerR, a1);
    const p3 = polarPoint(cx, cy, innerR, a2);
    d += `${i === 0 ? 'M' : 'L'} ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} `;
    d += `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

// A ring of short radial tick marks; every `longEvery`-th tick is drawn taller
// to read as an instrument bezel rather than a perfectly uniform dial.
function TickRing({ cx, cy, count, rInner, rOuter, longEvery = 5, longExtra = 5, color, opacity = 0.8 }: {
  cx: number;
  cy: number;
  count: number;
  rInner: number;
  rOuter: number;
  longEvery?: number;
  longExtra?: number;
  color: string;
  opacity?: number;
}) {
  const ticks = Array.from({ length: count });
  return (
    <g>
      {ticks.map((_, i) => {
        const angle = (360 / count) * i;
        const isLong = i % longEvery === 0;
        const p0 = polarPoint(cx, cy, rInner - (isLong ? longExtra : 0), angle);
        const p1 = polarPoint(cx, cy, rOuter, angle);
        return (
          <line
            key={i}
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke={color}
            strokeWidth={isLong ? 1.6 : 0.8}
            strokeOpacity={opacity}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

// Fixed (non-rotating) outer frame: lettered ports + small rect glyphs, so
// labels stay upright while the dials beneath them spin.
function HudFrame({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const glyphAngles = [25, 95, 170, 245, 320];

  return (
    <g>
      {glyphAngles.map((angle) => {
        const p = polarPoint(cx, cy, r - 9, angle);
        return (
          <rect
            key={angle}
            x={p.x - 3}
            y={p.y - 1.5}
            width={6}
            height={3}
            fill="rgba(37,99,235,0.5)"
            transform={`rotate(${angle} ${p.x} ${p.y})`}
          />
        );
      })}
    </g>
  );
}

function BootDial({
  onIgnite,
  mode = 'idle',
}: {
  onIgnite: () => void;
  mode?: 'idle' | 'spinup' | 'expand';
}) {
  const cx = 100;
  const cy = 100;
  const spinningUp = mode !== 'idle';

  return (
    <div
      className={`relative h-[240px] w-[240px] shrink-0 transition-all duration-1000 ease-in sm:h-[300px] sm:w-[300px] lg:h-[360px] lg:w-[360px] ${
        mode === 'expand' ? 'scale-[2.4] opacity-0' : 'scale-100 opacity-100'
      }`}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ filter: 'drop-shadow(0 0 22px rgba(37,99,235,0.45))' }}
      >
        {/* Outer static bezel ring + glyph ports — fixed, does not rotate */}
        <svg viewBox="0 0 200 200" className="absolute h-full w-full">
          <circle cx={cx} cy={cy} r={96} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
          <HudFrame cx={cx} cy={cy} r={96} />
        </svg>

        {/* Sparse outer tick ring, slow clockwise drift — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_1.8s_linear_infinite]' : 'animate-[spin_40s_linear_infinite]'}`}
        >
          <TickRing cx={cx} cy={cy} count={48} rInner={88} rOuter={92} color="rgba(37,99,235,0.7)" />
        </svg>

        {/* Segmented arc ring (the original highlight sweep), mid speed — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_0.6s_linear_infinite]' : 'animate-[spin_5s_linear_infinite]'}`}
        >
          <circle
            cx={cx}
            cy={cy}
            r={82}
            fill="none"
            stroke="rgba(37,99,235,0.9)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="50 18 22 26 14 380"
            style={{ filter: 'drop-shadow(0 0 8px rgba(37,99,235,0.9))' }}
          />
        </svg>

        {/* Dense barcode-style tick ring, clockwise — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_1.1s_linear_infinite]' : 'animate-[spin_22s_linear_infinite]'}`}
        >
          <TickRing cx={cx} cy={cy} count={80} rInner={68} rOuter={74} longEvery={4} longExtra={2} color="rgba(244,160,170,0.55)" opacity={0.7} />
        </svg>

        {/* Outer cog ring, slow mechanical clockwise turn — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_1.4s_linear_infinite]' : 'animate-[spin_30s_linear_infinite]'}`}
        >
          <path
            d={gearPath(cx, cy, 28, 60, 53, 0.55)}
            fill="rgba(154,34,54,0.28)"
            stroke="rgba(37,99,235,0.85)"
            strokeWidth={1}
          />
        </svg>

        {/* Inner cog ring, nested, faster clockwise turn — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_0.8s_linear_infinite]' : 'animate-[spin_16s_linear_infinite]'}`}
        >
          <path
            d={gearPath(cx, cy, 20, 44, 38, 0.55)}
            fill="rgba(154,34,54,0.32)"
            stroke="rgba(37,99,235,0.9)"
            strokeWidth={1}
          />
        </svg>

        {/* Innermost fine tick ring hugging the power button, fastest clockwise turn — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_0.4s_linear_infinite]' : 'animate-[spin_8s_linear_infinite]'}`}
        >
          <TickRing cx={cx} cy={cy} count={36} rInner={28} rOuter={32} longEvery={3} longExtra={1.5} color="rgba(37,99,235,0.8)" />
        </svg>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onIgnite();
        }}
        disabled={spinningUp}
        className="group absolute inset-[36%] flex items-center justify-center rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/5 shadow-glow-subtle transition-all duration-300 hover:scale-105 hover:shadow-glow-strong"
      >
        <span className="absolute inset-0 rounded-full border border-invictus-crimson-bright/30 animate-pulse" />
        <Power className="relative z-10 h-7 w-7 text-invictus-crimson-bright drop-shadow-glow-subtle transition-all group-hover:text-white group-hover:drop-shadow-glow-strong" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot HUD side panels — network/quick-links and environment/systems
// ---------------------------------------------------------------------------

function HudCornerPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-neutral-400/20 bg-invictus-base/60 p-4 shadow-glow-subtle backdrop-blur-md ${className}`}>
      <MicroCorners />
      {children}
    </div>
  );
}

function SignalBars({ level }: { level: number }) {
  const bars = Array.from({ length: 5 });
  return (
    <div className="flex items-end gap-0.5">
      {bars.map((_, i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${i < level ? 'bg-neutral-300 shadow-glow-subtle' : 'bg-neutral-800'}`}
          style={{ height: `${6 + i * 3}px` }}
        />
      ))}
    </div>
  );
}

function MiniMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-neutral-300">{value}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-invictus-crimson to-invictus-crimson-bright shadow-glow-subtle"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

const BOOT_QUICK_LINKS: { label: string; icon: typeof ListChecks; value: number }[] = [
  { label: 'Task Queue', icon: ListChecks, value: 64 },
  { label: 'Compliance DB', icon: ShieldCheck, value: 100 },
  { label: 'News Uplink', icon: Newspaper, value: 88 },
  { label: `${BRAND_NAME} Core`, icon: Pinwheel, value: 100 },
];

function NetworkPanel() {
  return (
    <HudCornerPanel className="w-52">
      <div className="mb-4 flex items-center justify-between">
        <Kicker>Estate Link</Kicker>
        <SignalBars level={5} />
      </div>
      <div className="mb-1 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-neutral-300" />
        <span className="font-mono text-base font-bold tabular-nums text-neutral-200 [text-shadow:var(--glow-text-subtle)]">98%</span>
      </div>
      <p className="mb-4 text-[10px] tracking-widest text-neutral-600">ESTATE-WIFI · LAN SECURE</p>

      <div className="space-y-3 border-t border-neutral-400/15 pt-3">
        {BOOT_QUICK_LINKS.map((link) => (
          <div key={link.label} className="flex items-center gap-2">
            <link.icon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <MiniMeter label={link.label} value={link.value} />
          </div>
        ))}
      </div>
    </HudCornerPanel>
  );
}

function Waveform() {
  const bars = Array.from({ length: 14 });
  return (
    <div className="flex h-6 items-end gap-[3px]">
      {bars.map((_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-neutral-300/80 shadow-glow-subtle"
          style={{
            animation: `waveform ${0.8 + (i % 4) * 0.15}s ease-in-out infinite`,
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}

function EnvironmentPanel() {
  return (
    <HudCornerPanel className="w-56">
      <Kicker className="mb-3">Site Environment</Kicker>
      <div className="mb-1 flex items-center gap-2">
        <Cloud className="h-5 w-5 text-neutral-300" />
        <span className="font-mono text-xl font-bold tabular-nums text-neutral-200 [text-shadow:var(--glow-text-subtle)]">18°C</span>
      </div>
      <p className="mb-3 text-[10px] tracking-widest text-neutral-600">OVERCAST · ESTATE GROUNDS</p>

      <div className="mb-4 grid grid-cols-3 gap-2 border-t border-neutral-400/15 pt-3 text-center">
        <div>
          <Droplets className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
          <p className="font-mono text-xs text-neutral-200">64%</p>
          <p className="text-[10px] uppercase tracking-widest text-neutral-600">Humid</p>
        </div>
        <div>
          <Eye className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
          <p className="font-mono text-xs text-neutral-200">9km</p>
          <p className="text-[10px] uppercase tracking-widest text-neutral-600">Visib</p>
        </div>
        <div>
          <Wind className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
          <p className="font-mono text-xs text-neutral-200">14kt</p>
          <p className="text-[10px] uppercase tracking-widest text-neutral-600">Wind</p>
        </div>
      </div>

      <div className="border-t border-neutral-400/15 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <Music2 className="h-3 w-3" /> Ambient Feed
          </span>
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 [text-shadow:0_0_8px_rgba(52,211,153,0.8)]">Live</span>
        </div>
        <Waveform />
      </div>
    </HudCornerPanel>
  );
}

// ---------------------------------------------------------------------------
// Circular progress chart — radial HUD dial with tick ring + radar sweep
// ---------------------------------------------------------------------------

function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    // Shrinks below md so it fits a half-width mobile dashboard card without
    // overflowing; unchanged at md and up.
    <div className="relative flex h-56 w-56 max-md:h-32 max-md:w-32 items-center justify-center">
      <svg viewBox="0 0 200 200" className="absolute h-full w-full -rotate-90">
        {/* base ring */}
        <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="14" className="text-neutral-700" />

        {/* progress ring */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-neutral-100"
          style={{ transition: 'stroke-dashoffset 0.7s ease' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl max-md:text-2xl font-extrabold tabular-nums tracking-tight text-neutral-100">
          {percentage}%
        </span>
        <span className="mt-1 text-xs max-md:hidden text-neutral-500">complete</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVICTUS greeting line — time-of-day aware, names the single most urgent
// compliance item using the shared Compliance Countdown data/RAG logic.
// ---------------------------------------------------------------------------

function getFirstName(user: User | null): string {
  if (user?.displayName) return user.displayName.trim().split(/\s+/)[0];
  if (user?.email) {
    const local = user.email.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return 'sir';
}

function getGreetingPrefix(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Burning the midnight oil';
}

function buildGreeting(user: User | null, compliances: ComplianceItem[], now: Date): string {
  const name = getFirstName(user);
  const prefix = getGreetingPrefix(now.getHours());
  const outstanding = getOutstandingCompliances(compliances, now);

  if (outstanding.length === 0) {
    return `${prefix}, ${name}. All systems nominal, nothing outstanding.`;
  }

  const top = outstanding[0];
  const dueClause = formatDueIn(top.daysUntilDue).toLowerCase();

  if (outstanding.length === 1) {
    return `${prefix}, ${name}. One item needs attention — ${top.item.name}, ${dueClause}.`;
  }

  return `${prefix}, ${name}. ${outstanding.length} items need attention — most urgent is ${top.item.name}, ${dueClause}.`;
}

// Left-edge colour + trailing chip mirror the single most urgent outstanding
// compliance item (same red/amber/green RAG used by the Compliance Countdown
// card), so the greeting bar visually agrees with the rest of the dashboard.
const GREETING_EDGE: Record<ComplianceUrgency, string> = {
  red: 'border-l-alert',
  amber: 'border-l-amber-400',
  green: 'border-l-emerald-400',
};

function InvictusGreeting({ compliances }: { compliances: ComplianceItem[] }) {
  const { user } = useAuth();
  const [greeting] = useState(() => buildGreeting(user, compliances, new Date()));
  const mostUrgent = useMemo(() => getOutstandingCompliances(compliances)[0] ?? null, [compliances]);

  return (
    <div
      className={`mb-6 flex items-center justify-between gap-3 rounded-2xl border border-neutral-400/20 border-l-4 bg-invictus-surface px-5 py-4 ${
        mostUrgent ? GREETING_EDGE[mostUrgent.urgency] : 'border-l-emerald-400'
      }`}
    >
      <p className="text-sm text-neutral-100">{greeting}</p>
      {mostUrgent && (
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${URGENCY_STYLES[mostUrgent.urgency]}`}>
          {formatDueIn(mostUrgent.daysUntilDue)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reveal — staggered fade/translate-in wrapper for the post-boot dashboard
// assembly. Renders children as-is (no wrapper, no animation) when `animate`
// is false, so it's a no-op once a session has already booted.
// ---------------------------------------------------------------------------

function Reveal({ index, animate, children }: { index: number; animate: boolean; children: React.ReactNode }) {
  if (!animate) return <>{children}</>;
  return (
    <div className="animate-card-in" style={{ animationDelay: `${index * CARD_REVEAL_STEP_MS}ms` }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard KPI strip — four small at-a-glance numbers above the fold.
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  valueClassName = 'text-neutral-100',
  caption,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  caption: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-400/20 bg-invictus-surface p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">{label}</p>
      <p className={`mt-2 text-[34px] font-extrabold leading-none tracking-tight ${valueClassName}`}>{value}</p>
      <p className="mt-1.5 text-xs text-neutral-500">{caption}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task completion — donut + counts alongside a compact 14-day trend, combined
// into one card (the standalone, more detailed Completion Timeline panel
// further down the dashboard still shows the full tasks-vs-compliance chart).
// ---------------------------------------------------------------------------

function TaskCompletionPanel({
  completionPct,
  completedItems,
  outstandingItems,
  timeline,
}: {
  completionPct: number;
  completedItems: number;
  outstandingItems: number;
  timeline: TimelinePoint[];
}) {
  const cumulative = useMemo(() => {
    let running = 0;
    return timeline.map((p) => {
      running += p.tasks;
      return { label: p.label, total: running };
    });
  }, [timeline]);
  const totalCompleted = cumulative.length ? cumulative[cumulative.length - 1].total : 0;
  // Compare the midpoint's running total to the end total: if more was
  // completed in the second half of the window than the first, it's trending up.
  const midpoint = Math.floor(cumulative.length / 2);
  const firstHalfTotal = cumulative[midpoint - 1]?.total ?? 0;
  const secondHalfTotal = totalCompleted - firstHalfTotal;
  const trend = secondHalfTotal > firstHalfTotal ? 'trending up' : secondHalfTotal < firstHalfTotal ? 'trending down' : 'steady';

  return (
    <Panel
      title="Task completion"
      icon={Gauge}
      refCode="0012-A"
      tier="primary"
      headerRight={<Kicker>Last {TIMELINE_DAYS} days</Kicker>}
    >
      <div className="flex flex-1 flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-6">
          <CircularProgress percentage={completionPct} />
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-emerald-300">{completedItems}</p>
              <Kicker>Completed</Kicker>
            </div>
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-neutral-200">{outstandingItems}</p>
              <Kicker>Outstanding</Kicker>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-20 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="taskCompletionTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--invictus-crimson-bright))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="rgb(var(--invictus-crimson-bright))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="rgb(var(--invictus-crimson-bright))"
                  strokeWidth={2}
                  fill="url(#taskCompletionTrendGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {totalCompleted} task{totalCompleted === 1 ? '' : 's'} completed · {trend}
          </p>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({
  tasks,
  archivedTasks,
  compliances,
  events,
  animateCardsIn = false,
  onCardsRevealed,
  onToggleMeeting,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  compliances: ComplianceItem[];
  events: CalendarEvent[];
  animateCardsIn?: boolean;
  onCardsRevealed?: () => void;
  onToggleMeeting: (id: string, date: string) => void;
}) {
  // Tell the parent once the staggered reveal has finished so re-mounting
  // this component later in the same session (switching tabs and back) won't replay it.
  useEffect(() => {
    if (!animateCardsIn) return;
    const cardCount = 6; // greeting + KPI strip + 4 panels
    const totalMs = (cardCount - 1) * CARD_REVEAL_STEP_MS + CARD_REVEAL_DURATION_MS;
    const timeout = setTimeout(() => onCardsRevealed?.(), totalMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateCardsIn]);

  // Overall task completion — tasks only (active list + archived), not compliances.
  const overallTasks = [...tasks, ...archivedTasks];
  const completedItems = overallTasks.filter((t) => t.status === 'Completed').length;
  const totalItems = overallTasks.length;
  const outstandingItems = totalItems - completedItems;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  // Firestore snapshots don't preserve insertion order, so sort by createdAt.
  const recentTasks = [...tasks].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).slice(-4).reverse();

  const outstandingCompliances = getOutstandingCompliances(compliances);
  const upcomingCompliances = outstandingCompliances.slice(0, 4);
  const overdueComplianceCount = outstandingCompliances.filter((c) => c.daysUntilDue < 0).length;

  const timeline = useMemo(
    () => buildCompletionTimeline(tasks, archivedTasks, compliances),
    [tasks, archivedTasks, compliances]
  );

  const todayStr = useMemo(() => toDateInputValue(new Date()), []);
  const todaysMeetings = events
    .filter((ev) => getOccurrencesInRange(ev, todayStr, todayStr).length > 0)
    // Earliest time first (untimed last), then higher priority as a tiebreak.
    .sort((a, b) => {
      const byTime = (a.time || '99:99').localeCompare(b.time || '99:99');
      if (byTime !== 0) return byTime;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });

  return (
    <div className="space-y-6">
      <Reveal index={0} animate={animateCardsIn}>
        <InvictusGreeting compliances={compliances} />
      </Reveal>

      {/* KPI strip — 2 columns from the base breakpoint up (true mobile
          <640px), 4 across from sm; tablet/desktop behaviour is unchanged. */}
      <Reveal index={1} animate={animateCardsIn}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard label="Completion" value={`${completionPct}%`} caption="of all tasks done" />
          <KpiCard label="Completed" value={String(completedItems)} valueClassName="text-emerald-300" caption="tasks completed" />
          <KpiCard label="Outstanding" value={String(outstandingItems)} caption="still open" />
          <KpiCard label="Overdue" value={String(overdueComplianceCount)} valueClassName="text-alert" caption="compliance items" />
        </div>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Reveal index={2} animate={animateCardsIn}>
          <TaskCompletionPanel
            completionPct={completionPct}
            completedItems={completedItems}
            outstandingItems={outstandingItems}
            timeline={timeline}
          />
        </Reveal>

        <Reveal index={3} animate={animateCardsIn}>
          <Panel title="Compliance countdown" icon={ShieldCheck} refCode="0030-C" tier="primary">
            <div className="flex flex-col divide-y divide-neutral-400/15">
              {upcomingCompliances.length === 0 && (
                <p className="py-6 text-center text-xs text-neutral-600">No outstanding compliance items.</p>
              )}
              {upcomingCompliances.map(({ item, daysUntilDue, urgency }) => (
                <div key={item.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-100">{item.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Due {item.nextDueDate || '—'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${URGENCY_STYLES[urgency]}`}>
                    {formatDueIn(daysUntilDue)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Reveal index={4} animate={animateCardsIn}>
          <Panel title="Recently added tasks" icon={ListChecks} refCode="0027-T" tier="primary">
            <div className="flex flex-col divide-y divide-neutral-400/15">
              {recentTasks.length === 0 && (
                <p className="py-6 text-center text-xs text-neutral-600">No tasks logged yet.</p>
              )}
              {recentTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-100">{task.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Due {task.dueDate || '—'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[task.status]}`}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </Reveal>

        <Reveal index={5} animate={animateCardsIn}>
          <Panel title="Today's meetings" icon={CalendarDays} refCode="0035-M" tier="primary">
            {todaysMeetings.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-invictus-raised">
                  <CalendarDays className="h-5 w-5 text-neutral-500" />
                </div>
                <p className="text-sm text-neutral-500">No meetings scheduled today.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-neutral-400/15">
                {todaysMeetings.map((ev) => {
                  const done = ev.completedDates?.includes(todayStr) ?? false;
                  return (
                    <div key={ev.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      <button
                        onClick={() => onToggleMeeting(ev.id, todayStr)}
                        className={`mt-0.5 shrink-0 transition-colors ${
                          done ? 'text-emerald-300' : 'text-neutral-500 hover:text-neutral-300'
                        }`}
                        title={done ? 'Mark as not done' : 'Mark as done'}
                        aria-pressed={done}
                      >
                        {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`flex items-center gap-1.5 text-sm ${done ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
                          {ev.recurrence && <Repeat className="h-3 w-3 shrink-0 text-neutral-400" />}
                          {ev.time && <span className="shrink-0 font-mono text-xs text-neutral-500">{formatDisplayTime(ev.time)}</span>}
                          <span className="truncate">{ev.title}</span>
                        </p>
                        {ev.notes && <p className="mt-0.5 text-xs text-neutral-500">{ev.notes}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${PRIORITY_STYLES[ev.priority]}`}>
                        {ev.priority}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  refCode,
  tier = 'primary',
  headerRight,
  children,
}: {
  title: string;
  icon: typeof Gauge;
  refCode?: string;
  tier?: 'primary' | 'ambient';
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Padding/header spacing shrink below md so cards read cleanly in a
    // 2-column mobile grid; unchanged at md and up.
    <div className="relative flex h-full flex-col rounded-2xl border border-neutral-400/20 bg-invictus-surface p-6 max-md:p-4">
      <div className="mb-4 max-md:mb-3 flex items-center justify-between gap-2 border-b border-neutral-400/15 pb-4 max-md:pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
          <h2 className="text-base max-md:text-sm font-bold text-neutral-100">{title}</h2>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${MONTH_LABELS[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Team Control (admin only)
// ---------------------------------------------------------------------------

function AdminPage({ team, user, isMaster }: { team: TeamMember[]; user: User; isMaster: boolean }) {
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  const [deleteData, setDeleteData] = useState(false);

  const nameOf = (uid: string) => team.find((m) => m.uid === uid)?.name ?? 'that user';

  const callAdmin = async (action: 'promote' | 'demote' | 'block' | 'unblock' | 'remove', targetUid: string, withData = false) => {
    setBusyUid(targetUid);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, targetUid, deleteData: withData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      const n = nameOf(targetUid);
      setMessage(
        action === 'promote' ? `${n} is now an admin.`
        : action === 'demote' ? `${n} is no longer an admin.`
        : action === 'block' ? `${n}'s sign-in is blocked.`
        : action === 'unblock' ? `${n} can sign in again.`
        : withData ? `${n} removed from the team and their data deleted.`
        : `${n} removed from the team.`
      );
      setMessageIsError(false);
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`);
      setMessageIsError(true);
    } finally {
      setBusyUid(null);
      setConfirmRemoveUid(null);
      setDeleteData(false);
    }
  };

  const smallBtn =
    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-all disabled:opacity-40';
  const sorted = [...team].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <Panel title="Team Control" icon={UserCog} refCode="0120-A">
        <p className="mb-4 text-xs text-neutral-500">
          Everyone who has signed into the app. Blocking stops an account signing in at all;
          removing takes them off the team roster (their shared tasks stay with the remaining
          people). Only the master account can grant or revoke admin.
        </p>
        {message && (
          <p className={`mb-3 text-xs ${messageIsError ? 'text-alert' : 'text-emerald-400'}`}>{message}</p>
        )}
        <div className="space-y-2">
          {sorted.map((m) => {
            const memberIsMaster = (m.email ?? '').toLowerCase() === MASTER_ADMIN_EMAIL;
            const isSelf = m.uid === user.uid;
            const busy = busyUid === m.uid;
            return (
              <div
                key={m.uid}
                className="relative flex flex-col gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 shadow-glow-subtle md:flex-row md:items-center md:justify-between"
              >
                <MicroCorners />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm text-neutral-100">{m.name}</p>
                    {memberIsMaster && (
                      <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-invictus-crimson-bright">
                        Master
                      </span>
                    )}
                    {!memberIsMaster && m.role === 'admin' && (
                      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-amber-300">
                        Admin
                      </span>
                    )}
                    {m.blocked && (
                      <span className="rounded-full border border-alert/50 bg-alert/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-alert">
                        Blocked
                      </span>
                    )}
                    {isSelf && (
                      <span className="rounded-full border border-neutral-400/30 bg-neutral-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                        You
                      </span>
                    )}
                  </div>
                  <Kicker>
                    {m.email || 'no email'}
                    {m.lastSeen ? ` · last seen ${new Date(m.lastSeen).toLocaleDateString('en-GB')}` : ''}
                  </Kicker>
                </div>

                {!memberIsMaster && !isSelf && (
                  <div className="flex flex-wrap items-center gap-2">
                    {confirmRemoveUid === m.uid ? (
                      <>
                        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-neutral-400">
                          <input
                            type="checkbox"
                            checked={deleteData}
                            onChange={(e) => setDeleteData(e.target.checked)}
                            className="h-3.5 w-3.5 accent-red-600"
                          />
                          Also delete their data
                        </label>
                        <button
                          onClick={() => callAdmin('remove', m.uid, deleteData)}
                          disabled={busy}
                          className={`${smallBtn} border-alert/50 bg-alert/15 text-alert hover:bg-alert/25`}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Confirm remove
                        </button>
                        <button
                          onClick={() => {
                            setConfirmRemoveUid(null);
                            setDeleteData(false);
                          }}
                          disabled={busy}
                          className={`${smallBtn} border-neutral-400/30 bg-invictus-base/60 text-neutral-300 hover:text-invictus-crimson-bright`}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {isMaster &&
                          (m.role === 'admin' ? (
                            <button
                              onClick={() => callAdmin('demote', m.uid)}
                              disabled={busy}
                              className={`${smallBtn} border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20`}
                              title="Remove admin rights"
                            >
                              <UserCog className="h-3.5 w-3.5" /> Demote
                            </button>
                          ) : (
                            <button
                              onClick={() => callAdmin('promote', m.uid)}
                              disabled={busy}
                              className={`${smallBtn} border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20`}
                              title="Make this person an admin"
                            >
                              <UserCog className="h-3.5 w-3.5" /> Make admin
                            </button>
                          ))}
                        {m.blocked ? (
                          <button
                            onClick={() => callAdmin('unblock', m.uid)}
                            disabled={busy}
                            className={`${smallBtn} border-emerald-400/50 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20`}
                            title="Let this account sign in again"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" /> Unblock
                          </button>
                        ) : (
                          <button
                            onClick={() => callAdmin('block', m.uid)}
                            disabled={busy}
                            className={`${smallBtn} border-alert/40 bg-alert/10 text-alert hover:bg-alert/20`}
                            title="Stop this account signing in"
                          >
                            <ShieldOff className="h-3.5 w-3.5" /> Block sign-in
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmRemoveUid(m.uid)}
                          disabled={busy}
                          className={`${smallBtn} border-neutral-400/30 bg-invictus-base/60 text-neutral-300 hover:border-alert/40 hover:text-alert`}
                          title="Remove from the team roster"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No team members yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function CalendarPage({
  events,
  onAdd,
  onDelete,
}: {
  events: CalendarEvent[];
  onAdd: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInputValue(today));
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [notes, setNotes] = useState('');
  const [repeatFreq, setRepeatFreq] = useState<RecurrenceFreq | 'none'>('none');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<{ event: CalendarEvent; occurrenceDate: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { playConfirm } = useSound();

  useEffect(() => {
    if (!confirmDeleteId) return;
    const cancel = () => setConfirmDeleteId(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-confirm-delete="${confirmDeleteId}"]`)) cancel();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [confirmDeleteId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    if (repeatFreq !== 'none' && !repeatUntil) return;
    onAdd({
      id: genId(),
      title: title.trim(),
      date,
      priority,
      notes: notes.trim(),
      // Only attach a time when one was picked — never store an empty string.
      ...(time ? { time } : {}),
      // Only attach recurrence when it actually repeats — never store `undefined`.
      ...(repeatFreq !== 'none' ? { recurrence: { freq: repeatFreq, until: repeatUntil } } : {}),
    });
    playConfirm();
    setTitle('');
    setTime('');
    setPriority('Medium');
    setNotes('');
    setRepeatFreq('none');
    setRepeatUntil('');
  };

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, i) => {
      const dayNum = i - leadingBlanks + 1;
      if (dayNum < 1 || dayNum > daysInMonth) return null;
      return toDateInputValue(new Date(viewYear, viewMonth, dayNum));
    });
  }, [viewYear, viewMonth]);

  const eventsByDate = useMemo(() => {
    const visibleDates = cells.filter((c): c is string => !!c);
    if (visibleDates.length === 0) return {};
    const rangeStart = visibleDates[0];
    const rangeEnd = visibleDates[visibleDates.length - 1];
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      for (const occurrenceDate of getOccurrencesInRange(ev, rangeStart, rangeEnd)) {
        (map[occurrenceDate] ??= []).push(ev);
      }
    }
    // Within a day, show earliest times first; untimed (all-day) entries last.
    for (const date of Object.keys(map)) {
      map[date].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    }
    return map;
  }, [events, cells]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const todayStr = toDateInputValue(today);

  return (
    <div className="space-y-5">
      <Panel title="New Diary Entry" icon={Plus} refCode="0102-C">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Ansul Meeting"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-2"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            title="Start time (optional)"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <InvictusSelect
            value={priority}
            onChange={(v) => setPriority(v as Priority)}
            className="bg-invictus-base/60"
            options={[
              { value: 'High', label: 'High' },
              { value: 'Medium', label: 'Medium' },
              { value: 'Low', label: 'Low' },
            ]}
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes, e.g. it is with Paul A"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <InvictusSelect
            value={repeatFreq}
            onChange={(v) => setRepeatFreq(v as RecurrenceFreq | 'none')}
            className="bg-invictus-base/60"
            title="Repeats"
            options={[
              { value: 'none', label: 'Does not repeat' },
              { value: 'weekly', label: 'Repeats weekly' },
              { value: 'fortnightly', label: 'Repeats fortnightly' },
              { value: 'monthly', label: 'Repeats monthly' },
            ]}
          />
          {repeatFreq !== 'none' && (
            <input
              type="date"
              value={repeatUntil}
              min={date}
              onChange={(e) => setRepeatUntil(e.target.value)}
              required
              title="Repeat until"
              className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          )}
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong sm:col-span-2 lg:col-span-5"
          >
            <Plus className="h-4 w-4" /> Add to Diary
          </button>
        </form>
      </Panel>

      <Panel title={`${MONTH_LABELS[viewMonth]} ${viewYear}`} icon={CalendarDays} refCode="0103-C">
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            onClick={goToPrevMonth}
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToToday}
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop / wide-screen month grid — collapses to an agenda list below lg, since 7 narrow
            columns can't fit readable event titles on phone and fold-device widths. */}
        <div className="hidden grid-cols-7 gap-1.5 lg:grid">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-1 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              {label}
            </div>
          ))}
          {cells.map((cellDate, i) => {
            if (!cellDate) {
              return <div key={`blank-${i}`} className="min-h-[6.5rem] rounded-md border border-transparent" />;
            }
            const dayEvents = eventsByDate[cellDate] ?? [];
            const isToday = cellDate === todayStr;
            const dayNum = Number(cellDate.slice(-2));
            return (
              <div
                key={cellDate}
                className={`relative flex min-h-[6.5rem] flex-col gap-1 rounded-md border p-1.5 ${
                  isToday
                    ? 'border-invictus-crimson-bright bg-invictus-crimson-bright/10 shadow-glow-strong'
                    : 'border-neutral-400/15 bg-invictus-base/40'
                }`}
              >
                <span className={`font-mono text-[11px] ${isToday ? 'font-bold text-invictus-crimson-bright' : 'text-neutral-500'}`}>{dayNum}</span>
                <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent({ event: ev, occurrenceDate: cellDate })}
                      title={ev.notes ? `${ev.title} — ${ev.notes}` : ev.title}
                      className={`group flex cursor-pointer items-start justify-between gap-1.5 rounded border px-1.5 py-1 font-sans text-[11px] leading-snug transition-colors hover:brightness-125 ${PRIORITY_STYLES[ev.priority]}`}
                    >
                      <span className="flex min-w-0 items-start gap-1">
                        {ev.recurrence && <Repeat className="mt-0.5 h-2.5 w-2.5 shrink-0" />}
                        <span className="line-clamp-2 min-w-0">
                          {ev.time && <span className="font-mono font-semibold">{formatDisplayTime(ev.time)} </span>}
                          {ev.title}
                        </span>
                      </span>
                      <div className="shrink-0" data-confirm-delete={ev.id}>
                        {confirmDeleteId === ev.id ? (
                          <div className="flex items-center gap-1 pl-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(ev.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-alert/50 bg-alert/10 p-0.5 text-alert transition-colors hover:bg-alert/20"
                              title={ev.recurrence ? 'Confirm: delete entire series' : 'Confirm delete'}
                            >
                              <Check className="h-2.5 w-2.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-neutral-400/30 p-0.5 text-neutral-400 transition-colors hover:text-neutral-200"
                              title="Cancel"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(ev.id);
                            }}
                            className="rounded p-1 pl-1.5 text-neutral-400 opacity-0 transition-opacity hover:text-alert focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                            title={ev.recurrence ? 'Delete entire series' : 'Delete entry'}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Agenda list — narrow screens get full-width rows instead of cramped grid chips. */}
        <div className="flex flex-col gap-3 lg:hidden">
          {cells.filter((cellDate): cellDate is string => Boolean(cellDate) && (eventsByDate[cellDate!] ?? []).length > 0).length === 0 && (
            <p className="py-6 text-center text-xs text-neutral-500">No diary entries this month.</p>
          )}
          {cells.map((cellDate, i) => {
            if (!cellDate) return null;
            const dayEvents = eventsByDate[cellDate] ?? [];
            if (dayEvents.length === 0) return null;
            const isToday = cellDate === todayStr;
            const dayNum = Number(cellDate.slice(-2));
            const weekdayLabel = WEEKDAY_LABELS[i % 7];
            return (
              <div
                key={cellDate}
                className={`rounded-md border p-2.5 ${
                  isToday
                    ? 'border-invictus-crimson-bright bg-invictus-crimson-bright/10 shadow-glow-strong'
                    : 'border-neutral-400/15 bg-invictus-base/40'
                }`}
              >
                <div className={`mb-2 font-mono text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-invictus-crimson-bright' : 'text-neutral-400'}`}>
                  {weekdayLabel} {dayNum}
                </div>
                <div className="flex flex-col gap-2">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent({ event: ev, occurrenceDate: cellDate })}
                      className={`flex cursor-pointer items-start justify-between gap-2 rounded border px-3 py-2.5 font-sans text-sm leading-snug transition-colors active:brightness-125 ${PRIORITY_STYLES[ev.priority]}`}
                    >
                      <span className="flex min-w-0 items-start gap-1.5">
                        {ev.recurrence && <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span className="min-w-0">
                          {ev.time && <span className="font-mono font-semibold">{formatDisplayTime(ev.time)} · </span>}
                          {ev.title}
                        </span>
                      </span>
                      <div className="shrink-0" data-confirm-delete={ev.id}>
                        {confirmDeleteId === ev.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(ev.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-alert/50 bg-alert/10 p-1.5 text-alert transition-colors active:bg-alert/20"
                              title={ev.recurrence ? 'Confirm: delete entire series' : 'Confirm delete'}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-neutral-400/30 p-1.5 text-neutral-400 transition-colors active:text-neutral-200"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(ev.id);
                            }}
                            className="rounded p-1.5 text-neutral-400 transition-colors active:text-alert"
                            title={ev.recurrence ? 'Delete entire series' : 'Delete entry'}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative w-full max-w-sm border border-invictus-crimson-bright/40 bg-invictus-base/95 p-5 shadow-glow-strong"
            onClick={(e) => e.stopPropagation()}
          >
            <HudCorners />
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute right-3 top-3 text-neutral-500 transition-colors hover:text-neutral-200"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <Kicker>Diary Entry</Kicker>
            <h3 className="mt-1 flex items-center gap-1.5 pr-6 text-base font-semibold text-neutral-100">
              {selectedEvent.event.recurrence && <Repeat className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
              {selectedEvent.event.title}
            </h3>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-neutral-300">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>
                  {formatDisplayDate(selectedEvent.occurrenceDate)}
                  {selectedEvent.event.time && ` · ${formatDisplayTime(selectedEvent.event.time)}`}
                </span>
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[selectedEvent.event.priority]}`}
              >
                {selectedEvent.event.priority} Priority
              </span>
              {selectedEvent.event.recurrence && (
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Repeats {selectedEvent.event.recurrence.freq} until {formatDisplayDate(selectedEvent.event.recurrence.until)}
                </p>
              )}
              <p className="rounded-md border border-neutral-400/20 bg-invictus-base/60 p-2 text-xs text-neutral-200">
                {selectedEvent.event.notes || 'No notes added.'}
              </p>
            </div>
            <button
              onClick={() => {
                onDelete(selectedEvent.event.id);
                setSelectedEvent(null);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-alert/40 bg-alert/10 py-2 text-xs font-semibold uppercase tracking-widest text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
            >
              <Trash2 className="h-3.5 w-3.5" /> {selectedEvent.event.recurrence ? 'Delete Entire Series' : 'Delete Entry'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site Map
// ---------------------------------------------------------------------------

// Geometry traced from the official Dreamland Margate site plan, normalised to a
// 1000 x 900 SVG viewBox (north = top). The boundary, roads and car park come
// from the plan; the operational zones (Ingress, Roller Area, Food Court, Scenic
// Stage/Railway, Boneyard, Bars storage, Rides, etc.) are the user's working
// layout for the event build.
type Pt = [number, number];

// The eastern half sits 190 further out than the traced plan, to give the food
// court the width it has on the ground — its outlets ring a wide oval and were
// unreadable squeezed into the original span.
const SITE_BOUNDARY: Pt[] = [
  [19, 144], [300, 126], [834, 127], [1043, 465], [1155, 705],
  [896, 858], [610, 773], [290, 674], [64, 386],
];
const CAR_PARK_POLY: Pt[] = [[616, 220], [834, 127], [1043, 465], [676, 457]];
const EAST_PARK_POLY: Pt[] = [[838, 470], [1002, 360], [1095, 600], [990, 720], [880, 612]];
const CLUSTER_POLY: Pt[] = [
  [30, 148], [330, 150], [348, 230], [330, 300], [250, 358], [110, 360], [55, 300], [30, 205],
];

type ZoneTone = 'area' | 'storage' | 'building';
interface SiteZone {
  label: string;
  x: number; y: number; w: number; h: number;
  rot?: number;       // box rotation (deg)
  labelRot?: number;  // text rotation (deg) — defaults to rot
  labelSize?: number; // font-size override, for units too small for the default
  labelLines?: string[]; // wrap the label over several lines to fit a narrow box
  shape?: 'ellipse';  // drawn (and hit-tested) as an oval rather than a box
  tone?: ZoneTone;
}

// Working zones, positioned to match the user's marked-up plan.
const SITE_ZONES: SiteZone[] = [
  // Frontage / peripheral buildings (sit north of the boundary, still clickable)
  { label: 'Cinema', x: 30, y: 44, w: 84, h: 34, tone: 'building' },
  { label: 'Cinque Ports', x: 143, y: 52, w: 84, h: 50, tone: 'building' },
  { label: 'Ballroom', x: 33, y: 146, w: 66, h: 46, tone: 'building' },
  { label: 'Boardroom', x: 33, y: 198, w: 66, h: 34, tone: 'building', labelSize: 6.5 },
  { label: 'Hall by the Sea', x: 52, y: 264, w: 58, h: 82, tone: 'building', labelSize: 7, labelLines: ['Hall by', 'the Sea'] },
  // Operational areas
  { label: 'Concourse', x: 116, y: 240, w: 50, h: 44, tone: 'area', labelSize: 6.5 },
  { label: 'Arcade', x: 170, y: 154, w: 150, h: 46, tone: 'area' },
  { label: 'Ingress', x: 332, y: 154, w: 130, h: 46, tone: 'area' },
  { label: 'Roller Area', x: 170, y: 214, w: 160, h: 56, tone: 'area' },
  { label: 'Transit Area', x: 170, y: 288, w: 200, h: 54, tone: 'area' },
  // Food-court outlets, standing around the rim of the seating oval as on the
  // plan: four along the top, the two Peppermint bars below to the left.
  // Each is 44 x 36 centred on a grid square's middle — small enough that even
  // rotated its corners stay inside that one square, so it never claims a
  // neighbour's — and they're listed *before* the Food Court so a square
  // resolves to the unit standing on it rather than the area around it.
  // These two sit at the steepest angles, so they're a size down again — a
  // 44-wide box swings out of its square past about 10 degrees.
  { label: 'Please Sir', x: 205, y: 360, w: 40, h: 30, rot: -22, tone: 'building', labelSize: 5.5 },
  { label: 'Kerb Bar', x: 255, y: 360, w: 40, h: 30, rot: -16, tone: 'building', labelSize: 5.5 },
  { label: 'Birdie Macs', x: 353, y: 357, w: 44, h: 36, rot: -6, tone: 'building', labelSize: 5.5 },
  { label: 'Beastie Baos', x: 403, y: 357, w: 44, h: 36, rot: 10, tone: 'building', labelSize: 5.2 },
  { label: 'Peppermint Bar', x: 253, y: 557, w: 44, h: 36, tone: 'building', labelSize: 6, labelLines: ['Peppermint', 'Bar'] },
  { label: 'Peppermint Bar', x: 353, y: 557, w: 44, h: 36, tone: 'building', labelSize: 6, labelLines: ['Peppermint', 'Bar'] },
  // The seating area itself is a wide oval on the plan, not a box.
  { label: 'Food Court', x: 230, y: 390, w: 220, h: 180, shape: 'ellipse', tone: 'area' },
  // The two long bars run in line with the stage, one either side of it.
  { label: 'Long Bar (Wheel)', x: 495, y: 270, w: 35, h: 100, tone: 'area', labelRot: -90, labelSize: 6.5 },
  { label: 'Scenic Stage', x: 491, y: 380, w: 44, h: 190, tone: 'area', labelRot: -90 },
  { label: 'Long Bar (Waltzers)', x: 495, y: 580, w: 35, h: 100, tone: 'area', labelRot: -90, labelSize: 6.5 },
  { label: 'Scenic Railway', x: 546, y: 366, w: 60, h: 218, tone: 'area', labelRot: -90 },
  { label: 'Scenic Railway', x: 528, y: 152, w: 62, h: 116, tone: 'area', labelRot: -90 },
  // Nudged east of the long bar that now runs up this side of the stage.
  { label: 'Shed', x: 534, y: 306, w: 84, h: 26, tone: 'area' },
  { label: 'Teddy & Betty / Ark', x: 640, y: 348, w: 62, h: 148, rot: -28, tone: 'area', labelSize: 7, labelLines: ['Teddy & Betty', '/ Ark'] },
  { label: 'VIP', x: 130, y: 390, w: 44, h: 80, rot: -50, tone: 'area' },
  { label: 'Container Toilets', x: 534, y: 600, w: 100, h: 34, tone: 'area', labelSize: 7 },
  // Rides (several pitches share the label). The long diagonal pitch belongs
  // to the western cluster below the food court, so unlike the rest of the
  // east side it doesn't take the +190 shift.
  { label: 'Rides', x: 620, y: 520, w: 80, h: 44, tone: 'area' },
  { label: 'Rides', x: 648, y: 580, w: 54, h: 80, tone: 'area' },
  { label: 'Rides', x: 582, y: 716, w: 92, h: 32, tone: 'area' },
  { label: 'Rides', x: 330, y: 634, w: 128, h: 46, rot: -34, tone: 'area' },
  { label: 'Rides', x: 275, y: 600, w: 50, h: 27, tone: 'area' },
  // Logistics (SE)
  { label: 'Boneyard', x: 850, y: 405, w: 150, h: 388, tone: 'storage' },
  { label: 'Bars storage', x: 695, y: 662, w: 148, h: 126, tone: 'storage' },
];

function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Corner polygon of a (possibly rotated) zone rect, for cell hit-testing.
function zoneCorners(z: SiteZone): Pt[] {
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const t = ((z.rot ?? 0) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const local: Pt[] = [
    [-z.w / 2, -z.h / 2], [z.w / 2, -z.h / 2], [z.w / 2, z.h / 2], [-z.w / 2, z.h / 2],
  ];
  return local.map(([dx, dy]) => [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt);
}

// Whether a point falls inside a zone, honouring both the box and oval shapes.
function zoneContains(z: SiteZone, px: number, py: number): boolean {
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  if (z.shape === 'ellipse') {
    const t = ((z.rot ?? 0) * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    // Rotate the point into the ellipse's own axes, then the unit-circle test.
    const lx = dx * Math.cos(t) + dy * Math.sin(t);
    const ly = -dx * Math.sin(t) + dy * Math.cos(t);
    return (lx / (z.w / 2)) ** 2 + (ly / (z.h / 2)) ** 2 <= 1;
  }
  return pointInPolygon(px, py, zoneCorners(z));
}

const SITE_FEATURES: { label: string; zone: SiteZone; poly: Pt[]; cx: number; cy: number }[] =
  SITE_ZONES.map((z) => ({ label: z.label, zone: z, poly: zoneCorners(z), cx: z.x + z.w / 2, cy: z.y + z.h / 2 }));

// The named places a task can be pinned to from Task Manager, where there's no
// map to click. Grid references stay map-only — there are hundreds of them and
// they mean nothing in a dropdown.
const SITE_AREA_NAMES: string[] = Array.from(new Set(SITE_ZONES.map((z) => z.label))).sort();

// 50 x 50 squares. Fine enough that each food-court unit gets a square of its
// own — a coarser grid lumped several of them into one.
const MAP_W = 1300;
const MAP_H = 900;
const GRID_COLS = 26;
const GRID_ROWS = 18;
const CELL_W = MAP_W / GRID_COLS;
const CELL_H = MAP_H / GRID_ROWS;
const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

interface GridCell {
  col: number; row: number; ref: string;
  x: number; y: number; cx: number; cy: number;
  inside: boolean; landmark: string | null; areaKey: string;
}
const SITE_CELLS: GridCell[] = (() => {
  const cells: GridCell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x = col * CELL_W;
      const y = row * CELL_H;
      const cx = x + CELL_W / 2;
      const cy = y + CELL_H / 2;
      // Resolve which zone a square belongs to. Pass 1: cell centre sits inside
      // a zone (handles normal-sized zones). Pass 2: the zone's centre or a
      // corner falls inside this square — this catches thin/small zones (Shed,
      // Container Toilets, the frontage Cinema / Cinque Ports) whose overlapping
      // square has its centre just outside the box. Array order breaks ties.
      const inCell = (px: number, py: number) => px >= x && px <= x + CELL_W && py >= y && py <= y + CELL_H;
      const landmark =
        SITE_FEATURES.find((f) => zoneContains(f.zone, cx, cy))?.label ??
        SITE_FEATURES.find((f) => inCell(f.cx, f.cy))?.label ??
        // Corner fallback only applies to boxes — an oval's bounding corners
        // aren't part of it, and would claim squares well outside the shape.
        SITE_FEATURES.find((f) => f.zone.shape !== 'ellipse' && f.poly.some(([px, py]) => inCell(px, py)))?.label ??
        null;
      // A square is clickable if it's inside the site boundary OR over a named zone.
      const inside = pointInPolygon(cx, cy, SITE_BOUNDARY) || landmark !== null;
      const ref = `${COL_LETTERS[col]}${row + 1}`;
      cells.push({ col, row, ref, x, y, cx, cy, inside, landmark, areaKey: landmark ?? `Grid ${ref}` });
    }
  }
  return cells;
})();

// SVG palette (kept in the black & red INVICTUS theme).
// Colours are driven by the app's theme tokens (not literal hex) so the map
// automatically flips — dark HUD tones in dark mode, calm neutrals in light
// mode — instead of staying a fixed near-black/red graphic in both themes.
const MAP_C = {
  accent: 'rgb(var(--invictus-crimson-bright))',
  line: 'rgb(var(--invictus-crimson-bright) / 0.14)',
  lineStrong: 'rgb(var(--invictus-crimson-bright) / 0.30)',
  boundaryFill: 'rgb(var(--invictus-surface))',
  passive: 'rgb(var(--invictus-raised))',
  passiveStroke: 'rgb(var(--invictus-crimson-bright) / 0.16)',
  green: 'rgb(16 185 129 / 0.10)',
  greenStroke: 'rgb(16 185 129 / 0.28)',
  label: 'hsl(var(--foreground))',
  labelDim: 'hsl(var(--muted-foreground))',
};

const ZONE_TONE: Record<ZoneTone, { fill: string; stroke: string; text: string }> = {
  area: { fill: 'rgb(var(--invictus-crimson-bright) / 0.14)', stroke: 'rgb(var(--invictus-crimson-bright) / 0.55)', text: 'hsl(var(--foreground))' },
  storage: { fill: 'rgb(var(--invictus-crimson-bright) / 0.08)', stroke: 'rgb(var(--invictus-crimson-bright) / 0.4)', text: 'hsl(var(--muted-foreground))' },
  building: { fill: 'rgb(var(--invictus-crimson-bright) / 0.22)', stroke: 'rgb(var(--invictus-crimson-bright) / 0.6)', text: 'hsl(var(--foreground))' },
};

function toPoints(poly: Pt[]): string {
  return poly.map(([x, y]) => `${x},${y}`).join(' ');
}

// Thermal ramp used by the dashboard heat-map: cool/dark (few tasks) through
// crimson and orange to amber/white-hot (busiest). t is normalised 0..1.
function heatColor(t: number): string {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [40, 20, 22]],
    [0.25, [120, 26, 28]],
    [0.5, [200, 38, 38]],
    [0.75, [240, 130, 34]],
    [1.0, [250, 214, 70]],
  ];
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = t1 === t0 ? 0 : (v - t0) / (t1 - t0);
      const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
      return `rgb(${mix(c0[0], c1[0])}, ${mix(c0[1], c1[1])}, ${mix(c0[2], c1[2])})`;
    }
  }
  return 'rgb(250, 214, 70)';
}

// Toggleable teammate chips — lets an assigner pick any number of people at
// once. Each one gets their own pending offer and has to accept individually
// before the task shows up on their list (same as the single-assignee flow
// this replaces, just repeated per person).
function AssigneeMultiSelect({
  teammates,
  selected,
  onToggle,
  className = '',
}: {
  teammates: TeamMember[];
  selected: string[];
  onToggle: (uid: string) => void;
  className?: string;
}) {
  if (teammates.length === 0) {
    return <p className={`text-xs text-neutral-600 ${className}`}>No teammates yet.</p>;
  }
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {teammates.map((m) => {
        const active = selected.includes(m.uid);
        return (
          <button
            key={m.uid}
            type="button"
            onClick={() => onToggle(m.uid)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
                : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400 hover:border-neutral-400/50 hover:text-neutral-200'
            }`}
          >
            {m.name}
          </button>
        );
      })}
    </div>
  );
}

function SiteMapPage({
  tasks,
  archivedTasks,
  team,
  currentUid,
  onAddTask,
  onSetTaskArea,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  team: TeamMember[];
  currentUid: string;
  onAddTask: (task: Task) => void;
  onSetTaskArea: (id: string, area: string) => void;
}) {
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [hoverRef, setHoverRef] = useState<string | null>(null);
  // 'tasks' shows how much work sits where; 'cost' shows what it's costing.
  const [mapMode, setMapMode] = useState<'tasks' | 'cost'>('tasks');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeUids, setAssigneeUids] = useState<string[]>([]);
  const [pinTaskId, setPinTaskId] = useState('');
  const { playConfirm } = useSound();

  // Zoom/pan. The viewBox is the window onto the map: shrinking it magnifies,
  // and `pan` is its top-left corner. Zoom 1 shows the whole site.
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; pointerId: number; captured: boolean } | null>(
    null
  );
  // Set while a drag is in progress so the click it ends with doesn't also
  // select whichever square happened to be under the cursor.
  const draggedRef = useRef(false);

  const clampPan = (p: { x: number; y: number }, z: number) => ({
    x: Math.max(0, Math.min(MAP_W - MAP_W / z, p.x)),
    y: Math.max(0, Math.min(MAP_H - MAP_H / z, p.y)),
  });

  // Zoom about the middle of what's currently on screen, so the view doesn't
  // lurch sideways as you step in and out.
  const zoomBy = (factor: number) => {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (next === zoom) return;
    const cx = pan.x + MAP_W / zoom / 2;
    const cy = pan.y + MAP_H / zoom / 2;
    setZoom(next);
    setPan(clampPan({ x: cx - MAP_W / next / 2, y: cy - MAP_H / next / 2 }, next));
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    draggedRef.current = false;
    if (zoom <= 1) return; // nothing to pan to when the whole site is in view
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, pointerId: e.pointerId, captured: false };
  };
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    if (!draggedRef.current && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return; // ignore jitter
    if (!d.captured) {
      // Capture only once this is a genuine drag. Capturing on pointer-down
      // instead would retarget the following click to the <svg>, so a square
      // would never receive it and nothing could be selected while zoomed.
      e.currentTarget.setPointerCapture(d.pointerId);
      d.captured = true;
    }
    draggedRef.current = true;
    // Belt and braces with the select-none class: if a selection did start,
    // drop it so the labels don't stay highlighted as you drag.
    window.getSelection()?.removeAllRanges();
    const unitsPerPx = MAP_W / zoom / rect.width;
    setPan(
      clampPan({ x: d.panX - (e.clientX - d.x) * unitsPerPx, y: d.panY - (e.clientY - d.y) * unitsPerPx }, zoom)
    );
  };
  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (d?.captured && e.currentTarget.hasPointerCapture(d.pointerId)) {
      e.currentTarget.releasePointerCapture(d.pointerId);
    }
    dragRef.current = null;
  };
  const teammates = team.filter((m) => m.uid !== currentUid);
  const toggleAssignee = (uid: string) =>
    setAssigneeUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));

  const selectedCell = SITE_CELLS.find((c) => c.ref === selectedRef) ?? null;

  const activeCountByArea = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.area && t.status !== 'Completed') counts[t.area] = (counts[t.area] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  // Archived work still counts towards what a place has cost — filing a job
  // away doesn't unspend the money — so spend is summed over both lists even
  // though the task-count badges only track live work.
  const costedTasks = useMemo(() => [...tasks, ...archivedTasks], [tasks, archivedTasks]);

  // What each part of the site is costing: the materials logged against every
  // task pinned there, summed.
  const costByArea = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of costedTasks) {
      if (!t.area) continue;
      const cost = materialsTotal(t.materials);
      if (cost > 0) totals[t.area] = (totals[t.area] ?? 0) + cost;
    }
    return totals;
  }, [costedTasks]);

  const maxAreaCost = useMemo(() => Math.max(0, ...Object.values(costByArea)), [costByArea]);
  const siteTotalCost = useMemo(() => Object.values(costByArea).reduce((a, b) => a + b, 0), [costByArea]);

  // Archived jobs are listed too, live work first — without them the per-task
  // figures wouldn't add up to the area total shown above them.
  const tasksForArea = useMemo(
    () =>
      selectedCell
        ? costedTasks
            .filter((t) => t.area === selectedCell.areaKey)
            .sort((a, b) => Number(a.archived ?? false) - Number(b.archived ?? false))
        : [],
    [costedTasks, selectedCell]
  );
  const selectedAreaCost = selectedCell ? (costByArea[selectedCell.areaKey] ?? 0) : 0;

  // Live tasks that were never pinned anywhere — these are what the square
  // can adopt. Already-placed tasks are left alone; moving one is a different
  // action from placing an unplaced one.
  const unplacedTasks = useMemo(() => tasks.filter((t) => !t.area), [tasks]);

  const handlePinTask = () => {
    if (!selectedCell || !pinTaskId) return;
    onSetTaskArea(pinTaskId, selectedCell.areaKey);
    setPinTaskId('');
    playConfirm();
  };

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell || !name.trim()) return;
    const assignees = teammates.filter((m) => assigneeUids.includes(m.uid));
    onAddTask({
      id: genId(),
      name: name.trim(),
      priority,
      dueDate,
      status: 'Not Started',
      area: selectedCell.areaKey,
      ...(assignees.length
        ? {
            pendingUids: assignees.map((a) => a.uid),
            pendingNames: Object.fromEntries(assignees.map((a) => [a.uid, a.name])),
          }
        : {}),
    });
    playConfirm();
    setName('');
    setPriority('Medium');
    setDueDate('');
    setAssigneeUids([]);
  };

  const cellFill = (cell: GridCell): string => {
    if (cell.ref === selectedRef) return 'rgb(var(--invictus-crimson-bright) / 0.45)';
    if (cell.ref === hoverRef) return 'rgb(var(--invictus-crimson-bright) / 0.22)';
    if (mapMode === 'cost' && maxAreaCost > 0) {
      const cost = costByArea[cell.areaKey] ?? 0;
      // Ramp from the cheapest spend to the dearest, so the hot squares are
      // the ones eating the budget rather than simply the ones with any spend.
      if (cost > 0) return heatColor(cost / maxAreaCost);
    }
    return 'rgb(var(--invictus-crimson-bright) / 0.04)';
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.85fr_1fr]">
        <Panel title="Dreamland Site Map" icon={MapIcon} refCode="0106-M">
          <p className="mb-3 text-xs text-neutral-500">
            Click a grid square to assign a task to that part of the site. Squares over a named
            area (Food Court, Boneyard, Scenic Railway&hellip;) tag the task with that area; open
            ground tags a grid reference. Assigned tasks flow straight into Task Manager.
          </p>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(['tasks', 'cost'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMapMode(m)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    mapMode === m
                      ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
                      : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {m === 'tasks' ? 'Tasks' : 'Material cost'}
                </button>
              ))}
            </div>
            {mapMode === 'cost' && (
              <p className="text-xs text-neutral-500">
                Site total <span className="font-semibold text-neutral-200">{formatMoney(siteTotalCost)}</span>
              </p>
            )}
          </div>
          <div className="relative w-full overflow-hidden rounded-xl border border-neutral-400/20 bg-invictus-base">
            <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
              <button
                onClick={() => zoomBy(1.5)}
                disabled={zoom >= MAX_ZOOM}
                className="rounded-md border border-neutral-400/30 bg-invictus-base/90 p-1.5 text-neutral-300 backdrop-blur transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-30"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => zoomBy(1 / 1.5)}
                disabled={zoom <= MIN_ZOOM}
                className="rounded-md border border-neutral-400/30 bg-invictus-base/90 p-1.5 text-neutral-300 backdrop-blur transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-30"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                onClick={resetView}
                disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
                className="rounded-md border border-neutral-400/30 bg-invictus-base/90 p-1.5 text-neutral-300 backdrop-blur transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-30"
                title="Fit the whole site"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              {zoom > 1 && (
                <span className="rounded-md border border-neutral-400/25 bg-invictus-base/90 px-1 py-0.5 text-center font-mono text-[10px] text-neutral-400 backdrop-blur">
                  {zoom.toFixed(1)}×
                </span>
              )}
            </div>
            <svg
              ref={svgRef}
              viewBox={`${pan.x} ${pan.y} ${MAP_W / zoom} ${MAP_H / zoom}`}
              // select-none: without it, dragging to pan sweeps a text
              // selection across the zone labels and highlights them.
              className={`h-auto w-full select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
              // Without this, a touch drag scrolls the page instead of panning.
              style={{ touchAction: zoom > 1 ? 'none' : undefined }}
              // Stops a drag starting a text selection at all. Safe for
              // clicks — preventDefault on mousedown suppresses selection and
              // focus, but the click event still fires.
              onMouseDown={(e) => {
                if (zoom > 1) e.preventDefault();
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              role="img"
              aria-label="Dreamland site map grid"
            >
              {/* Site boundary */}
              <polygon points={toPoints(SITE_BOUNDARY)} fill={MAP_C.boundaryFill} stroke={MAP_C.accent} strokeWidth={2} strokeLinejoin="round" />

              {/* Passive context areas */}
              <polygon points={toPoints(CAR_PARK_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />
              <polygon points={toPoints(EAST_PARK_POLY)} fill={MAP_C.green} stroke={MAP_C.greenStroke} strokeWidth={1} />
              <polygon points={toPoints(CLUSTER_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />

              {/* Working zones. Drawn with the enclosing areas first so units
                  standing inside one (the food-court outlets) aren't painted
                  over by it — the reverse of the array order, which puts those
                  units first so they win the grid-square lookup. */}
              {[...SITE_ZONES]
                .sort((a, b) => (a.tone === 'building' ? 1 : 0) - (b.tone === 'building' ? 1 : 0))
                .map((z, i) => {
                const cx = z.x + z.w / 2;
                const cy = z.y + z.h / 2;
                const tone = ZONE_TONE[z.tone ?? 'area'];
                const transform = z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined;
                return z.shape === 'ellipse' ? (
                  <ellipse
                    key={`zone-${i}`}
                    cx={cx}
                    cy={cy}
                    rx={z.w / 2}
                    ry={z.h / 2}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={1.2}
                    transform={transform}
                  />
                ) : (
                  <rect
                    key={`zone-${i}`}
                    x={z.x}
                    y={z.y}
                    width={z.w}
                    height={z.h}
                    rx={2}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={1.2}
                    transform={transform}
                  />
                );
                })}

              {/* Roads */}
              <line x1={19} y1={132} x2={834} y2={114} stroke="rgba(180,180,190,0.35)" strokeWidth={3} />
              <line x1={834} y1={127} x2={1155} y2={520} stroke="rgba(180,180,190,0.35)" strokeWidth={3} />

              {/* Context labels */}
              <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }}>
                <text x={330} y={104} fontSize={12} letterSpacing={2} fill={MAP_C.labelDim}>Hall by the Sea Road</text>
                <text x={1002} y={300} fontSize={12} letterSpacing={2} fill={MAP_C.labelDim} transform="rotate(58 1002 300)">Belgrave Road</text>
                <text x={70} y={500} fontSize={11} fill={MAP_C.labelDim}>Arlington Car Park</text>
                <text x={790} y={300} fontSize={11} fontWeight={600} fill={MAP_C.labelDim}>Dreamland Car Park</text>
                <text x={70} y={120} fontSize={8} fill={MAP_C.accent}>Undercover Entrance</text>
              </g>

              {/* Zone labels */}
              <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }}>
                {SITE_ZONES.map((z, i) => {
                  const cx = z.x + z.w / 2;
                  const cy = z.y + z.h / 2;
                  const tone = ZONE_TONE[z.tone ?? 'area'];
                  const lr = z.labelRot ?? z.rot ?? 0;
                  const fs = z.labelSize ?? (z.w < 78 || z.h < 32 ? 7.5 : 9);
                  const lines = z.labelLines ?? [z.label];
                  // Centre the block vertically: shift up by half the extra
                  // lines, then step each line down by one line-height.
                  const top = cy + (z.labelSize ? 2 : 3) - ((lines.length - 1) * fs * 1.15) / 2;
                  return (
                    <text
                      key={`zlbl-${i}`}
                      x={cx}
                      y={top}
                      fontSize={fs}
                      fontWeight={600}
                      // Tight units can't spare the extra tracking.
                      letterSpacing={z.labelSize ? 0.2 : 0.5}
                      fill={tone.text}
                      transform={lr ? `rotate(${lr} ${cx} ${cy})` : undefined}
                    >
                      {lines.map((line, li) => (
                        <tspan key={li} x={cx} dy={li === 0 ? 0 : fs * 1.15}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  );
                })}
              </g>

              {/* Undercover entrance marker */}
              <circle cx={64} cy={128} r={4} fill={MAP_C.accent} />

              {/* Grid lines */}
              <g stroke={MAP_C.line} strokeWidth={1}>
                {Array.from({ length: GRID_COLS - 1 }, (_, i) => (
                  <line key={`v${i}`} x1={(i + 1) * CELL_W} y1={0} x2={(i + 1) * CELL_W} y2={MAP_H} />
                ))}
                {Array.from({ length: GRID_ROWS - 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={(i + 1) * CELL_H} x2={MAP_W} y2={(i + 1) * CELL_H} />
                ))}
              </g>

              {/* Clickable cells (inside boundary only) */}
              {SITE_CELLS.filter((c) => c.inside).map((cell) => (
                <rect
                  key={cell.ref}
                  x={cell.x}
                  y={cell.y}
                  width={CELL_W}
                  height={CELL_H}
                  fill={cellFill(cell)}
                  // Squares are drawn over the zones and their labels, so the
                  // heat shading has to stay translucent enough to read the
                  // map through it.
                  fillOpacity={
                    mapMode === 'cost' && cell.ref !== selectedRef && cell.ref !== hoverRef && (costByArea[cell.areaKey] ?? 0) > 0
                      ? 0.5
                      : 1
                  }
                  stroke={cell.ref === selectedRef ? MAP_C.accent : MAP_C.lineStrong}
                  strokeWidth={cell.ref === selectedRef ? 2 : 0.75}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverRef(cell.ref)}
                  onMouseLeave={() => setHoverRef((r) => (r === cell.ref ? null : r))}
                  onClick={() => {
                    if (draggedRef.current) return; // this click ended a pan
                    setSelectedRef(cell.ref);
                  }}
                />
              ))}

              {mapMode === 'tasks' ? (
                <>
                  {/* Task-count badges on named zones */}
                  {/* Badged on every box carrying the name, not just the first.
                      Several pitches share a name (Rides, Peppermint Bar), and
                      badging only one left the others looking like they had no
                      work on them. The number is that area's count, so it reads
                      the same wherever the area appears. */}
                  {SITE_ZONES.filter((z) => (activeCountByArea[z.label] ?? 0) > 0).map((z, i) => (
                    <g key={`badge-${i}`} pointerEvents="none">
                      <circle cx={z.x + z.w / 2} cy={z.y + z.h / 2 - 14} r={9} fill={MAP_C.accent} stroke="rgb(var(--invictus-base))" strokeWidth={1} />
                      <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 10.5} fontSize={11} fontWeight={700} fill={MAP_C.boundaryFill} textAnchor="middle">
                        {activeCountByArea[z.label]}
                      </text>
                    </g>
                  ))}
                  {/* Badges on grid-reference cells that carry tasks */}
                  {SITE_CELLS.filter((c) => c.inside && !c.landmark && (activeCountByArea[c.areaKey] ?? 0) > 0).map((cell) => (
                    <g key={`gbadge-${cell.ref}`} pointerEvents="none">
                      <circle cx={cell.cx} cy={cell.cy} r={9} fill={MAP_C.accent} stroke="rgb(var(--invictus-base))" strokeWidth={1} />
                      <text x={cell.cx} y={cell.cy + 3.5} fontSize={11} fontWeight={700} fill={MAP_C.boundaryFill} textAnchor="middle">
                        {activeCountByArea[cell.areaKey]}
                      </text>
                    </g>
                  ))}
                </>
              ) : (
                /* Cost mode: one price tag per named area, and per loose grid
                   square, drawn on the first square that carries it so a wide
                   area doesn't repeat its total across every square it spans. */
                SITE_CELLS.filter(
                  (c) =>
                    c.inside &&
                    (costByArea[c.areaKey] ?? 0) > 0 &&
                    SITE_CELLS.find((o) => o.inside && o.areaKey === c.areaKey) === c
                ).map((cell) => {
                  const label = formatMoneyCompact(costByArea[cell.areaKey]);
                  const w = 12 + label.length * 6.5;
                  return (
                    <g key={`cost-${cell.ref}`} pointerEvents="none">
                      <rect
                        x={cell.cx - w / 2}
                        y={cell.cy - 9}
                        width={w}
                        height={18}
                        rx={9}
                        fill="rgb(var(--invictus-base))"
                        stroke={MAP_C.accent}
                        strokeWidth={1}
                      />
                      <text x={cell.cx} y={cell.cy + 4} fontSize={11} fontWeight={700} fill={MAP_C.accent} textAnchor="middle">
                        {label}
                      </text>
                    </g>
                  );
                })
              )}
            </svg>
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[3px] border border-invictus-crimson-bright/55 bg-invictus-crimson-bright/15" />
              <span className="text-xs text-neutral-500">Working area</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[3px] border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/35" />
              <span className="text-xs text-neutral-500">Building</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[3px] border border-neutral-400/25 bg-neutral-700/40" />
              <span className="text-xs text-neutral-500">Car park</span>
            </div>
            {mapMode === 'tasks' ? (
              <div className="flex items-center gap-1.5">
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-invictus-crimson-bright text-[8px] font-bold text-invictus-surface">1</span>
                <span className="text-xs text-neutral-500">Tasks assigned</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="flex h-3 w-16 shrink-0 overflow-hidden rounded-[3px] border border-neutral-400/25">
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <span key={t} className="h-full flex-1" style={{ background: heatColor(t) }} />
                  ))}
                </span>
                <span className="text-xs text-neutral-500">
                  Material spend — low to high{maxAreaCost > 0 ? ` (peak ${formatMoney(maxAreaCost)})` : ''}
                </span>
              </div>
            )}
          </div>
        </Panel>

        <Panel title={selectedCell ? (selectedCell.landmark ?? `Grid ${selectedCell.ref}`) : 'Grid Square'} icon={MapPin} refCode="0107-M">
          {!selectedCell ? (
            <div className="flex h-full min-h-[12rem] flex-col gap-4">
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                <MapPin className="h-8 w-8 text-neutral-700" />
                <p className="text-xs text-neutral-500">
                  Click a grid square on the map to view its tasks and assign new ones.
                </p>
              </div>
              {siteTotalCost > 0 && (
                <div className="border-t border-neutral-400/15 pt-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <Kicker>Material spend by area</Kicker>
                    <span className="text-sm font-bold text-invictus-crimson-bright">{formatMoney(siteTotalCost)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(costByArea)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([area, cost]) => (
                        <button
                          key={area}
                          onClick={() => setSelectedRef(SITE_CELLS.find((c) => c.inside && c.areaKey === area)?.ref ?? null)}
                          className="flex w-full items-center gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 px-2.5 py-1.5 text-left transition-colors hover:border-invictus-crimson-bright/40"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{area}</span>
                          {/* Bar length is share of the dearest area, so the
                              ranking reads at a glance. */}
                          <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-400/15 sm:block">
                            <span
                              className="block h-full rounded-full bg-invictus-crimson-bright"
                              style={{ width: `${maxAreaCost > 0 ? (cost / maxAreaCost) * 100 : 0}%` }}
                            />
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-neutral-300">{formatMoney(cost)}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-neutral-400/30 bg-invictus-raised px-2.5 py-1 text-xs font-medium text-neutral-300">
                    Square {selectedCell.ref}
                  </span>
                  {selectedCell.landmark && (
                    <span className="rounded-full border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-2.5 py-1 text-xs font-medium text-neutral-100">
                      {selectedCell.landmark}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRef(null)}
                  className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1 text-neutral-400 transition-colors hover:text-invictus-crimson-bright"
                  title="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Zones with their own floor plan (see lib/zonePlans.ts) get a
                  drill-down into a pinned, isometric view of the building. */}
              {selectedCell.landmark && zonePlanFor(selectedCell.landmark) && (
                <Link
                  href={ZONE_PLAN_ROUTES[selectedCell.landmark]}
                  className="flex items-center justify-between gap-2 rounded-lg border border-invictus-crimson-bright/30 bg-invictus-crimson-bright/5 px-3 py-2.5 text-sm text-neutral-100 transition-colors hover:bg-invictus-crimson-bright/10"
                >
                  <span>Open {selectedCell.landmark} floor plan</span>
                  <span className="text-invictus-crimson-bright">→</span>
                </Link>
              )}

              {selectedAreaCost > 0 && (
                <div className="rounded-lg border border-invictus-crimson-bright/30 bg-invictus-crimson-bright/5 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">Material cost here</span>
                    <span className="text-lg font-bold text-invictus-crimson-bright">{formatMoney(selectedAreaCost)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {siteTotalCost > 0 ? `${Math.round((selectedAreaCost / siteTotalCost) * 100)}% of site spend` : ''}
                  </p>
                </div>
              )}

              <div>
                <Kicker>
                  Tasks here ({tasksForArea.filter((t) => !t.archived).length}
                  {tasksForArea.some((t) => t.archived)
                    ? ` + ${tasksForArea.filter((t) => t.archived).length} archived`
                    : ''}
                  )
                </Kicker>
                <div className="mt-2 space-y-1.5">
                  {tasksForArea.length === 0 && (
                    <p className="py-2 text-xs text-neutral-600">No tasks assigned to this location yet.</p>
                  )}
                  {tasksForArea.map((t) => {
                    const cost = materialsTotal(t.materials);
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between gap-2 rounded-md border border-neutral-400/20 px-2.5 py-1.5 ${
                          t.archived ? 'bg-invictus-base/20' : 'bg-invictus-base/40'
                        }`}
                      >
                        <span className={`min-w-0 flex-1 truncate text-xs ${t.archived ? 'text-neutral-500' : 'text-neutral-200'}`}>
                          {t.name}
                        </span>
                        {cost > 0 && (
                          <span
                            className={`flex shrink-0 items-center gap-1 text-[11px] font-semibold ${t.archived ? 'text-neutral-500' : 'text-neutral-300'}`}
                            title={`${t.materials!.length} material(s)`}
                          >
                            <Package className="h-3 w-3 text-neutral-500" />
                            {formatMoney(cost)}
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                            t.archived ? 'border-neutral-400/25 bg-invictus-base/60 text-neutral-500' : STATUS_STYLES[t.status]
                          }`}
                        >
                          {t.archived ? 'Archived' : t.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {unplacedTasks.length > 0 && (
                <div className="border-t border-neutral-400/15 pt-4">
                  <Kicker>Place an existing task ({unplacedTasks.length} unplaced)</Kicker>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <InvictusSelect
                        value={pinTaskId}
                        onChange={setPinTaskId}
                        className="bg-invictus-base/60"
                        options={[
                          { value: '', label: 'Choose a task…' },
                          ...unplacedTasks.map((t) => ({ value: t.id, label: t.name })),
                        ]}
                      />
                    </div>
                    <button
                      onClick={handlePinTask}
                      disabled={!pinTaskId}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-40"
                      title={`Pin this task to ${selectedCell.areaKey}`}
                    >
                      <MapPin className="h-3.5 w-3.5" /> Place
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-neutral-500">
                    Tasks made in Task Manager have no location until you put one here — placing one pins it to{' '}
                    {selectedCell.areaKey} and folds its materials into that square&apos;s cost.
                  </p>
                </div>
              )}

              <form onSubmit={handleAssign} className="flex flex-col gap-2 border-t border-neutral-400/15 pt-4">
                <Kicker>Assign a task to {selectedCell.areaKey}</Kicker>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Task name"
                  className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:shadow-glow-strong focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <InvictusSelect
                    value={priority}
                    onChange={(v) => setPriority(v as Priority)}
                    className="bg-invictus-base/60"
                    options={[
                      { value: 'High', label: 'High' },
                      { value: 'Medium', label: 'Medium' },
                      { value: 'Low', label: 'Low' },
                    ]}
                  />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:shadow-glow-strong focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-widest text-neutral-600">
                    Assign to teammates (optional — each has to accept)
                  </p>
                  <AssigneeMultiSelect teammates={teammates} selected={assigneeUids} onToggle={toggleAssignee} />
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
                >
                  <Plus className="h-4 w-4" /> Assign Task
                </button>
                <p className="text-center text-[10px] text-neutral-600">
                  Appears in Task Manager, tagged <span className="text-neutral-400">{selectedCell.areaKey}</span>.
                </p>
              </form>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Show Board — schedule shows and track each show's checklists as red/green
// readiness lights. Lights are flipped manually for now; the per-show
// `completed` map is shaped so a Power Automate feed could flip them later.
// ---------------------------------------------------------------------------

function StatusLight({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border transition-all ${
        on
          ? 'border-emerald-300/80 bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.55)]'
          : 'border-alert/70 bg-alert/80 shadow-[0_0_8px_2px_rgba(255,59,78,0.45)]'
      }`}
    />
  );
}

function ShowsBoard({
  shows,
  sections,
  signedIn,
  onAdd,
  onDelete,
  onToggleChecklist,
}: {
  shows: Show[];
  sections: ChecklistSection[];
  signedIn: boolean;
  onAdd: (show: Show) => void;
  onDelete: (id: string) => void;
  onToggleChecklist: (showId: string, checklistName: string) => void;
}) {
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const { playConfirm } = useSound();

  // Keep the selected show type valid as the team's sections load/change.
  useEffect(() => {
    if (sections.length && !sections.some((s) => s.name === type)) setType(sections[0].name);
  }, [sections, type]);

  const sortedShows = useMemo(
    () => [...shows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [shows]
  );

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !type) return;
    onAdd({ id: genId(), date, type, title: title.trim() || undefined, completed: {} });
    playConfirm();
    setTitle('');
  };

  const formsForType = (showType: string) =>
    sections.find((s) => s.name === showType)?.forms ?? [];

  if (!signedIn) {
    return (
      <div className="space-y-5">
        <Panel title="Show Board" icon={Clapperboard} refCode="0081-S">
          <p className="py-10 text-center text-xs uppercase tracking-widest text-neutral-500">
            Sign in to view and update the shared Show Board.
          </p>
        </Panel>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="space-y-5">
        <Panel title="Show Board" icon={Clapperboard} refCode="0081-S">
          <p className="py-10 text-center text-xs uppercase tracking-widest text-neutral-500">
            No checklists yet. Add checklists on the Checklists page to schedule shows here.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Panel title="Schedule a Show" icon={Plus} refCode="0080-S">
        <form onSubmit={handleSchedule} className="grid grid-cols-1 gap-3 md:grid-cols-[0.8fr_1fr_1.2fr_auto]">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-600">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:shadow-glow-strong focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-600">Show Type</label>
            <InvictusSelect
              value={type}
              onChange={setType}
              className="bg-invictus-base/60"
              options={sections.map((s) => ({ value: s.name, label: s.name }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-600">Label (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Streets — Live"
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:shadow-glow-strong focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          </div>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 self-end rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
          >
            <Plus className="h-4 w-4" /> Schedule
          </button>
        </form>
        <p className="mt-3 text-[10px] uppercase tracking-widest text-neutral-600">
          Tap a checklist&apos;s light to mark it complete for that show · red = outstanding · green = done
        </p>
      </Panel>

      {sortedShows.length === 0 && (
        <Panel title="Show Board" icon={Clapperboard} refCode="0081-S">
          <p className="py-8 text-center text-xs text-neutral-600">No shows scheduled yet.</p>
        </Panel>
      )}

      {sortedShows.map((show) => {
        const forms = formsForType(show.type);
        const done = forms.filter((f) => show.completed[f.name]).length;
        const total = forms.length;
        const ready = total > 0 && done === total;
        return (
          <Panel
            key={show.id}
            title={show.title ? `${show.type} — ${show.title}` : show.type}
            icon={Clapperboard}
            refCode={formatDisplayDate(show.date)}
            tier="primary"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                    ready
                      ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                      : 'border-alert/40 bg-alert/10 text-alert'
                  }`}
                >
                  <StatusLight on={ready} /> {ready ? 'Show Ready' : `${total - done} Outstanding`}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  {done}/{total} complete
                </span>
              </div>
              <button
                onClick={() => onDelete(show.id)}
                className="flex items-center justify-center rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
                title="Remove show"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {forms.length === 0 && (
                <p className="py-3 text-center text-xs text-neutral-600">No checklists defined for this show type.</p>
              )}
              {forms.map((f) => {
                const isDone = Boolean(show.completed[f.name]);
                return (
                  <div
                    key={f.name}
                    className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                      isDone ? 'border-emerald-400/25 bg-emerald-400/[0.04]' : 'border-neutral-400/20 bg-invictus-base/40'
                    }`}
                  >
                    <button
                      onClick={() => onToggleChecklist(show.id, f.name)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      title={isDone ? 'Mark outstanding' : 'Mark complete'}
                    >
                      <StatusLight on={isDone} />
                      <span className={`truncate text-sm ${isDone ? 'text-emerald-200' : 'text-neutral-100'}`}>{f.name}</span>
                    </button>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-md border border-neutral-400/25 bg-invictus-base/60 px-2 py-1 text-[10px] uppercase tracking-widest text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
                      title="Open the Microsoft Form"
                    >
                      Form <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Manager
// ---------------------------------------------------------------------------

function TaskManager({
  tasks,
  archivedTasks,
  offers,
  team,
  currentUid,
  onAdd,
  onUpdateStatus,
  onDelete,
  onArchive,
  onArchiveAllCompleted,
  onAcceptOffer,
  onDeclineOffer,
  onEdit,
  onSetImages,
  onSetMaterials,
  onAddUpdate,
  onFileReport,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  offers: Task[];
  team: TeamMember[];
  currentUid: string;
  onAdd: (task: Task) => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onArchiveAllCompleted: () => void;
  onAcceptOffer: (id: string) => void;
  onDeclineOffer: (id: string) => void;
  onEdit: (
    id: string,
    updates: {
      name: string;
      notes: string;
      priority: Priority;
      dueDate: string;
      category: string;
      area: string;
      pendingUids: string[];
      pendingNames: Record<string, string>;
    }
  ) => void;
  onSetImages: (id: string, images: TaskImage[]) => void;
  onSetMaterials: (id: string, materials: TaskMaterial[]) => void;
  onAddUpdate: (id: string, update: TaskUpdate) => void;
  onFileReport: (task: Task) => void;
}) {
  const completedCount = tasks.filter((t) => t.status === 'Completed').length;
  const todayStr = toDateInputValue(new Date());
  const isOverdueOrToday = (t: Task) =>
    t.status !== 'Completed' && Boolean(t.dueDate) && daysFromToday(t.dueDate, todayStr) <= 0;
  // Groups (categories) are a browsing filter, distinct from the archive-all
  // action above — that stays scoped to every completed task regardless of
  // which group you're currently viewing.
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const categories = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.category).filter((c): c is string => Boolean(c)))).sort(),
    [tasks]
  );
  const visibleTasks = useMemo(
    () => (groupFilter ? tasks.filter((t) => t.category === groupFilter) : tasks),
    [tasks, groupFilter]
  );
  const sortedTasks = useMemo(() => {
    return [...visibleTasks].sort((a, b) => {
      const aPinned = isOverdueOrToday(a) ? 0 : 1;
      const bPinned = isOverdueOrToday(b) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTasks, todayStr]);
  // Quick-add captures name + due date + priority, plus an optional
  // description, group and assignees revealed via their own toggle buttons so
  // the bar stays a single tidy row until you need more than the basics.
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [quickNotes, setQuickNotes] = useState('');
  const [quickCategory, setQuickCategory] = useState('');
  const [quickAssigneeUids, setQuickAssigneeUids] = useState<string[]>([]);
  const [quickArea, setQuickArea] = useState('');
  const [showQuickNotes, setShowQuickNotes] = useState(false);
  const [showQuickGroup, setShowQuickGroup] = useState(false);
  const [showQuickAssign, setShowQuickAssign] = useState(false);
  const [showQuickArea, setShowQuickArea] = useState(false);
  const toggleQuickAssignee = (uid: string) =>
    setQuickAssigneeUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  const { playConfirm } = useSound();
  const { haptic } = usePreferences();
  const teammates = team.filter((m) => m.uid !== currentUid);
  const [filter, setFilter] = useState<'all' | 'overdue' | TaskStatus>('all');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  // Board view drag state — native HTML5 drag-and-drop between status columns.
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  // Strictly overdue (due date in the past) — distinct from isOverdueOrToday
  // above, which also pins today's-due tasks to the top of the sort order.
  const isOverdue = (t: Task) =>
    t.status !== 'Completed' && Boolean(t.dueDate) && daysFromToday(t.dueDate, todayStr) < 0;
  const overdueCount = visibleTasks.filter(isOverdue).length;
  const notStartedCount = visibleTasks.filter((t) => t.status === 'Not Started').length;
  const inProgressCount = visibleTasks.filter((t) => t.status === 'In Progress').length;
  const doneCount = visibleTasks.filter((t) => t.status === 'Completed').length;

  // For the "All" view: overdue tasks get pulled into their own section up
  // top; the remaining status groups below show only the non-overdue rest, so
  // a task never appears twice on the same screen.
  const groupedTasksExcludingOverdue = useMemo(
    () =>
      STATUS_ORDER.map((s) => ({
        status: s,
        items: sortedTasks.filter((t) => t.status === s && !isOverdue(t)),
      })).filter((group) => group.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedTasks, todayStr]
  );
  const overdueTasks = sortedTasks.filter(isOverdue);
  const filteredFlatTasks = useMemo(() => {
    if (filter === 'all' || filter === 'overdue') return [];
    return sortedTasks.filter((t) => t.status === filter);
  }, [sortedTasks, filter]);

  // Inline editing of an existing task.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('Medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editAssigneeUids, setEditAssigneeUids] = useState<string[]>([]);
  const toggleEditAssignee = (uid: string) =>
    setEditAssigneeUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditName(task.name);
    setEditNotes(task.notes ?? '');
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate);
    setEditCategory(task.category ?? '');
    setEditArea(task.area ?? '');
    setEditAssigneeUids(task.pendingUids ?? []);
  };
  const saveEdit = (task: Task) => {
    if (!editName.trim()) return;
    const assignees = teammates.filter((m) => editAssigneeUids.includes(m.uid));
    onEdit(task.id, {
      name: editName.trim(),
      notes: editNotes.trim(),
      priority: editPriority,
      dueDate: editDueDate,
      category: editCategory.trim(),
      area: editArea,
      pendingUids: assignees.map((a) => a.uid),
      pendingNames: Object.fromEntries(assignees.map((a) => [a.uid, a.name])),
    });
    playConfirm();
    setEditingId(null);
  };

  // Photo attachments per task — uploaded to Firebase Storage under tasks/<id>/.
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageTargetId = useRef<string | null>(null);
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const pickImages = (id: string) => {
    imageTargetId.current = id;
    imageInputRef.current?.click();
  };
  const handleImagesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const id = imageTargetId.current;
    if (!files.length || !id) return;
    if (files.some((f) => f.size > 15 * 1024 * 1024)) {
      setImageError('Images must be 15 MB or under.');
      return;
    }
    const task = tasks.find((t) => t.id === id);
    setUploadingImageFor(id);
    setImageError(null);
    try {
      const added: TaskImage[] = [];
      for (const file of files) {
        const path = `tasks/${id}/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        added.push({ url, path, uploadedAt: Date.now() });
      }
      onSetImages(id, [...(task?.images ?? []), ...added]);
      playConfirm();
    } catch (error) {
      console.error('Task image upload failed:', error);
      setImageError('Upload failed — make sure Storage rules allow signed-in uploads.');
    } finally {
      setUploadingImageFor(null);
    }
  };
  const removeImage = (task: Task, img: TaskImage) => {
    deleteObject(storageRef(storage, img.path)).catch(() => {});
    onSetImages(task.id, (task.images ?? []).filter((i) => i.path !== img.path));
  };

  // Materials (products/parts needed) per task. The panel is opened per task
  // from the row's Materials button; the draft is keyed by task id so opening
  // a different task doesn't inherit a half-typed entry.
  const [materialsOpenFor, setMaterialsOpenFor] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState({ name: '', url: '', price: '', quantity: '1' });

  const openMaterials = (id: string) => {
    setMaterialsOpenFor((prev) => (prev === id ? null : id));
    setMaterialDraft({ name: '', url: '', price: '', quantity: '1' });
  };
  const addMaterial = (task: Task) => {
    const name = materialDraft.name.trim();
    if (!name) return;
    const price = parseFloat(materialDraft.price);
    const quantity = parseInt(materialDraft.quantity, 10);
    const material: TaskMaterial = {
      id: genId(),
      name,
      ...(materialDraft.url.trim() ? { url: materialDraft.url.trim() } : {}),
      ...(Number.isFinite(price) && price >= 0 ? { price } : {}),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    };
    onSetMaterials(task.id, [...(task.materials ?? []), material]);
    setMaterialDraft({ name: '', url: '', price: '', quantity: '1' });
    playConfirm();
  };
  // Timeline of dated additions to a task's description. Same open/draft-per-
  // task pattern as materials above.
  const [timelineOpenFor, setTimelineOpenFor] = useState<string | null>(null);
  const [updateDraft, setUpdateDraft] = useState('');

  const openTimeline = (id: string) => {
    setTimelineOpenFor((prev) => (prev === id ? null : id));
    setUpdateDraft('');
  };
  const addUpdate = (task: Task) => {
    const text = updateDraft.trim();
    if (!text) return;
    onAddUpdate(task.id, {
      id: genId(),
      text,
      at: Date.now(),
      byUid: currentUid,
      byName: team.find((m) => m.uid === currentUid)?.name || 'Someone',
    });
    setUpdateDraft('');
    playConfirm();
  };

  const removeMaterial = (task: Task, materialId: string) =>
    onSetMaterials(task.id, (task.materials ?? []).filter((m) => m.id !== materialId));
  const setMaterialQuantity = (task: Task, materialId: string, quantity: number) =>
    onSetMaterials(
      task.id,
      (task.materials ?? []).map((m) => (m.id === materialId ? { ...m, quantity: Math.max(1, quantity) } : m))
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const assignees = teammates.filter((m) => quickAssigneeUids.includes(m.uid));
    onAdd({
      id: genId(),
      name: name.trim(),
      priority,
      dueDate,
      status: 'Not Started',
      ...(quickNotes.trim() ? { notes: quickNotes.trim() } : {}),
      ...(quickCategory.trim() ? { category: quickCategory.trim() } : {}),
      ...(quickArea ? { area: quickArea } : {}),
      ...(assignees.length
        ? {
            pendingUids: assignees.map((a) => a.uid),
            pendingNames: Object.fromEntries(assignees.map((a) => [a.uid, a.name])),
          }
        : {}),
    });
    playConfirm();
    setName('');
    setDueDate('');
    setPriority('Medium');
    setQuickNotes('');
    setQuickCategory('');
    setQuickAssigneeUids([]);
    setQuickArea('');
    setShowQuickNotes(false);
    setShowQuickGroup(false);
    setShowQuickAssign(false);
    setShowQuickArea(false);
  };

  const FILTER_TABS: { key: 'all' | 'overdue' | TaskStatus; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: visibleTasks.length },
    { key: 'overdue', label: 'Overdue', count: overdueCount },
    { key: 'Not Started', label: 'Not started', count: notStartedCount },
    { key: 'In Progress', label: 'In progress', count: inProgressCount },
    { key: 'Completed', label: 'Done', count: doneCount },
  ];

  // One task row — shared by every group/filter view below so the edit form,
  // photo grid, and action buttons are defined (and kept in sync) once.
  // Shared inline edit form — used by both the List row and the Board card,
  // so there's exactly one place that renders it.
  const renderEditForm = (task: Task) => (
    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <input
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        placeholder="Task name"
        className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-2"
      />
      <InvictusSelect
        value={editPriority}
        onChange={(v) => setEditPriority(v as Priority)}
        className="bg-invictus-base/60"
        options={[
          { value: 'High', label: 'High' },
          { value: 'Medium', label: 'Medium' },
          { value: 'Low', label: 'Low' },
        ]}
      />
      <input
        type="date"
        value={editDueDate}
        onChange={(e) => setEditDueDate(e.target.value)}
        className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
      />
      <input
        value={editCategory}
        onChange={(e) => setEditCategory(e.target.value)}
        list="task-group-suggestions-edit"
        placeholder="Group (optional, e.g. CAPEX)"
        className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-2"
      />
      <datalist id="task-group-suggestions-edit">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {/* Editing is also the way to move a task that's in the wrong place —
          the site map only ever adopts tasks that have no location yet. */}
      <div className="sm:col-span-2 lg:col-span-2">
        <InvictusSelect
          value={editArea}
          onChange={setEditArea}
          title="Location on the site map"
          className="bg-invictus-base/60"
          options={[{ value: '', label: 'No location' }, ...SITE_AREA_NAMES.map((a) => ({ value: a, label: a }))]}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-6">
        <p className="mb-1.5 text-[10px] uppercase tracking-widest text-neutral-600">
          Assign to teammates (optional — each has to accept)
        </p>
        <AssigneeMultiSelect teammates={teammates} selected={editAssigneeUids} onToggle={toggleEditAssignee} />
      </div>
      <textarea
        value={editNotes}
        onChange={(e) => setEditNotes(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full min-w-0 resize-y rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-6"
      />
      <div className="flex items-center gap-2 lg:col-span-6">
        <button
          onClick={() => saveEdit(task)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-400/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-400/20"
        >
          <Check className="h-3.5 w-3.5" /> Save
        </button>
        <button
          onClick={() => setEditingId(null)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );

  const renderTaskRow = (task: Task) => {
    if (editingId === task.id) {
      return (
        <div key={task.id} className="p-4">
          {renderEditForm(task)}
        </div>
      );
    }

    const overdue = isOverdue(task);
    return (
      <div key={task.id} className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-1 items-start gap-3">
          <button
            onClick={() => {
              if (task.status !== 'Completed') haptic();
              onUpdateStatus(task.id, task.status === 'Completed' ? 'Not Started' : 'Completed');
            }}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              task.status === 'Completed' ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300' : 'border-neutral-500 hover:border-neutral-300'
            }`}
            title={task.status === 'Completed' ? 'Mark as not started' : 'Mark as done'}
          >
            {task.status === 'Completed' && <Check className="h-3 w-3" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${task.status === 'Completed' ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
              {task.name}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500">
              <span>Due {task.dueDate || '—'}</span>
              {task.category && <span>· {task.category}</span>}
              {task.area && (
                <span className="flex items-center gap-0.5">
                  · <MapPin className="h-3 w-3" /> {task.area}
                </span>
              )}
            </p>
            {/* pre-wrap so multi-line descriptions (e.g. an intake form's
                Location/Department lines) keep their line breaks. */}
            {task.notes && (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">{task.notes}</p>
            )}
            {(task.updates?.length ?? 0) > 0 && timelineOpenFor !== task.id && (
              <button
                onClick={() => openTimeline(task.id)}
                className="mt-1.5 flex items-center gap-1 text-left text-xs text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
              >
                <MessageSquarePlus className="h-3 w-3 shrink-0" />
                {task.updates!.length} update{task.updates!.length === 1 ? '' : 's'} · last{' '}
                {formatUpdateStamp(task.updates![task.updates!.length - 1].at)}
              </button>
            )}
            {((task.pendingUids?.length ?? 0) > 0 || (task.participants?.length ?? 0) > 1) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {(task.pendingUids ?? []).map((uid) => (
                  <span
                    key={uid}
                    className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
                    title="Waiting for them to accept this task"
                  >
                    <UserPlus className="h-3 w-3" /> Awaiting {task.pendingNames?.[uid] || 'accept'}
                  </span>
                ))}
                {(task.participants?.length ?? 0) > 1 && (
                  <span
                    className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
                    title="Shared task — completing it completes it for everyone on it"
                  >
                    <Users className="h-3 w-3" />
                    {(task.participants ?? [])
                      .filter((uid) => uid !== currentUid)
                      .map((uid) => task.participantNames?.[uid] || 'Teammate')
                      .join(', ') || 'Shared'}
                  </span>
                )}
              </div>
            )}
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-8 sm:shrink-0 sm:justify-end sm:pl-0">
            {overdue && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${URGENCY_STYLES.red}`}>
                {formatDueIn(daysFromToday(task.dueDate, todayStr))}
              </span>
            )}
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${PRIORITY_STYLES[task.priority]}`}>
              {task.priority}
            </span>
            {task.category && (
              <span className="flex items-center gap-1 rounded-full border border-neutral-400/25 bg-invictus-raised px-2.5 py-1 text-xs font-medium text-neutral-400">
                <Tag className="h-3 w-3" /> {task.category}
              </span>
            )}
            <InvictusSelect
              value={task.status}
              onChange={(v) => {
                if (v === 'Completed' && task.status !== 'Completed') haptic();
                onUpdateStatus(task.id, v as TaskStatus);
              }}
              compact
              className="w-auto bg-invictus-raised"
              options={[
                { value: 'Not Started', label: 'Not Started' },
                { value: 'In Progress', label: 'In Progress' },
                { value: 'Completed', label: 'Completed' },
              ]}
            />
            <button
              onClick={() => pickImages(task.id)}
              disabled={uploadingImageFor === task.id}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright disabled:opacity-50"
              title="Add photos"
            >
              {uploadingImageFor === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => openMaterials(task.id)}
              className={`flex items-center gap-1.5 rounded-md border p-1.5 transition-all ${
                materialsOpenFor === task.id || (task.materials?.length ?? 0) > 0
                  ? 'border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 text-invictus-crimson-bright'
                  : 'border-neutral-400/30 bg-invictus-base/60 text-neutral-300 hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright'
              }`}
              title="Materials needed for this task"
            >
              <Package className="h-3.5 w-3.5" />
              {(task.materials?.length ?? 0) > 0 && (
                <span className="text-xs font-semibold">{task.materials!.length}</span>
              )}
            </button>
            <button
              onClick={() => openTimeline(task.id)}
              className={`flex items-center gap-1.5 rounded-md border p-1.5 transition-all ${
                timelineOpenFor === task.id || (task.updates?.length ?? 0) > 0
                  ? 'border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 text-invictus-crimson-bright'
                  : 'border-neutral-400/30 bg-invictus-base/60 text-neutral-300 hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright'
              }`}
              title="Add an update — every addition is timestamped"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {(task.updates?.length ?? 0) > 0 && (
                <span className="text-xs font-semibold">{task.updates!.length}</span>
              )}
            </button>
            <button
              onClick={() => startEdit(task)}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
              title="Edit task"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onFileReport(task)}
              className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 px-3 py-1.5 text-xs font-bold text-invictus-crimson-bright transition-all hover:bg-invictus-crimson-bright/20"
              title="File a report for this task"
            >
              <FileText className="h-3.5 w-3.5" />
              Report
            </button>
            {task.status === 'Completed' && (
              <button
                onClick={() => onArchive(task.id)}
                className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
                title="Archive task"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20"
              title="Delete task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {(task.images?.length ?? 0) > 0 && (
          <div className="ml-8 flex flex-wrap gap-2">
            {task.images!.map((img) => (
              <div key={img.path} className="group/img relative h-20 w-20 overflow-hidden rounded-md border border-neutral-400/25">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="Task attachment"
                  className="h-full w-full cursor-zoom-in object-cover"
                  onClick={() => setLightbox(img.url)}
                />
                <button
                  onClick={() => removeImage(task, img)}
                  className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-neutral-300 opacity-0 transition-opacity hover:text-alert group-hover/img:opacity-100"
                  title="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {materialsOpenFor === task.id && (
          <div className="ml-8 rounded-xl border border-neutral-400/25 bg-invictus-base/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                <Package className="h-3 w-3" /> Materials needed
              </p>
              {materialsTotal(task.materials) > 0 && (
                <p className="text-xs font-semibold text-neutral-300">
                  Total {formatMoney(materialsTotal(task.materials))}
                </p>
              )}
            </div>

            {(task.materials?.length ?? 0) > 0 && (
              <div className="mb-3 space-y-1.5">
                {task.materials!.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-400/20 bg-invictus-surface px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      {m.url ? (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm font-medium text-invictus-crimson-bright hover:underline"
                        >
                          {m.name}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-neutral-200">{m.name}</p>
                      )}
                      <p className="text-[11px] text-neutral-500">
                        {m.price != null ? `${formatMoney(m.price)} each` : 'No price'}
                        {m.price != null && m.quantity > 1 ? ` · ${formatMoney(m.price * m.quantity)} total` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setMaterialQuantity(task, m.id, m.quantity - 1)}
                        disabled={m.quantity <= 1}
                        className="rounded border border-neutral-400/25 px-1.5 py-0.5 text-xs text-neutral-400 transition-colors hover:text-neutral-100 disabled:opacity-30"
                        title="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="min-w-[2ch] text-center text-xs font-semibold text-neutral-200">{m.quantity}</span>
                      <button
                        onClick={() => setMaterialQuantity(task, m.id, m.quantity + 1)}
                        className="rounded border border-neutral-400/25 px-1.5 py-0.5 text-xs text-neutral-400 transition-colors hover:text-neutral-100"
                        title="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeMaterial(task, m.id)}
                      className="rounded-md border border-alert/30 bg-alert/10 p-1 text-alert transition-all hover:bg-alert/20"
                      title="Remove material"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1">
                <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Item</label>
                <input
                  value={materialDraft.name}
                  onChange={(e) => setMaterialDraft((d) => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addMaterial(task);
                    }
                  }}
                  placeholder="e.g. Fire door closer"
                  className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none"
                />
              </div>
              <div className="min-w-[10rem] flex-1">
                <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Product link</label>
                <input
                  value={materialDraft.url}
                  onChange={(e) => setMaterialDraft((d) => ({ ...d, url: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addMaterial(task);
                    }
                  }}
                  placeholder="https://… (optional)"
                  className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none"
                />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Price £</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={materialDraft.price}
                  onChange={(e) => setMaterialDraft((d) => ({ ...d, price: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addMaterial(task);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none"
                />
              </div>
              <div className="w-20">
                <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Qty</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={materialDraft.quantity}
                  onChange={(e) => setMaterialDraft((d) => ({ ...d, quantity: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addMaterial(task);
                    }
                  }}
                  className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none"
                />
              </div>
              <button
                onClick={() => addMaterial(task)}
                disabled={!materialDraft.name.trim()}
                className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-3 py-1.5 text-xs font-bold text-invictus-crimson-bright transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>
        )}
        {timelineOpenFor === task.id && (
          <div className="ml-8 rounded-xl border border-neutral-400/25 bg-invictus-base/40 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              <MessageSquarePlus className="h-3 w-3" /> Task timeline
            </p>

            <div className="mb-3 space-y-0">
              {/* The original description opens the timeline, dated from when
                  the task was created. */}
              {task.notes && (
                <div className="relative border-l border-neutral-400/50 pb-3 pl-4">
                  <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-neutral-500" />
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600">
                    Description{task.createdAt ? ` · ${formatUpdateStamp(task.createdAt)}` : ''}
                    {task.ownerName ? ` · ${task.ownerName}` : ''}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{task.notes}</p>
                </div>
              )}
              {(task.updates ?? []).map((u, i, arr) => (
                <div
                  key={u.id}
                  className={`relative pl-4 ${i === arr.length - 1 ? '' : 'border-l border-neutral-400/50 pb-3'}`}
                >
                  <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-invictus-crimson-bright" />
                  {/* The last entry has no full-height line — just a stub down to
                      its own dot, so the timeline visibly terminates. */}
                  {i === arr.length - 1 && <span className="absolute -left-px top-0 h-1.5 border-l border-neutral-400/50" />}
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600">
                    {formatUpdateStamp(u.at)}
                    {u.byName ? ` · ${u.byName}` : ''}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{u.text}</p>
                </div>
              ))}
              {!task.notes && (task.updates?.length ?? 0) === 0 && (
                <p className="text-xs text-neutral-600">No updates yet — add the first one below.</p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Add an update</label>
                <textarea
                  value={updateDraft}
                  onChange={(e) => setUpdateDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; Shift+Enter makes a new line.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addUpdate(task);
                    }
                  }}
                  rows={2}
                  placeholder="What's changed? (Enter to save, Shift+Enter for a new line)"
                  className="w-full resize-y rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none"
                />
              </div>
              <button
                onClick={() => addUpdate(task)}
                disabled={!updateDraft.trim()}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-3 py-1.5 text-xs font-bold text-invictus-crimson-bright transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // One compact card for the Board view. Draggable on desktop (native HTML5
  // drag-and-drop); the chevrons give touch/keyboard users the same "move to
  // the next/previous column" action without needing to drag.
  const renderBoardCard = (task: Task) => {
    if (editingId === task.id) {
      return (
        <div key={task.id} className="rounded-xl border border-neutral-400/20 bg-invictus-base/60 p-3">
          {renderEditForm(task)}
        </div>
      );
    }

    const overdue = isOverdue(task);
    const statusIndex = STATUS_ORDER.indexOf(task.status);
    const moveTo = (dir: -1 | 1) => {
      const next = STATUS_ORDER[statusIndex + dir];
      if (!next) return;
      if (next === 'Completed' && task.status !== 'Completed') haptic();
      onUpdateStatus(task.id, next);
    };

    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => {
          setDraggedTaskId(task.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => setDraggedTaskId(null)}
        className={`cursor-grab space-y-2 rounded-xl border bg-invictus-base/60 p-3 shadow-sm active:cursor-grabbing ${
          overdue ? 'border-l-4 border-l-alert border-neutral-400/20' : 'border-neutral-400/20'
        }`}
      >
        <p className={`text-sm font-semibold ${task.status === 'Completed' ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
          {task.name}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500">
          <span>Due {task.dueDate || '—'}</span>
          {task.category && <span>· {task.category}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {overdue && (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${URGENCY_STYLES.red}`}>
              {formatDueIn(daysFromToday(task.dueDate, todayStr))}
            </span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority}
          </span>
          {task.category && (
            <span className="flex items-center gap-1 rounded-full border border-neutral-400/25 bg-invictus-base/60 px-2 py-0.5 text-[11px] font-medium text-neutral-400">
              <Tag className="h-2.5 w-2.5" /> {task.category}
            </span>
          )}
          {(task.materials?.length ?? 0) > 0 && (
            <span
              className="flex items-center gap-1 rounded-full border border-neutral-400/25 bg-invictus-base/60 px-2 py-0.5 text-[11px] font-medium text-neutral-400"
              title={`${task.materials!.length} material(s) needed`}
            >
              <Package className="h-2.5 w-2.5" /> {task.materials!.length}
              {materialsTotal(task.materials) > 0 ? ` · ${formatMoney(materialsTotal(task.materials))}` : ''}
            </span>
          )}
          {(task.updates?.length ?? 0) > 0 && (
            <span
              className="flex items-center gap-1 rounded-full border border-neutral-400/25 bg-invictus-base/60 px-2 py-0.5 text-[11px] font-medium text-neutral-400"
              title={`${task.updates!.length} timeline update(s)`}
            >
              <MessageSquarePlus className="h-2.5 w-2.5" /> {task.updates!.length}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => moveTo(-1)}
              disabled={statusIndex === 0}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1 text-neutral-400 transition-colors hover:text-neutral-200 disabled:pointer-events-none disabled:opacity-30"
              title={`Move to ${STATUS_ORDER[statusIndex - 1] ?? ''}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => moveTo(1)}
              disabled={statusIndex === STATUS_ORDER.length - 1}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1 text-neutral-400 transition-colors hover:text-neutral-200 disabled:pointer-events-none disabled:opacity-30"
              title={`Move to ${STATUS_ORDER[statusIndex + 1] ?? ''}`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => startEdit(task)}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1 text-neutral-400 transition-colors hover:text-neutral-200"
              title="Edit task"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="rounded-md border border-alert/30 bg-alert/10 p-1 text-alert transition-colors hover:bg-alert/20"
              title="Delete task"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const boardColumns = STATUS_ORDER.map((status) => ({
    status,
    items: sortedTasks.filter((t) => t.status === status),
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Task manager</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {groupFilter
              ? `${visibleTasks.length} active task${visibleTasks.length === 1 ? '' : 's'} in ${groupFilter}`
              : `${tasks.length} active task${tasks.length === 1 ? '' : 's'} across the estate`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-xl border border-neutral-400/20 bg-invictus-surface p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'list' ? 'bg-invictus-raised text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => setViewMode('board')}
            title="Board view is coming soon"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'board' ? 'bg-invictus-raised text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Board
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-400/20 bg-invictus-surface px-4 py-3">
        <Plus className="h-4 w-4 shrink-0 text-neutral-500" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a task and press enter..."
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          title="Due date"
          className="w-auto shrink-0 rounded-md border border-neutral-400/20 bg-invictus-raised px-2 py-1 text-[11px] font-semibold text-neutral-300 focus:outline-none"
        />
        <InvictusSelect
          value={priority}
          onChange={(v) => setPriority(v as Priority)}
          compact
          className="w-auto shrink-0 bg-invictus-raised"
          options={[
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
        />
        <button
          type="button"
          onClick={() => setShowQuickAssign((v) => !v)}
          title="Assign to teammates (optional)"
          className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showQuickAssign || quickAssigneeUids.length > 0
              ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
              : 'border-neutral-400/20 bg-invictus-raised text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" />
          {quickAssigneeUids.length > 0 ? quickAssigneeUids.length : 'Assign'}
        </button>
        <button
          type="button"
          onClick={() => setShowQuickGroup((v) => !v)}
          title="Put this task in a group (optional)"
          className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showQuickGroup || quickCategory.trim()
              ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
              : 'border-neutral-400/20 bg-invictus-raised text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          {quickCategory.trim() || 'Group'}
        </button>
        <button
          type="button"
          onClick={() => setShowQuickArea((v) => !v)}
          title="Pin this task to a place on the site map (optional)"
          className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showQuickArea || quickArea
              ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
              : 'border-neutral-400/20 bg-invictus-raised text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          {quickArea || 'Location'}
        </button>
        <button
          type="button"
          onClick={() => setShowQuickNotes((v) => !v)}
          title="Add a description (optional)"
          className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showQuickNotes || quickNotes.trim()
              ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
              : 'border-neutral-400/20 bg-invictus-raised text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Description
        </button>
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-invictus-crimson-bright px-4 py-2 text-sm font-bold text-invictus-base transition-opacity hover:opacity-90"
        >
          Add task
        </button>

        {showQuickAssign && (
          <div className="w-full border-t border-neutral-400/15 pt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-widest text-neutral-600">
              Assign to teammates (optional — each has to accept)
            </p>
            <AssigneeMultiSelect teammates={teammates} selected={quickAssigneeUids} onToggle={toggleQuickAssignee} />
          </div>
        )}
        {showQuickGroup && (
          <div className="w-full border-t border-neutral-400/15 pt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-widest text-neutral-600">
              Group (optional — e.g. CAPEX. Pick an existing one or type a new name)
            </p>
            <input
              value={quickCategory}
              onChange={(e) => setQuickCategory(e.target.value)}
              list="task-group-suggestions"
              placeholder="e.g. CAPEX"
              className="w-full max-w-xs min-w-0 rounded-md border border-neutral-400/20 bg-invictus-raised px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
            <datalist id="task-group-suggestions">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        )}
        {showQuickArea && (
          <div className="w-full border-t border-neutral-400/15 pt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-widest text-neutral-600">
              Location on the site map (optional — its materials count towards that area&apos;s cost)
            </p>
            <div className="max-w-xs">
              <InvictusSelect
                value={quickArea}
                onChange={setQuickArea}
                className="bg-invictus-raised"
                options={[
                  { value: '', label: 'No location' },
                  ...SITE_AREA_NAMES.map((a) => ({ value: a, label: a })),
                ]}
              />
            </div>
          </div>
        )}
        {showQuickNotes && (
          <div className="w-full border-t border-neutral-400/15 pt-3">
            <textarea
              value={quickNotes}
              onChange={(e) => setQuickNotes(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full min-w-0 resize-y rounded-md border border-neutral-400/20 bg-invictus-raised px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-neutral-400/30 bg-invictus-raised text-neutral-100'
                  : 'border-neutral-400/20 bg-invictus-surface text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {tab.key === 'overdue' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert" />}
              {tab.label}
              <span className={active ? 'text-neutral-400' : 'text-neutral-600'}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <Tag className="h-3.5 w-3.5" /> Groups:
          </span>
          <button
            onClick={() => setGroupFilter(null)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              !groupFilter
                ? 'border-neutral-400/30 bg-invictus-raised text-neutral-100'
                : 'border-neutral-400/20 bg-invictus-surface text-neutral-500 hover:text-neutral-300'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setGroupFilter((prev) => (prev === c ? null : c))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                groupFilter === c
                  ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
                  : 'border-neutral-400/20 bg-invictus-surface text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'board' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {boardColumns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStatus(col.status);
              }}
              onDragLeave={() => setDragOverStatus((s) => (s === col.status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedTaskId) {
                  const task = tasks.find((t) => t.id === draggedTaskId);
                  if (task && task.status !== col.status && col.status === 'Completed') haptic();
                  if (task && task.status !== col.status) onUpdateStatus(draggedTaskId, col.status);
                }
                setDraggedTaskId(null);
                setDragOverStatus(null);
              }}
              className={`flex min-h-[16rem] flex-col gap-3 rounded-2xl border p-3 transition-colors ${
                dragOverStatus === col.status
                  ? 'border-invictus-crimson-bright/50 bg-invictus-crimson-bright/5'
                  : 'border-neutral-400/20 bg-invictus-surface'
              }`}
            >
              <div className="flex items-center gap-2 px-1">
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[col.status]}`}>
                  {col.status}
                </span>
                <span className="text-xs text-neutral-600">{col.items.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {col.items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-neutral-600">No tasks here.</p>
                ) : (
                  col.items.map(renderBoardCard)
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <>
      {offers.length > 0 && (
        <Panel title={`Task Offers (${offers.length})`} icon={Inbox} refCode="0105-O">
          <p className="mb-3 text-xs text-neutral-500">
            Tasks a teammate has assigned to you. Accept to share the task — it appears on
            everyone's board who's accepted it, and any one of you completing it completes it for all.
          </p>
          <div className="space-y-2">
            {offers.map((task) => (
              <div
                key={task.id}
                className="relative flex flex-col gap-3 rounded-md border border-amber-400/40 bg-amber-400/5 p-3 shadow-glow-subtle md:flex-row md:items-center md:justify-between"
              >
                <MicroCorners />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-100">{task.name}</p>
                  <Kicker>
                    From {task.ownerName || 'a teammate'} · Due {task.dueDate || '—'}
                  </Kicker>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {task.area && (
                    <span className="flex items-center gap-1 rounded-full border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                      <MapPin className="h-3 w-3" /> {task.area}
                    </span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                    {task.priority}
                  </span>
                  <button
                    onClick={() => onAcceptOffer(task.id)}
                    className="flex items-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300 transition-all hover:bg-emerald-400/20"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </button>
                  <button
                    onClick={() => onDeclineOffer(task.id)}
                    className="flex items-center gap-1.5 rounded-md border border-alert/30 bg-alert/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-alert transition-all hover:bg-alert/20"
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagesChosen} />
      {imageError && <p className="text-xs text-alert">{imageError}</p>}

      {completedCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={onArchiveAllCompleted}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300"
          >
            <Archive className="h-3.5 w-3.5" /> Archive {completedCount} completed
          </button>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="rounded-2xl border border-neutral-400/20 bg-invictus-surface p-10 text-center">
          <p className="text-sm text-neutral-500">No tasks in queue.</p>
        </div>
      )}

      {filter === 'all' ? (
        <>
          {overdueTasks.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
                Overdue · {overdueTasks.length}
              </p>
              <div className="divide-y divide-neutral-400/15 rounded-2xl border border-l-4 border-neutral-400/20 border-l-alert bg-invictus-surface">
                {overdueTasks.map(renderTaskRow)}
              </div>
            </div>
          )}
          {groupedTasksExcludingOverdue.map((group) => (
            <div key={group.status}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
                {group.status} · {group.items.length}
              </p>
              <div className="divide-y divide-neutral-400/15 rounded-2xl border border-neutral-400/20 bg-invictus-surface">
                {group.items.map(renderTaskRow)}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className={`divide-y divide-neutral-400/15 rounded-2xl border bg-invictus-surface ${
          filter === 'overdue' ? 'border-l-4 border-neutral-400/20 border-l-alert' : 'border-neutral-400/20'
        }`}>
          {(filter === 'overdue' ? overdueTasks : filteredFlatTasks).length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-600">No tasks in this view.</p>
          ) : (
            (filter === 'overdue' ? overdueTasks : filteredFlatTasks).map(renderTaskRow)
          )}
        </div>
      )}
      </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Task attachment" className="max-h-full max-w-full rounded-md object-contain shadow-glow-strong" />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-md border border-neutral-400/30 bg-invictus-base/70 p-2 text-neutral-300 transition-colors hover:text-invictus-crimson-bright"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Archive
// ---------------------------------------------------------------------------

function TaskArchive({
  archivedTasks,
  onRestore,
  onDelete,
}: {
  archivedTasks: Task[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...archivedTasks].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  return (
    <div className="space-y-5">
      <Panel title={`Archived Tasks (${archivedTasks.length})`} icon={Archive} refCode="0105-T">
        <div className="space-y-2">
          {sorted.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">
              No archived tasks yet — completed tasks you archive from Task Manager will show up here.
            </p>
          )}
          {sorted.map((task) => (
            <div
              key={task.id}
              className="relative flex flex-col gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:flex-row md:items-center md:justify-between"
            >
              <MicroCorners />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-400">{task.name}</p>
                <Kicker>
                  Archived {task.archivedAt ? new Date(task.archivedAt).toLocaleDateString() : '—'}
                </Kicker>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>
                <button
                  onClick={() => onRestore(task.id)}
                  className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
                  title="Restore to active tasks"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
                  title="Delete permanently"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const REPORT_KIND_STYLES: Record<ReportEntry['kind'], string> = {
  task: 'text-invictus-crimson-bright border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10',
  compliance: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

function formatCompletedStamp(entry: ReportEntry): string {
  const d = new Date(entry.completedAt);
  const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!entry.hasTimeOfDay) return datePart;
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

async function exportReportsToPdf(entries: ReportEntry[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const crimson: [number, number, number] = [37, 99, 235];
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const generatedAt = new Date();

  drawInvictusCorner(doc, pageW - 40, 46);
  const markBottom = drawDreamlandWordmark(doc, 40, 50);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...crimson);
  doc.text('Completion Reports', 40, markBottom + 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')} · ${entries.length} entries`, 40, markBottom + 45);

  autoTable(doc, {
    startY: markBottom + 62,
    head: [['Type', 'Name', 'Completed', 'Priority / Status', 'Details']],
    body: entries.map((entry) => [
      entry.kind === 'task' ? 'Task' : 'Compliance',
      entry.name,
      `${formatCompletedStamp(entry)}${!entry.hasTimeOfDay ? ' (date only)' : ''}`,
      entry.kind === 'task' ? entry.priority ?? '—' : 'Completed',
      entry.kind === 'task'
        ? entry.dueDate ? `Due ${entry.dueDate}` : '—'
        : [entry.nextDueDate ? `Next due ${entry.nextDueDate}` : null, entry.comments]
            .filter(Boolean)
            .join(' · ') || '—',
    ]),
    headStyles: { fillColor: crimson, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 40, right: 40, bottom: 56 },
    // This table can run to several pages, so stamp the footer on each.
    didDrawPage: () => drawInvictusFooter(doc, 40, pageW - 40, pageH - 30, generatedAt),
  });

  doc.save(`invictus-completion-reports-${toDateInputValue(new Date())}.pdf`);
}

function ReportsPage({
  tasks,
  archivedTasks,
  compliances,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  compliances: ComplianceItem[];
}) {
  const [filter, setFilter] = useState<'all' | 'task' | 'compliance'>('all');
  const [query, setQuery] = useState('');

  const allEntries = useMemo(
    () => buildReportLog(tasks, archivedTasks, compliances),
    [tasks, archivedTasks, compliances]
  );

  const entries = allEntries.filter((entry) => {
    if (filter !== 'all' && entry.kind !== filter) return false;
    if (query.trim() && !entry.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const taskCount = allEntries.filter((e) => e.kind === 'task').length;
  const complianceCount = allEntries.filter((e) => e.kind === 'compliance').length;

  return (
    <div className="space-y-5">
      <Panel title="Completion Reports" icon={FileText} refCode="0110-R">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-400/15 pb-4">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-neutral-300">
              <span className="h-2 w-2 rounded-full bg-invictus-crimson-bright shadow-glow-subtle" />
              <span className="font-mono font-bold tabular-nums">{taskCount}</span> Tasks
            </span>
            <span className="flex items-center gap-1.5 text-xs text-neutral-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-glow-subtle" />
              <span className="font-mono font-bold tabular-nums">{complianceCount}</span> Compliance
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports..."
                className="w-44 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-1.5 pl-8 pr-3 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
              />
            </div>
            <div className="flex overflow-hidden rounded-md border border-neutral-400/30">
              {(['all', 'task', 'compliance'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                    filter === key
                      ? 'bg-invictus-crimson-bright/20 text-invictus-crimson-bright'
                      : 'bg-invictus-base/60 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {key === 'all' ? 'All' : key === 'task' ? 'Tasks' : 'Compliance'}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportReportsToPdf(entries)}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright transition-colors hover:bg-invictus-crimson-bright/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-invictus-crimson-bright/10"
            >
              <Download className="h-3 w-3" />
              Export PDF
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">
              {allEntries.length === 0
                ? 'No completions logged yet — completed tasks and compliance items will show up here.'
                : 'No reports match your filters.'}
            </p>
          )}
          {entries.map((entry) => {
            const Icon = entry.kind === 'task' ? ListChecks : ShieldCheck;
            return (
              <div
                key={entry.id}
                className="relative flex flex-col gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:flex-row md:items-start md:justify-between"
              >
                <MicroCorners />
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${REPORT_KIND_STYLES[entry.kind]}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-100">{entry.name}</p>
                    <Kicker>
                      Completed {formatCompletedStamp(entry)}
                      {!entry.hasTimeOfDay ? ' (date only)' : ''}
                    </Kicker>
                    {entry.kind === 'compliance' && entry.comments && (
                      <p className="mt-1 text-xs text-neutral-500">{entry.comments}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${REPORT_KIND_STYLES[entry.kind]}`}>
                    {entry.kind === 'task' ? 'Task' : 'Compliance'}
                  </span>
                  {entry.kind === 'task' && entry.priority && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[entry.priority]}`}>
                      {entry.priority}
                    </span>
                  )}
                  {entry.kind === 'task' && entry.dueDate && (
                    <Kicker>Due {entry.dueDate}</Kicker>
                  )}
                  {entry.kind === 'compliance' && entry.nextDueDate && (
                    <Kicker>Next due {entry.nextDueDate}</Kicker>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance Tracker
// ---------------------------------------------------------------------------

function ComplianceTracker({
  compliances,
  onAdd,
  onToggle,
  onChangeDate,
  onChangeNextDueDate,
  onChangeComments,
  onDelete,
  onAddAttachment,
  onRemoveAttachment,
}: {
  compliances: ComplianceItem[];
  onAdd: (item: ComplianceItem) => void;
  onToggle: (id: string) => void;
  onChangeDate: (id: string, date: string) => void;
  onChangeNextDueDate: (id: string, date: string) => void;
  onChangeComments: (id: string, comments: string) => void;
  onDelete: (id: string) => void;
  onAddAttachment: (id: string, attachment: ComplianceAttachment) => void;
  onRemoveAttachment: (id: string, path: string) => void;
}) {
  // Group items by division for display, keeping COMPLIANCE_DIVISION_ORDER first
  // and appending any unexpected division at the end. Empty divisions are hidden.
  const divisionGroups = useMemo(() => {
    const byDivision = new Map<string, ComplianceItem[]>();
    for (const item of compliances) {
      const division = classifyComplianceDivision(item.name);
      const bucket = byDivision.get(division);
      if (bucket) bucket.push(item);
      else byDivision.set(division, [item]);
    }
    const ordered = COMPLIANCE_DIVISION_ORDER.filter((d) => byDivision.has(d));
    const extras = [...byDivision.keys()].filter((d) => !COMPLIANCE_DIVISION_ORDER.includes(d as typeof COMPLIANCE_DIVISION_ORDER[number]));
    return [...ordered, ...extras].map((division) => ({ division, items: byDivision.get(division)! }));
  }, [compliances]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [comments, setComments] = useState('');
  const { playConfirm } = useSound();
  const { haptic } = usePreferences();

  // Attach a document (e.g. the latest inspection report) to a compliance item.
  // The file goes to Firebase Storage; the item stores its name + download URL.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickFile = (id: string) => {
    uploadTargetId.current = id;
    fileInputRef.current?.click();
  };
  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file later
    const id = uploadTargetId.current;
    if (!files.length || !id) return;
    if (files.some((f) => f.size > 20 * 1024 * 1024)) {
      setUploadError('Files must be 20 MB or under.');
      return;
    }
    setUploadingId(id);
    setUploadError(null);
    try {
      for (const file of files) {
        const path = `compliance/${id}/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        onAddAttachment(id, { name: file.name, url, path, uploadedAt: Date.now() });
      }
      playConfirm();
    } catch (error) {
      console.error('Attachment upload failed:', error);
      setUploadError(
        'Upload failed — make sure Firebase Storage is set up and its rules allow signed-in uploads.'
      );
    } finally {
      setUploadingId(null);
    }
  };
  const handleRemoveAttachment = (item: ComplianceItem, att: ComplianceAttachment) => {
    deleteObject(storageRef(storage, att.path)).catch(() => {});
    onRemoveAttachment(item.id, att.path);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ id: genId(), name: name.trim(), completed: false, date, nextDueDate, comments });
    playConfirm();
    setName('');
    setDate('');
    setNextDueDate('');
    setComments('');
  };

  return (
    <div className="space-y-5">
      <Panel title="Add Compliance Item" icon={Plus} refCode="0201-C">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Compliance item name"
            className="md:col-span-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-600">Last Completed</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-600">Next Due Date</label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          </div>
          <input
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Comments..."
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <button
            type="submit"
            className="md:col-span-5 flex items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
          >
            <Plus className="h-4 w-4" /> Add Compliance Item
          </button>
        </form>
      </Panel>

      <Panel title="Compliance Tracker" icon={ShieldCheck} refCode="0200-C">
        {/* Shared file picker for attaching reports to items */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChosen} />
        {uploadError && <p className="mb-3 text-xs text-alert">{uploadError}</p>}
        <div className="mb-2 hidden gap-3 px-3 text-[10px] uppercase tracking-widest text-neutral-600 md:grid md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.1fr_auto_auto]">
          <span>Status</span>
          <span>Item</span>
          <span>Last Completed</span>
          <span>Next Due</span>
          <span>Comments</span>
          <span>Report</span>
          <span />
        </div>
        <div className="space-y-4">
          {compliances.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No compliance items logged.</p>
          )}
          {divisionGroups.map(({ division, items }) => {
            const outstanding = items.filter((i) => !i.completed).length;
            return (
              <div key={division} className="space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-100">
                    {division}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">{items.length}</span>
                  {outstanding > 0 && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">{outstanding} due</span>
                  )}
                  <span className="h-px flex-1 bg-neutral-400/10" />
                </div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="relative grid grid-cols-1 items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.1fr_auto_auto]"
                  >
                    <MicroCorners />
                    <button
                      onClick={() => {
                        if (!item.completed) {
                          playConfirm();
                          haptic();
                        }
                        onToggle(item.id);
                      }}
                      className="flex items-center justify-center"
                      title={item.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]" />
                      ) : (
                        <Circle className="h-6 w-6 text-neutral-600" />
                      )}
                    </button>

                    <p className={`text-sm ${item.completed ? 'text-emerald-200' : 'text-neutral-100'}`}>{item.name}</p>

                    <input
                      type="date"
                      value={item.date}
                      onChange={(e) => onChangeDate(item.id, e.target.value)}
                      className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-2 py-1.5 text-xs text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                    />

                    <input
                      type="date"
                      value={item.nextDueDate}
                      onChange={(e) => onChangeNextDueDate(item.id, e.target.value)}
                      className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-2 py-1.5 text-xs text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                    />

                    <input
                      value={item.comments}
                      onChange={(e) => onChangeComments(item.id, e.target.value)}
                      placeholder="Comments..."
                      className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                    />

                    <div className="flex max-w-[240px] flex-wrap items-center gap-1.5">
                      {getComplianceAttachments(item).map((att) => (
                        <span key={att.path} className="flex items-center gap-0.5">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open ${att.name}`}
                            className="flex max-w-[130px] items-center gap-1 rounded-full border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-2 py-1 text-[10px] text-neutral-200 transition-colors hover:bg-invictus-crimson-bright/20"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate">{att.name}</span>
                          </a>
                          <button
                            onClick={() => handleRemoveAttachment(item, att)}
                            title={`Remove ${att.name}`}
                            className="rounded-md border border-neutral-400/30 p-1 text-neutral-500 transition-colors hover:border-alert/40 hover:text-alert"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => pickFile(item.id)}
                        disabled={uploadingId === item.id}
                        title="Attach documents (e.g. inspection reports, certificates)"
                        className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-50"
                      >
                        {uploadingId === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Paperclip className="h-3 w-3" />
                        )}
                        Attach
                      </button>
                    </div>

                    <button
                      onClick={() => onDelete(item.id)}
                      className="flex items-center justify-center rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
                      title="Delete compliance item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-300/90">
            <span className="font-mono tabular-nums">{compliances.filter((c) => !c.completed).length}</span> compliance item(s) outstanding.
          </p>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot splash — a 1s spinning-logo intro before the app loads in.
// ---------------------------------------------------------------------------

function BootSplash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <Pinwheel className="h-20 w-20 animate-spin text-invictus-crimson-bright drop-shadow-glow-subtle [animation-duration:1.1s]" />
      <p className="font-display text-sm uppercase tracking-[0.3em] text-invictus-crimson-bright/80 [text-shadow:var(--glow-text-subtle)]">
        {BRAND_NAME_DOTTED}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

// Only ever true again once this tab has already booted into the tracker —
// module scope, so it survives remounts (e.g. navigating away to Checklists/
// Audits/Estate Requests and back) but resets on a real page reload. Repeat
// visits within the same session skip the splash and land straight on the
// requested tab instead of replaying the boot animation.
let hasBootedThisSession = false;

const VALID_PAGE_KEYS: PageKey[] = [
  'dashboard', 'calendar', 'shows', 'sitemap', 'tasks', 'archive', 'compliance', 'reports', 'admin',
];

export default function InvictusTrackerPage() {
  return (
    <Suspense fallback={null}>
      <InvictusTracker />
    </Suspense>
  );
}

function InvictusTracker() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { profile, team: myTeam } = useProfile();
  const teamId = profile?.teamId ?? null;
  const isDreamland = teamId === DREAMLAND_TEAM_ID;
  const [teamChecklistForms, setTeamChecklistForms] = useState<{ section: string; name: string; description?: string; url: string }[]>([]);
  const [mounted, setMounted] = useState(false);
  const [booting, setBooting] = useState(() => !hasBootedThisSession);
  // Open on the page named in ?page= (used by notification deep-links and by
  // the sidebar's links from Checklists/Audits/Estate Requests), else the
  // dashboard. Validated against the known page keys.
  const [activePage, setActivePage] = useState<PageKey>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const wanted = new URLSearchParams(window.location.search).get('page');
    return wanted && (VALID_PAGE_KEYS as string[]).includes(wanted) ? (wanted as PageKey) : 'dashboard';
  });
  // React to ?page= changes even when this route is reused instead of freshly
  // mounted — reading window.location.search only once (above) can otherwise
  // miss the target page and silently fall back to the dashboard.
  useEffect(() => {
    const wanted = searchParams.get('page');
    if (wanted && (VALID_PAGE_KEYS as string[]).includes(wanted)) {
      setActivePage(wanted as PageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('page')]);
  // When set, the Reports view opens with its form pre-filled to back this task.
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  // Everyone starts with a clean slate — no example tasks/events/compliances.
  // A signed-in user's own saved data loads from Firestore below and replaces
  // these, and anything they add persists to their account from then on.
  const [tasks, setTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [taskOffers, setTaskOffers] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [compliances, setCompliances] = useState<ComplianceItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const loadedForUid = useRef<string | null>(null);
  const readyToSave = useRef(false);

  // Render the app only after mount so live values (e.g. the diagnostics clock)
  // never differ between the server HTML and the first client render. Show a
  // brief spinning-logo splash on the very first load of the session only —
  // navigating back in from Checklists/Audits/Estate Requests (which remounts
  // this page) should land straight on the requested tab, not replay it.
  useEffect(() => {
    setMounted(true);
    if (hasBootedThisSession) return;
    hasBootedThisSession = true;
    const timer = setTimeout(() => setBooting(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Load this user's saved progress from Firestore whenever they sign in.
  useEffect(() => {
    if (!user) {
      loadedForUid.current = null;
      readyToSave.current = false;
      setSyncStatus('idle');
      return;
    }
    if (loadedForUid.current === user.uid) return;
    loadedForUid.current = user.uid;
    readyToSave.current = false;
    setSyncStatus('loading');

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'jarvisState', user.uid));
        const data = snap.data();
        if (data) {
          if (Array.isArray(data.compliances)) setCompliances(data.compliances as ComplianceItem[]);
          if (Array.isArray(data.events)) setEvents(data.events as CalendarEvent[]);

          // One-time migration: tasks used to live inside this per-user doc.
          // Move any leftovers into the shared `tasks` collection (keeping the
          // same ids so a re-run is harmless), then drop them from this doc.
          const legacyTasks = Array.isArray(data.tasks) ? (data.tasks as Task[]) : [];
          const legacyArchived = Array.isArray(data.archivedTasks) ? (data.archivedTasks as Task[]) : [];
          if (legacyTasks.length || legacyArchived.length) {
            const ownerName = user.displayName || user.email || 'Unknown';
            const share = {
              ownerUid: user.uid,
              ownerName,
              participants: [user.uid],
              participantNames: { [user.uid]: ownerName },
            };
            // If a legacy task's id can't be written (e.g. it collides with a
            // doc this user can't touch), remint it under a fresh id rather
            // than failing the whole migration.
            const migrate = async (t: Task, archived: boolean) => {
              const { id, ...rest } = t;
              const payload = { ...rest, ...share, archived };
              try {
                await setDoc(doc(db, 'tasks', id || genId()), payload);
              } catch {
                await setDoc(doc(db, 'tasks', genId()), payload);
              }
            };
            await Promise.all([
              ...legacyTasks.map((t) => migrate(t, false)),
              ...legacyArchived.map((t) => migrate(t, true)),
            ]);
            await setDoc(doc(db, 'jarvisState', user.uid), {
              compliances: Array.isArray(data.compliances) ? data.compliances : [],
              events: Array.isArray(data.events) ? data.events : [],
              updatedAt: Date.now(),
            });
          }
        }
        setSyncStatus('synced');
        setSyncError(null);
      } catch (error) {
        console.error('Failed to load INVICTUS progress:', error);
        setSyncStatus('error');
        setSyncError((error as { code?: string })?.code || (error as Error)?.message || 'Unknown load error');
      } finally {
        readyToSave.current = true;
      }
    })();
  }, [user]);

  // Persist compliances/events to Firestore whenever they change, while signed
  // in. (Tasks live in the shared `tasks` collection and save themselves.)
  useEffect(() => {
    if (!user || !readyToSave.current) return;
    const timeout = setTimeout(() => {
      setDoc(doc(db, 'jarvisState', user.uid), {
        compliances,
        events,
        updatedAt: Date.now(),
      })
        .then(() => {
          setSyncStatus('synced');
          setSyncError(null);
        })
        .catch((error) => {
          console.error('Failed to save INVICTUS progress:', error);
          setSyncStatus('error');
          setSyncError((error as { code?: string })?.code || (error as Error)?.message || 'Unknown save error');
        });
    }, 600);
    return () => clearTimeout(timeout);
  }, [compliances, events, user]);

  // Team roster: everyone who signs in registers themselves in `users`, and the
  // roster is what populates the "assign to" dropdowns.
  useEffect(() => {
    if (!user) {
      setTeam([]);
      return;
    }
    setDoc(
      doc(db, 'users', user.uid),
      {
        name: user.displayName || user.email || 'Unknown',
        email: user.email ?? null,
        lastSeen: Date.now(),
      },
      { merge: true }
    ).catch((error) => console.error('Failed to register user:', error));
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) =>
        setTeam(
          snap.docs.map((d) => {
            const data = d.data() as { name?: string; email?: string | null; role?: string; blocked?: boolean; lastSeen?: number };
            return {
              uid: d.id,
              name: data.name || data.email || 'Unknown',
              email: data.email,
              role: data.role,
              blocked: data.blocked,
              lastSeen: data.lastSeen,
            };
          })
        ),
      (error) => console.error('Team roster subscription failed:', error)
    );
    return unsub;
  }, [user]);

  // Tasks are private by default but live in a shared `tasks` collection:
  // you see a task if you're a participant (owner, or you accepted it). A task
  // offered to you appears separately as an offer until you accept.
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setArchivedTasks([]);
      setTaskOffers([]);
      return;
    }
    // Tasks are private to whoever's on them — you only ever see tasks you're
    // a participant in (owner, or a teammate who accepted a shared offer). No
    // one else, including a team commander, gets automatic access to another
    // person's tasks.
    const mineQ = query(collection(db, 'tasks'), where('participants', 'array-contains', user.uid));
    const unsubMine = onSnapshot(
      mineQ,
      (snap) => {
        const all = snap.docs.map((d) => ({ ...(d.data() as Omit<Task, 'id'>), id: d.id } as Task));
        setTasks(all.filter((t) => !t.archived));
        setArchivedTasks(all.filter((t) => t.archived));
      },
      (error) => console.error('Tasks subscription failed:', error)
    );
    const offersQ = query(collection(db, 'tasks'), where('pendingUids', 'array-contains', user.uid));
    const unsubOffers = onSnapshot(
      offersQ,
      (snap) => setTaskOffers(snap.docs.map((d) => ({ ...(d.data() as Omit<Task, 'id'>), id: d.id } as Task))),
      (error) => console.error('Task offers subscription failed:', error)
    );
    return () => {
      unsubMine();
      unsubOffers();
    };
  }, [user]);

  // The Show Board is a SHARED, live team board scoped to this user's team:
  // shows live in a top-level `shows` collection that everyone in the team
  // (and the Power Automate webhook) reads/writes, so lights update live.
  useEffect(() => {
    if (!user || !teamId) {
      setShows([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'shows'), where('teamId', '==', teamId)),
      (snap) => setShows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Show, 'id'>) }))),
      (error) => console.error('Show board subscription failed:', error)
    );
    return unsub;
  }, [user, teamId]);

  // The team's custom checklists (feeds both the Checklists page and the Show
  // Board's show types / lights).
  useEffect(() => {
    if (!user || !teamId) {
      setTeamChecklistForms([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'checklistForms'), where('teamId', '==', teamId)),
      (snap) => setTeamChecklistForms(snap.docs.map((d) => d.data() as { section: string; name: string; description?: string; url: string })),
      (error) => console.error('Team checklists subscription failed:', error)
    );
    return unsub;
  }, [user, teamId]);

  // Sections available to this team's Show Board: Dreamland's built-ins (only
  // for Dreamland) plus any checklists the team has added, grouped by category.
  const teamSections = useMemo<ChecklistSection[]>(() => {
    const merged: ChecklistSection[] = isDreamland
      ? CHECKLIST_SECTIONS.map((s) => ({ name: s.name, forms: s.forms.map((f) => ({ ...f })) }))
      : [];
    for (const c of teamChecklistForms) {
      const target = merged.find((s) => s.name.trim().toLowerCase() === (c.section ?? '').trim().toLowerCase());
      const entry = { name: c.name, description: c.description, url: c.url };
      if (target) target.forms.push(entry);
      else merged.push({ name: c.section, forms: [entry] });
    }
    return merged;
  }, [teamChecklistForms, isDreamland]);

  const totalItems = tasks.length + compliances.length;
  const completedItems = tasks.filter((t) => t.status === 'Completed').length + compliances.filter((c) => c.completed).length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const isMaster = (user?.email ?? '').toLowerCase() === MASTER_ADMIN_EMAIL;
  const isAdmin = isMaster || (!!user && team.some((m) => m.uid === user.uid && m.role === 'admin'));

  // If the current page gets disabled for this team, fall back to the dashboard.
  useEffect(() => {
    const item = NAV_ITEMS.find((n) => n.key === activePage);
    if (item?.feature && !isMaster && !featureEnabled(myTeam?.features, item.feature)) {
      setActivePage('dashboard');
    }
  }, [activePage, myTeam?.features, isMaster]);

  // All task mutations write straight to the shared `tasks` collection; the
  // live subscriptions above reflect them back into local state (for everyone
  // who can see the task, not just this device).
  const logTaskError = (what: string) => (error: unknown) => console.error(`Failed to ${what}:`, error);
  // Fire a push notification to whoever a task is offered to. Best-effort —
  // the assignment itself is already saved; a failed push is only logged.
  const notifyAssignment = async (targetUid: string, taskName: string, taskId: string) => {
    if (!user || !targetUid || targetUid === user.uid) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUid, taskName, taskId }),
      });
    } catch (error) {
      console.error('Task-assignment notification failed:', error);
    }
  };

  const handleAddTask = (task: Task) => {
    if (!user) return;
    const ownerName = user.displayName || user.email || 'Unknown';
    const { id, ...data } = task;
    setDoc(doc(db, 'tasks', id), {
      ...data,
      createdAt: Date.now(),
      ownerUid: user.uid,
      ownerName,
      teamId: teamId ?? null, // stamp the team so commanders can oversee it
      participants: [user.uid],
      participantNames: { [user.uid]: ownerName },
      pendingUids: task.pendingUids ?? [],
      pendingNames: task.pendingNames ?? {},
      archived: false,
    })
      .then(() => {
        (task.pendingUids ?? []).forEach((uid) => notifyAssignment(uid, task.name, id));
      })
      .catch(logTaskError('add task'));
  };
  const handleUpdateStatus = (id: string, status: TaskStatus) => {
    if (!user) return;
    const task = tasks.find((t) => t.id === id);
    updateDoc(doc(db, 'tasks', id), {
      status,
      completedAt: status === 'Completed' ? task?.completedAt ?? Date.now() : null,
    }).catch(logTaskError('update task status'));
  };
  const handleDeleteTask = (id: string) => {
    if (!user) return;
    deleteDoc(doc(db, 'tasks', id)).catch(logTaskError('delete task'));
  };
  // Edit a task in place — name/priority/due date, and (re)assigning it to a
  // teammates after creation (sets fresh pending offers; an empty list clears
  // all of them, same as before — it just now covers more than one person).
  const handleEditTask = (
    id: string,
    updates: {
      name: string;
      notes: string;
      priority: Priority;
      dueDate: string;
      category: string;
      area: string;
      pendingUids: string[];
      pendingNames: Record<string, string>;
    }
  ) => {
    if (!user) return;
    const prev = tasks.find((t) => t.id === id);
    updateDoc(doc(db, 'tasks', id), updates)
      .then(() => {
        // Only notify people newly added by this edit, not ones already pending.
        const prevPending = new Set(prev?.pendingUids ?? []);
        updates.pendingUids.filter((uid) => !prevPending.has(uid)).forEach((uid) => notifyAssignment(uid, updates.name, id));
      })
      .catch(logTaskError('edit task'));
  };
  const handleSetTaskImages = (id: string, images: TaskImage[]) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { images }).catch(logTaskError('update task images'));
  };
  // Pin an existing task to a place on the site map (it had none until now).
  const handleSetTaskArea = (id: string, area: string) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { area }).catch(logTaskError('set task location'));
  };
  const handleSetTaskMaterials = (id: string, materials: TaskMaterial[]) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { materials }).catch(logTaskError('update task materials'));
  };
  // arrayUnion rather than a whole-array write: several people share a task,
  // and two of them posting an update at once shouldn't drop either entry.
  const handleAddTaskUpdate = (id: string, update: TaskUpdate) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { updates: arrayUnion(update) }).catch(logTaskError('add task update'));
  };
  // Jump to the Reports view with the form pre-filled to back this task.
  const handleFileReport = (task: Task) => {
    setReportDraft({ taskId: task.id, taskName: task.name, title: task.name });
    setActivePage('reports');
  };

  const handleArchiveTask = (id: string) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { archived: true, archivedAt: Date.now() }).catch(logTaskError('archive task'));
  };
  const handleArchiveAllCompleted = () => {
    if (!user) return;
    const now = Date.now();
    tasks
      .filter((t) => t.status === 'Completed')
      .forEach((t) =>
        updateDoc(doc(db, 'tasks', t.id), { archived: true, archivedAt: now }).catch(logTaskError('archive task'))
      );
  };
  const handleRestoreTask = (id: string) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { archived: false, archivedAt: null }).catch(logTaskError('restore task'));
  };
  const handleDeleteArchivedTask = (id: string) => {
    if (!user) return;
    deleteDoc(doc(db, 'tasks', id)).catch(logTaskError('delete archived task'));
  };

  // Task offers: accepting joins you to the task (it becomes shared — visible
  // to everyone on it, and one completion completes it for all of them).
  // Declining just clears your own offer — anyone else still pending, or
  // already a participant, is unaffected.
  const handleAcceptOffer = (id: string) => {
    if (!user) return;
    const myName = user.displayName || user.email || 'Unknown';
    updateDoc(doc(db, 'tasks', id), {
      participants: arrayUnion(user.uid),
      [`participantNames.${user.uid}`]: myName,
      pendingUids: arrayRemove(user.uid),
      [`pendingNames.${user.uid}`]: deleteField(),
    }).catch(logTaskError('accept task offer'));
  };
  const handleDeclineOffer = (id: string) => {
    if (!user) return;
    const myName = user.displayName || user.email || 'Unknown';
    const task = taskOffers.find((t) => t.id === id) ?? tasks.find((t) => t.id === id);
    const stillPending = (task?.pendingUids ?? []).filter((uid) => uid !== user.uid);
    // The owner of an intake request is the requests inbox, not a person who
    // wanted it done — so once everyone offered it has declined and nobody has
    // accepted, there's no one it belongs to. Archive it (rather than delete)
    // so it's out of the task list but still recoverable and auditable.
    const acceptedByOthers = (task?.participants ?? []).filter((uid) => uid !== task?.ownerUid);
    const abandoned =
      task?.source === 'estateRequest' && stillPending.length === 0 && acceptedByOthers.length === 0;

    updateDoc(doc(db, 'tasks', id), {
      pendingUids: arrayRemove(user.uid),
      [`pendingNames.${user.uid}`]: deleteField(),
      ...(abandoned ? { archived: true, archivedAt: Date.now() } : {}),
      updates: arrayUnion({
        id: genId(),
        text: abandoned
          ? `${myName} declined this request. No one else was offered it, so it's been archived.`
          : `${myName} declined this request.`,
        at: Date.now(),
        byUid: user.uid,
        byName: myName,
      }),
    }).catch(logTaskError('decline task offer'));
  };

  const handleAddCompliance = (item: ComplianceItem) => setCompliances((prev) => [...prev, item]);
  const handleToggleCompliance = (id: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c)));
  const handleChangeDate = (id: string, date: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, date } : c)));
  const handleChangeNextDueDate = (id: string, nextDueDate: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, nextDueDate } : c)));
  const handleChangeComments = (id: string, comments: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, comments } : c)));
  const handleAddComplianceAttachment = (id: string, attachment: ComplianceAttachment) =>
    setCompliances((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, attachments: [...getComplianceAttachments(c), attachment], attachment: null } : c
      )
    );
  const handleRemoveComplianceAttachment = (id: string, path: string) =>
    setCompliances((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, attachments: getComplianceAttachments(c).filter((a) => a.path !== path), attachment: null }
          : c
      )
    );
  const handleDeleteCompliance = (id: string) => setCompliances((prev) => prev.filter((c) => c.id !== id));

  const handleAddEvent = (event: CalendarEvent) => setEvents((prev) => [...prev, event]);
  const handleDeleteEvent = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id));
  const handleToggleMeeting = (id: string, date: string) =>
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const completedDates = e.completedDates ?? [];
        return completedDates.includes(date)
          ? { ...e, completedDates: completedDates.filter((d) => d !== date) }
          : { ...e, completedDates: [...completedDates, date] };
      })
    );

  // Writes go straight to the shared `shows` collection; the onSnapshot listener
  // above reflects them back (live) for this user and everyone else.
  const handleAddShow = (show: Show) => {
    if (!user || !teamId) return;
    setDoc(doc(db, 'shows', show.id), { date: show.date, type: show.type, title: show.title ?? null, completed: show.completed, teamId })
      .then(async () => {
        try {
          const token = await user.getIdToken();
          await fetch('/api/notify/show-scheduled', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ showType: show.type, showDate: show.date, showTitle: show.title ?? '', teamId }),
          });
        } catch (error) {
          console.error('Show-scheduled notification failed:', error);
        }
      })
      .catch((e) => console.error('Failed to add show:', e));
  };
  const handleDeleteShow = (id: string) => {
    if (!user) return;
    deleteDoc(doc(db, 'shows', id)).catch((e) => console.error('Failed to delete show:', e));
  };
  const handleToggleShowChecklist = (showId: string, checklistName: string) => {
    if (!user) return;
    const current = shows.find((s) => s.id === showId)?.completed[checklistName] ?? false;
    updateDoc(doc(db, 'shows', showId), { [`completed.${checklistName}`]: !current }).catch((e) =>
      console.error('Failed to update show checklist:', e)
    );
  };

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 z-40 animate-scanlines opacity-[0.07] mix-blend-screen"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 8px)',
        }}
      />

      {mounted && booting && <BootSplash />}

      {mounted && !booting && (
        <div className="relative flex h-full flex-col md:flex-row">
          <AppMobileNav activePage={activePage} onNavigate={setActivePage} isAdmin={isAdmin} features={myTeam?.features} isMaster={isMaster} />
          <AppSidebar activePage={activePage} onNavigate={setActivePage} user={user} syncStatus={syncStatus} syncError={syncError} isAdmin={isAdmin} features={myTeam?.features} isMaster={isMaster} />
          <main className="flex-1 overflow-y-auto p-5 max-md:p-3">
            {activePage === 'dashboard' && (
              <Dashboard
                tasks={tasks}
                archivedTasks={archivedTasks}
                compliances={compliances}
                events={events}
                onToggleMeeting={handleToggleMeeting}
              />
            )}
            {activePage === 'calendar' && (
              <CalendarPage events={events} onAdd={handleAddEvent} onDelete={handleDeleteEvent} />
            )}
            {activePage === 'admin' && isAdmin && user && (
              <AdminPage team={team} user={user} isMaster={isMaster} />
            )}
            {activePage === 'shows' && (
              <ShowsBoard
                shows={shows}
                sections={teamSections}
                signedIn={!!user}
                onAdd={handleAddShow}
                onDelete={handleDeleteShow}
                onToggleChecklist={handleToggleShowChecklist}
              />
            )}
            {activePage === 'sitemap' && (
              <SiteMapPage
                tasks={tasks}
                archivedTasks={archivedTasks}
                team={team}
                currentUid={user?.uid ?? ''}
                onAddTask={handleAddTask}
                onSetTaskArea={handleSetTaskArea}
              />
            )}
            {activePage === 'tasks' && (
              <TaskManager
                tasks={tasks}
                archivedTasks={archivedTasks}
                offers={taskOffers}
                team={team}
                currentUid={user?.uid ?? ''}
                onAdd={handleAddTask}
                onUpdateStatus={handleUpdateStatus}
                onDelete={handleDeleteTask}
                onArchive={handleArchiveTask}
                onArchiveAllCompleted={handleArchiveAllCompleted}
                onAcceptOffer={handleAcceptOffer}
                onDeclineOffer={handleDeclineOffer}
                onEdit={handleEditTask}
                onSetImages={handleSetTaskImages}
                onSetMaterials={handleSetTaskMaterials}
                onAddUpdate={handleAddTaskUpdate}
                onFileReport={handleFileReport}
              />
            )}
            {activePage === 'archive' && (
              <TaskArchive
                archivedTasks={archivedTasks}
                onRestore={handleRestoreTask}
                onDelete={handleDeleteArchivedTask}
              />
            )}
            {activePage === 'compliance' && (
              <ComplianceTracker
                compliances={compliances}
                onAdd={handleAddCompliance}
                onToggle={handleToggleCompliance}
                onChangeDate={handleChangeDate}
                onChangeNextDueDate={handleChangeNextDueDate}
                onChangeComments={handleChangeComments}
                onDelete={handleDeleteCompliance}
                onAddAttachment={handleAddComplianceAttachment}
                onRemoveAttachment={handleRemoveComplianceAttachment}
              />
            )}
            {activePage === 'reports' && (
              <ReportsView
                tasks={tasks.map((t) => ({ id: t.id, name: t.name }))}
                initialDraft={reportDraft}
                onDraftConsumed={() => setReportDraft(null)}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

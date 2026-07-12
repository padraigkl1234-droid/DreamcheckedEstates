'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, onSnapshot, query, where, arrayUnion } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, type User } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useSound } from '@/components/SoundProvider';
import { BRAND_NAME, BRAND_NAME_DOTTED } from '@/lib/brand';
import { CHECKLIST_SECTIONS, type ChecklistSection } from '@/lib/checklists';
import { DREAMLAND_TEAM_ID, featureEnabled, isCommander, type TeamFeatures } from '@/lib/teams';
import { useProfile } from '@/components/ProfileProvider';
import { useT } from '@/components/LanguageProvider';
import { usePreferences } from '@/components/PreferencesProvider';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { InvictusSelect } from '@/components/InvictusSelect';
import { ReportsView, type ReportDraft } from '@/components/ReportsView';
import { Pinwheel } from '@/components/icons/Pinwheel';
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
  Radio,
  Newspaper,
  CheckCircle2,
  Circle,
  AlertTriangle,
  X,
  Gauge,
  ImageOff,
  ExternalLink,
  RefreshCw,
  Cloud,
  Droplets,
  Eye,
  Wind,
  Music2,
  Sun,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  Trophy,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Archive,
  ArchiveRestore,
  TrendingUp,
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
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';
type PageKey = 'dashboard' | 'calendar' | 'shows' | 'sitemap' | 'tasks' | 'archive' | 'compliance' | 'reports' | 'admin';

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
  area?: string; // Dreamland site-map zone this task is pinned to, if any
  // --- Sharing (tasks live in a shared `tasks` collection, private by default) ---
  ownerUid?: string;
  ownerName?: string;
  participants?: string[]; // uids who can see this task (owner + anyone who accepted)
  participantNames?: Record<string, string>;
  pendingUid?: string | null; // person this task is offered to, awaiting their accept
  pendingName?: string | null;
  archived?: boolean;
}

interface TaskImage {
  url: string;
  path: string; // storage path, for deletion
  uploadedAt: number;
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

interface NewsItem {
  title: string;
  link: string;
  image: string | null;
  pubDate: string | null;
}

interface WeatherData {
  temperatureC: number;
  humidity: number;
  windSpeedKmh: number;
  weatherCode: number;
}

function getWeatherInfo(code: number): { label: string; icon: typeof Cloud } {
  if (code === 0) return { label: 'Clear Sky', icon: Sun };
  if (code === 1 || code === 2) return { label: 'Partly Cloudy', icon: CloudSun };
  if (code === 3) return { label: 'Overcast', icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Fog', icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: CloudSnow };
  if (code >= 95 && code <= 99) return { label: 'Thunderstorm', icon: CloudLightning };
  return { label: 'Overcast', icon: Cloud };
}

type WeatherCategory = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

function getWeatherCategory(code: number): WeatherCategory {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
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

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof LayoutDashboard; gapBefore?: boolean; adminOnly?: boolean; feature?: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays, feature: 'calendar' },
  { key: 'shows', label: 'Show Board', icon: Clapperboard, feature: 'showBoard' },
  { key: 'sitemap', label: 'Site Map', icon: MapIcon, feature: 'siteMap' },
  { key: 'tasks', label: 'Task Manager', icon: ListChecks, feature: 'taskManager' },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck, feature: 'compliance' },
  { key: 'archive', label: 'Archive', icon: Archive, gapBefore: true, feature: 'archive' },
  { key: 'reports', label: 'Reports', icon: FileText, feature: 'reports' },
  { key: 'admin', label: 'Team Control', icon: UserCog, gapBefore: true, adminOnly: true },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'text-alert border-alert/40 bg-alert/10 shadow-glow-subtle',
  Medium: 'text-amber-300 border-amber-400/30 bg-amber-400/10 shadow-glow-subtle',
  Low: 'text-neutral-300 border-neutral-400/30 bg-neutral-400/10 shadow-glow-subtle',
};

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

const CATEGORY_TAG_STYLE = 'text-neutral-400 border-neutral-500/40 bg-neutral-500/10';

const STATUS_STYLES: Record<TaskStatus, string> = {
  'Not Started': 'text-neutral-400 border-neutral-500/40 bg-neutral-500/10',
  'In Progress': 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  Completed: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

// Order in which task status groups are shown in the Active Tasks list.
const STATUS_ORDER: TaskStatus[] = ['Not Started', 'In Progress', 'Completed'];

const URGENCY_STYLES: Record<ComplianceUrgency, string> = {
  red: 'text-alert border-alert/50 bg-alert/10 motion-safe:animate-pulse-alert shadow-glow-alert',
  amber: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  green: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
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

function HudCorners({ tone = 'crimson' }: { tone?: 'crimson' | 'amber' }) {
  const c = tone === 'amber' ? 'border-amber-400/70' : 'border-invictus-crimson-bright/70';
  return (
    <>
      <span className={`pointer-events-none absolute -top-px -left-px h-3 w-3 border-l-2 border-t-2 ${c}`} />
      <span className={`pointer-events-none absolute -top-px -right-px h-3 w-3 border-r-2 border-t-2 ${c}`} />
      <span className={`pointer-events-none absolute -bottom-px -left-px h-3 w-3 border-l-2 border-b-2 ${c}`} />
      <span className={`pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-r-2 border-b-2 ${c}`} />
    </>
  );
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
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-neutral-500 ${className}`}>
      <Crosshair className="text-invictus-crimson-bright/40" />
      {children}
    </span>
  );
}

function MicroCorners() {
  return (
    <>
      <span className="pointer-events-none absolute -top-px -left-px h-1.5 w-1.5 border-l border-t border-invictus-crimson-bright/35" />
      <span className="pointer-events-none absolute -top-px -right-px h-1.5 w-1.5 border-r border-t border-invictus-crimson-bright/35" />
      <span className="pointer-events-none absolute -bottom-px -left-px h-1.5 w-1.5 border-l border-b border-invictus-crimson-bright/35" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-1.5 w-1.5 border-r border-b border-invictus-crimson-bright/35" />
    </>
  );
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
            fill="rgba(194,48,74,0.5)"
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
        style={{ filter: 'drop-shadow(0 0 22px rgba(194,48,74,0.45))' }}
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
          <TickRing cx={cx} cy={cy} count={48} rInner={88} rOuter={92} color="rgba(194,48,74,0.7)" />
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
            stroke="rgba(194,48,74,0.9)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="50 18 22 26 14 380"
            style={{ filter: 'drop-shadow(0 0 8px rgba(194,48,74,0.9))' }}
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
            stroke="rgba(194,48,74,0.85)"
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
            stroke="rgba(194,48,74,0.9)"
            strokeWidth={1}
          />
        </svg>

        {/* Innermost fine tick ring hugging the power button, fastest clockwise turn — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_0.4s_linear_infinite]' : 'animate-[spin_8s_linear_infinite]'}`}
        >
          <TickRing cx={cx} cy={cy} count={36} rInner={28} rOuter={32} longEvery={3} longExtra={1.5} color="rgba(194,48,74,0.8)" />
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
    <div className="relative flex h-56 w-56 items-center justify-center">
      <svg viewBox="0 0 200 200" className="absolute h-full w-full -rotate-90">
        <defs>
          <linearGradient id="invictusProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C2304A" />
            <stop offset="100%" stopColor="#9A2236" />
          </linearGradient>
        </defs>

        {/* base ring */}
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />

        {/* progress ring */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#invictusProgressGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.7s ease',
            filter: 'drop-shadow(0 0 3px rgba(194,48,74,0.3))',
          }}
        />

        {/* rotating radar sweep arc */}
        <circle
          cx="100"
          cy="100"
          r={radius - 18}
          fill="none"
          stroke="rgba(194,48,74,0.55)"
          strokeWidth="1.5"
          strokeDasharray="16 220"
          strokeLinecap="round"
          className="animate-[spin_4s_linear_infinite]"
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />

        {/* inner dashed bezel, counter-rotating */}
        <circle
          cx="100"
          cy="100"
          r={radius - 30}
          fill="none"
          stroke="rgba(194,48,74,0.25)"
          strokeWidth="1"
          strokeDasharray="2 5"
          className="animate-[spin_9s_linear_infinite_reverse]"
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-normal tabular-nums tracking-tight text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  activePage,
  onNavigate,
  user,
  syncStatus,
  syncError,
  isAdmin = false,
  features,
  isMaster = false,
}: {
  activePage: PageKey;
  onNavigate: (p: PageKey) => void;
  user: User | null;
  syncStatus: 'idle' | 'loading' | 'synced' | 'error';
  syncError?: string | null;
  isAdmin?: boolean;
  features?: TeamFeatures;
  isMaster?: boolean;
}) {
  const { playHover } = useSound();
  const t = useT();
  const { online } = usePreferences();
  const navItems = NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || isAdmin) && (!item.feature || isMaster || featureEnabled(features, item.feature))
  );
  // Map each sidebar page to its i18n key.
  const navLabelKey: Record<PageKey, string> = {
    dashboard: 'nav.dashboard',
    calendar: 'nav.calendar',
    shows: 'nav.showBoard',
    sitemap: 'nav.siteMap',
    tasks: 'nav.taskManager',
    compliance: 'nav.compliance',
    archive: 'nav.archive',
    reports: 'nav.reports',
    admin: 'nav.teamControl',
  };
  return (
    <aside className="flex w-16 flex-col border-r border-neutral-400/20 bg-invictus-base/70 shadow-glow-subtle backdrop-blur-xl md:w-60">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-neutral-400/20 px-2 md:justify-start md:px-5">
        <Pinwheel className="h-7 w-7 text-invictus-crimson-bright drop-shadow-glow-subtle" />
        <div className="hidden md:block">
          <p className="font-display text-sm font-normal tracking-[0.15em] text-invictus-crimson-bright [text-shadow:var(--glow-text-subtle)]">{BRAND_NAME_DOTTED}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-2 md:p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.key;
          return (
            <React.Fragment key={item.key}>
              {item.gapBefore && <div className="mx-1 my-2 border-t border-neutral-400/15" />}
              <button
                onClick={() => onNavigate(item.key)}
                onMouseEnter={playHover}
                className={`flex items-center justify-center gap-3 rounded-md border px-3 py-2.5 text-xs uppercase tracking-wider transition-all md:justify-start ${
                  active
                    ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100 shadow-glow-strong'
                    : 'border-transparent text-neutral-500 hover:border-invictus-crimson-bright/20 hover:bg-invictus-crimson-bright/5 hover:text-invictus-crimson-bright'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{t(navLabelKey[item.key])}</span>
              </button>
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
        {user && syncStatus === 'error' && syncError && (
          <p className="mt-1 hidden break-words text-[9px] leading-snug text-alert/80 md:block" title={syncError}>
            {syncError}
          </p>
        )}
      </div>
    </aside>
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

function InvictusGreeting({ compliances }: { compliances: ComplianceItem[] }) {
  const { user } = useAuth();
  const [greeting] = useState(() => buildGreeting(user, compliances, new Date()));

  return (
    <div className="relative mb-6 flex items-center gap-3 rounded-md border border-invictus-crimson-bright/25 bg-invictus-crimson-bright/5 px-4 py-3 shadow-glow-subtle">
      <MicroCorners />
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10">
        <Pinwheel className="h-4 w-4 text-invictus-crimson-bright" />
        <ConcentricPulse />
      </div>
      <p className="text-sm text-neutral-100 [text-shadow:var(--glow-text-subtle)]">{greeting}</p>
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
  onOpenSiteMap,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  compliances: ComplianceItem[];
  events: CalendarEvent[];
  animateCardsIn?: boolean;
  onCardsRevealed?: () => void;
  onToggleMeeting: (id: string, date: string) => void;
  onOpenSiteMap?: () => void;
}) {
  const [news, setNews] = useState<{ general: NewsItem[]; football: NewsItem[] }>({
    general: [],
    football: [],
  });
  const [newsStatus, setNewsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const loadNews = async () => {
      try {
        const res = await fetch('/api/jarvis-news');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setNewsStatus('error');
          return;
        }
        setNews({ general: data.general ?? [], football: data.football ?? [] });
        setNewsStatus('ready');
      } catch {
        if (!cancelled) setNewsStatus('error');
      }
    };
    loadNews();
    const newsId = setInterval(loadNews, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(newsId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      try {
        const res = await fetch('/api/jarvis-weather');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setWeatherStatus('error');
          return;
        }
        setWeather(data);
        setWeatherStatus('ready');
      } catch {
        if (!cancelled) setWeatherStatus('error');
      }
    };
    loadWeather();
    const weatherId = setInterval(loadWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(weatherId);
    };
  }, []);

  // Tell the parent once the staggered reveal has finished so re-mounting
  // this component later in the same session (switching tabs and back) won't replay it.
  useEffect(() => {
    if (!animateCardsIn) return;
    const cardCount = 12; // greeting + 11 panels
    const totalMs = (cardCount - 1) * CARD_REVEAL_STEP_MS + CARD_REVEAL_DURATION_MS;
    const timeout = setTimeout(() => onCardsRevealed?.(), totalMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateCardsIn]);

  // Overall task completion — tasks only (active list + archived), not compliances.
  const overallTasks = [...tasks, ...archivedTasks];
  const completedItems = overallTasks.filter((t) => t.status === 'Completed').length;
  const totalItems = overallTasks.length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  // Firestore snapshots don't preserve insertion order, so sort by createdAt.
  const recentTasks = [...tasks].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).slice(-4).reverse();

  const upcomingCompliances = getOutstandingCompliances(compliances).slice(0, 4);

  const timeline = useMemo(
    () => buildCompletionTimeline(tasks, archivedTasks, compliances),
    [tasks, archivedTasks, compliances]
  );
  const timelineTaskTotal = timeline.reduce((sum, p) => sum + p.tasks, 0);
  const timelineComplianceTotal = timeline.reduce((sum, p) => sum + p.compliance, 0);

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

      <Reveal index={1} animate={animateCardsIn}>
        <Panel title="Today's Meetings" icon={CalendarDays} refCode="0035-M" tier="primary">
          <div className="flex flex-col gap-2">
            {todaysMeetings.length === 0 && (
              <p className="py-6 text-center text-xs text-neutral-600">No meetings scheduled today.</p>
            )}
            {todaysMeetings.map((ev) => {
              const done = ev.completedDates?.includes(todayStr) ?? false;
              return (
              <div
                key={ev.id}
                className={`relative flex items-start gap-3 rounded-md border shadow-glow-subtle px-3 py-2.5 ${
                  done ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-neutral-400/20 bg-invictus-base/40'
                }`}
              >
                <MicroCorners />
                <button
                  onClick={() => onToggleMeeting(ev.id, todayStr)}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    done ? 'text-emerald-300' : 'text-neutral-500 hover:text-invictus-crimson-bright'
                  }`}
                  title={done ? 'Mark as not done' : 'Mark as done'}
                  aria-pressed={done}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-1.5 text-sm ${done ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
                    {ev.recurrence && <Repeat className="h-3 w-3 shrink-0 text-neutral-400" />}
                    {ev.time && <span className="shrink-0 font-mono text-xs font-semibold text-invictus-crimson-bright">{formatDisplayTime(ev.time)}</span>}
                    <span className="truncate">{ev.title}</span>
                  </p>
                  {ev.notes && <Kicker>{ev.notes}</Kicker>}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[ev.priority]}`}>
                  {ev.priority}
                </span>
              </div>
              );
            })}
          </div>
        </Panel>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal index={2} animate={animateCardsIn}>
        <Panel title="Overall Tasks Completed" icon={Gauge} refCode="0012-A" tier="primary">
          <div className="flex flex-1 items-center justify-center py-2">
            <CircularProgress percentage={completionPct} />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-neutral-400/15 pt-4 text-center">
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-emerald-300">{completedItems}</p>
              <Kicker className="justify-center">Completed</Kicker>
            </div>
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-neutral-200">{totalItems - completedItems}</p>
              <Kicker className="justify-center">Outstanding</Kicker>
            </div>
          </div>
        </Panel>
        </Reveal>

        <Reveal index={3} animate={animateCardsIn}>
        <Panel title="Recently Added Tasks" icon={ListChecks} refCode="0027-T" tier="primary">
          <div className="flex flex-col gap-2">
            {recentTasks.length === 0 && (
              <p className="py-6 text-center text-xs text-neutral-600">No tasks logged yet.</p>
            )}
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="relative flex items-center justify-between gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle px-3 py-2.5"
              >
                <MicroCorners />
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-100">{task.name}</p>
                  <Kicker>Due {task.dueDate || '—'}</Kicker>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[task.status]}`}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        </Reveal>

        <Reveal index={4} animate={animateCardsIn}>
        <Panel title="Compliance Countdown" icon={ShieldCheck} refCode="0030-C" tier="primary">
          <div className="flex flex-col gap-2">
            {upcomingCompliances.length === 0 && (
              <p className="py-6 text-center text-xs text-neutral-600">No outstanding compliance items.</p>
            )}
            {upcomingCompliances.map(({ item, daysUntilDue, urgency }) => (
              <div
                key={item.id}
                className="relative flex items-center justify-between gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle px-3 py-2.5"
              >
                <MicroCorners />
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-100">{item.name}</p>
                  <Kicker>Due {item.nextDueDate || '—'}</Kicker>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${URGENCY_STYLES[urgency]}`}>
                  {formatDueIn(daysUntilDue)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.8fr_1fr]">
        <Reveal index={5} animate={animateCardsIn}>
          <CompletionTimelinePanel
            timeline={timeline}
            taskTotal={timelineTaskTotal}
            complianceTotal={timelineComplianceTotal}
          />
        </Reveal>
        <Reveal index={6} animate={animateCardsIn}>
          <SiteHeatmap tasks={tasks} onOpen={onOpenSiteMap} />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal index={7} animate={animateCardsIn}>
          <WeatherPanel weather={weather} status={weatherStatus} tier="ambient" />
        </Reveal>
        <Reveal index={8} animate={animateCardsIn}>
          <NewsPanel
            title="BBC News Feed"
            icon={Newspaper}
            refCode="0091-N"
            items={news.general}
            status={newsStatus}
            tier="ambient"
          />
        </Reveal>
        <Reveal index={9} animate={animateCardsIn}>
          <NewsPanel
            title="Football News"
            icon={Trophy}
            refCode="0093-F"
            items={news.football}
            status={newsStatus}
            tier="ambient"
          />
        </Reveal>
      </div>
    </div>
  );
}

function CompletionTimelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const tasks = payload.find((p) => p.dataKey === 'tasks')?.value ?? 0;
  const compliance = payload.find((p) => p.dataKey === 'compliance')?.value ?? 0;
  return (
    <div className="rounded-md border border-neutral-400/30 bg-invictus-base/95 px-3 py-2 shadow-glow-subtle backdrop-blur-xl">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="flex items-center gap-2 text-xs text-neutral-100">
        <span className="h-2 w-2 rounded-full bg-invictus-crimson-bright" /> Tasks: {tasks}
      </p>
      <p className="flex items-center gap-2 text-xs text-neutral-100">
        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Compliance: {compliance}
      </p>
    </div>
  );
}

function CompletionTimelinePanel({
  timeline,
  taskTotal,
  complianceTotal,
}: {
  timeline: TimelinePoint[];
  taskTotal: number;
  complianceTotal: number;
}) {
  return (
    <Panel title="Completion Timeline" icon={TrendingUp} refCode="0040-X" tier="primary">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Kicker>Last {TIMELINE_DAYS} days</Kicker>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span className="h-2 w-2 rounded-full bg-invictus-crimson-bright shadow-glow-subtle" />
            <span className="font-mono font-bold tabular-nums">{taskTotal}</span> Tasks
          </span>
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-glow-subtle" />
            <span className="font-mono font-bold tabular-nums">{complianceTotal}</span> Compliance
          </span>
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="timelineTasksGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C2304A" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#C2304A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="timelineComplianceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(163,163,163,0.7)', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              interval={Math.ceil(TIMELINE_DAYS / 7) - 1}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'rgba(163,163,163,0.7)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip content={<CompletionTimelineTooltip />} cursor={{ stroke: 'rgba(194,48,74,0.3)' }} />
            <Area
              type="monotone"
              dataKey="tasks"
              stroke="#C2304A"
              strokeWidth={2}
              fill="url(#timelineTasksGradient)"
              activeDot={{ r: 4, fill: '#C2304A' }}
            />
            <Area
              type="monotone"
              dataKey="compliance"
              stroke="#34D399"
              strokeWidth={2}
              fill="url(#timelineComplianceGradient)"
              activeDot={{ r: 4, fill: '#34D399' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function WeatherPanel({
  weather,
  status,
  tier = 'primary',
}: {
  weather: WeatherData | null;
  status: 'loading' | 'ready' | 'error';
  tier?: 'primary' | 'ambient';
}) {
  const info = weather ? getWeatherInfo(weather.weatherCode) : null;
  const WeatherIcon = info?.icon ?? Cloud;

  // Live local clock, shown alongside the weather. The dashboard only renders
  // client-side (behind the mounted gate), so this never mismatches on hydration.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel title="Margate · Time & Weather" icon={WeatherIcon} refCode="0061-W" tier={tier}>
      <div className="mb-4 border-b border-neutral-400/15 pb-4 text-center">
        <p className="font-mono text-2xl font-bold tabular-nums tracking-widest text-neutral-200 [text-shadow:var(--glow-text-subtle)]">
          {now.toLocaleTimeString('en-GB')}
        </p>
        <p className="text-[10px] uppercase tracking-widest text-neutral-600">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-10 text-neutral-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <p className="text-xs uppercase tracking-widest">Acquiring feed...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2 py-10 text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-center text-xs uppercase tracking-widest">Weather uplink unavailable</p>
        </div>
      )}

      {status === 'ready' && weather && info && (
        <div className="flex h-full flex-col gap-4">
          <div className="text-center">
            <div className="mb-1 flex items-center justify-center gap-2">
              <WeatherIcon className="h-6 w-6 text-neutral-300" />
              <span className="font-mono text-2xl font-bold tabular-nums text-neutral-200 [text-shadow:var(--glow-text-subtle)]">
                {weather.temperatureC}°C
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-600">{info.label} · Margate, UK</p>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-neutral-400/15 pt-4 text-center">
            <div>
              <Droplets className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
              <p className="font-mono text-xs text-neutral-200">{weather.humidity}%</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-600">Humidity</p>
            </div>
            <div>
              <Wind className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
              <p className="font-mono text-xs text-neutral-200">{weather.windSpeedKmh}km/h</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-600">Wind</p>
            </div>
          </div>

          <WeatherScene category={getWeatherCategory(weather.weatherCode)} />
        </div>
      )}
    </Panel>
  );
}

function WeatherScene({ category }: { category: WeatherCategory }) {
  return (
    <div className="relative min-h-[90px] flex-1 overflow-hidden rounded-md border border-neutral-400/15 bg-invictus-base/40">
      {category === 'clear' && <SunScene />}
      {category === 'partly-cloudy' && <CloudScene withSun />}
      {category === 'cloudy' && <CloudScene />}
      {category === 'fog' && <FogScene />}
      {category === 'rain' && <RainScene />}
      {category === 'snow' && <SnowScene />}
      {category === 'storm' && <StormScene />}
    </div>
  );
}

function SunScene() {
  const sparkles = Array.from({ length: 6 });
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute h-16 w-16 rounded-full bg-amber-300/20 blur-xl animate-pulse" />
      <Sun className="relative h-12 w-12 text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.3)] animate-[spin_18s_linear_infinite]" />
      {sparkles.map((_, i) => (
        <span
          key={i}
          className="absolute bottom-3 h-1 w-1 rounded-full bg-amber-200/80 animate-float-sparkle"
          style={{
            left: `${14 + i * 14}%`,
            animationDuration: `${2.6 + i * 0.4}s`,
            animationDelay: `${i * 0.45}s`,
          }}
        />
      ))}
    </div>
  );
}

function CloudScene({ withSun = false }: { withSun?: boolean }) {
  return (
    <div className="relative h-full w-full">
      {withSun && (
        <Sun className="absolute left-[30%] top-[22%] h-9 w-9 text-amber-300/80 drop-shadow-[0_0_4px_rgba(251,191,36,0.25)] animate-[spin_22s_linear_infinite]" />
      )}
      <Cloud
        className="absolute top-1/2 h-12 w-12 -translate-y-1/2 text-neutral-300 drop-shadow-[0_0_4px_rgba(255,255,255,0.18)] animate-cloud-drift"
        style={{ left: '22%' }}
      />
      <Cloud
        className="absolute top-[62%] h-7 w-7 text-neutral-400/50 animate-cloud-drift"
        style={{ left: '54%', animationDuration: '13s', animationDirection: 'reverse' }}
      />
    </div>
  );
}

function FogScene() {
  const bands = Array.from({ length: 3 });
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2.5">
      <CloudFog className="mb-1 h-9 w-9 text-neutral-300/80 drop-shadow-[0_0_4px_rgba(255,255,255,0.15)]" />
      {bands.map((_, i) => (
        <span
          key={i}
          className="h-1 w-[70%] rounded-full bg-neutral-400/30 animate-fog-drift"
          style={{ animationDuration: `${8 + i * 2}s`, animationDelay: `${i * 0.6}s` }}
        />
      ))}
    </div>
  );
}

function RainScene() {
  const drops = Array.from({ length: 10 });
  return (
    <div className="relative h-full w-full">
      <CloudRain className="absolute left-1/2 top-[18%] h-11 w-11 -translate-x-1/2 text-neutral-300 drop-shadow-[0_0_4px_rgba(255,255,255,0.18)]" />
      {drops.map((_, i) => (
        <span
          key={i}
          className="absolute top-[52%] w-[2px] h-2.5 rounded-full bg-neutral-400/70 animate-rain-fall"
          style={{
            left: `${8 + i * 9}%`,
            animationDuration: `${0.6 + (i % 3) * 0.15}s`,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function SnowScene() {
  const flakes = Array.from({ length: 9 });
  return (
    <div className="relative h-full w-full">
      <CloudSnow className="absolute left-1/2 top-[16%] h-11 w-11 -translate-x-1/2 text-neutral-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.18)]" />
      {flakes.map((_, i) => (
        <span
          key={i}
          className="absolute top-[48%] h-1.5 w-1.5 rounded-full bg-neutral-100/80 animate-snow-fall"
          style={{
            left: `${6 + i * 10}%`,
            animationDuration: `${3 + (i % 4) * 0.6}s`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}

function StormScene() {
  const drops = Array.from({ length: 8 });
  return (
    <div className="relative h-full w-full">
      <Cloud className="absolute left-1/2 top-[14%] h-11 w-11 -translate-x-1/2 text-neutral-300/90" />
      <CloudLightning className="absolute left-1/2 top-[34%] h-8 w-8 -translate-x-1/2 text-amber-300 drop-shadow-glow-caution animate-bolt-flash" />
      {drops.map((_, i) => (
        <span
          key={i}
          className="absolute top-[58%] w-[2px] h-2.5 rounded-full bg-neutral-400/70 animate-rain-fall"
          style={{
            left: `${10 + i * 11}%`,
            animationDuration: `${0.55 + (i % 3) * 0.15}s`,
            animationDelay: `${i * 0.14}s`,
          }}
        />
      ))}
    </div>
  );
}

function NewsPanel({
  title,
  icon,
  refCode,
  items,
  status,
  tier = 'primary',
}: {
  title: string;
  icon: typeof Gauge;
  refCode: string;
  items: NewsItem[];
  status: 'loading' | 'ready' | 'error';
  tier?: 'primary' | 'ambient';
}) {
  return (
    <Panel title={title} icon={icon} refCode={refCode} tier={tier}>
      <div className="flex items-center gap-1.5 pb-3">
        <Radio className="h-3 w-3 text-alert motion-safe:animate-pulse-alert" />
        <span className="text-[10px] uppercase tracking-widest text-alert [text-shadow:var(--glow-text-strong-red)]">Live</span>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-10 text-neutral-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <p className="text-xs uppercase tracking-widest">Acquiring feed...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2 py-10 text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-center text-xs uppercase tracking-widest">Feed uplink unavailable</p>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className="py-10 text-center text-xs text-neutral-600">No headlines returned.</p>
      )}

      {status === 'ready' && items.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {items.map((item, i) => (
            <NewsCard key={`${item.link}-${i}`} item={item} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = item.image && !imgFailed;

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-2 shadow-glow-subtle transition-all hover:border-invictus-crimson-bright/60 hover:bg-invictus-crimson-bright/5 hover:shadow-glow-strong"
    >
      <MicroCorners />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-400/20 bg-invictus-base">
        {showImage ? (
          <img
            src={item.image ?? ''}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImageOff className="h-4 w-4 text-neutral-600" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <p className="line-clamp-2 text-xs text-neutral-100 group-hover:text-neutral-50">{item.title}</p>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-600">
          {item.pubDate && <span>{formatRelativeTime(item.pubDate)}</span>}
          <ExternalLink className="h-2.5 w-2.5" />
        </div>
      </div>
    </a>
  );
}

function Panel({
  title,
  icon: Icon,
  refCode,
  tier = 'primary',
  children,
}: {
  title: string;
  icon: typeof Gauge;
  refCode?: string;
  tier?: 'primary' | 'ambient';
  children: React.ReactNode;
}) {
  const isAmbient = tier === 'ambient';
  return (
    <div
      className={
        isAmbient
          ? 'relative flex h-full flex-col border border-neutral-400/10 bg-invictus-base/50 p-6 shadow-glow-none backdrop-blur-xl'
          : 'relative flex h-full flex-col border border-neutral-400/30 bg-invictus-base/50 p-6 shadow-glow-subtle backdrop-blur-xl'
      }
    >
      <HudCorners />
      <div
        className={
          isAmbient
            ? 'mb-4 flex items-center justify-between gap-2 border-b border-neutral-400/15 pb-4'
            : 'mb-4 flex items-center justify-between gap-2 border-b border-neutral-400/20 pb-4'
        }
      >
        <div className="flex items-center gap-2">
          <Icon
            className={
              isAmbient
                ? 'h-4 w-4 text-neutral-500/70'
                : 'h-4 w-4 text-neutral-300 drop-shadow-glow-subtle'
            }
          />
          <h2
            className={
              isAmbient
                ? 'font-display text-[11px] font-normal uppercase tracking-[0.2em] text-neutral-500/70'
                : 'font-display text-sm font-normal uppercase tracking-[0.2em] text-neutral-300 [text-shadow:var(--glow-text-subtle)]'
            }
          >
            {title}
          </h2>
        </div>
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

const SITE_BOUNDARY: Pt[] = [
  [19, 144], [300, 126], [644, 127], [853, 465], [965, 705],
  [706, 858], [420, 773], [290, 674], [64, 386],
];
const CAR_PARK_POLY: Pt[] = [[426, 220], [644, 127], [853, 465], [486, 457]];
const EAST_PARK_POLY: Pt[] = [[648, 470], [812, 360], [905, 600], [800, 720], [690, 612]];
const CLUSTER_POLY: Pt[] = [
  [30, 148], [330, 150], [348, 230], [330, 300], [250, 358], [110, 360], [55, 300], [30, 205],
];

type ZoneTone = 'area' | 'storage' | 'building';
interface SiteZone {
  label: string;
  x: number; y: number; w: number; h: number;
  rot?: number;       // box rotation (deg)
  labelRot?: number;  // text rotation (deg) — defaults to rot
  tone?: ZoneTone;
  noBadge?: boolean;  // skip task badge (for duplicate-labelled boxes)
}

// Working zones, positioned to match the user's marked-up plan.
const SITE_ZONES: SiteZone[] = [
  // Frontage / peripheral buildings (sit north of the boundary, still clickable)
  { label: 'Cinema', x: 30, y: 44, w: 84, h: 34, tone: 'building' },
  { label: 'Cinque Ports', x: 143, y: 57, w: 62, h: 47, tone: 'building' },
  { label: 'Ballroom', x: 33, y: 146, w: 58, h: 55, tone: 'building' },
  { label: 'Hall by the Sea', x: 71, y: 251, w: 62, h: 89, tone: 'building' },
  // Operational areas
  { label: 'Concourse', x: 96, y: 150, w: 46, h: 50, tone: 'area' },
  { label: 'Ingress', x: 176, y: 152, w: 152, h: 45, tone: 'area' },
  { label: 'Roller Area', x: 138, y: 205, w: 188, h: 63, tone: 'area' },
  { label: 'Transit Area', x: 170, y: 287, w: 93, h: 57, tone: 'area' },
  { label: 'Food Court', x: 198, y: 352, w: 100, h: 183, tone: 'area' },
  { label: 'Scenic Stage', x: 301, y: 352, w: 42, h: 183, tone: 'area', labelRot: -90 },
  { label: 'Scenic Railway', x: 346, y: 352, w: 59, h: 185, tone: 'area', labelRot: -90 },
  { label: 'Scenic Railway', x: 341, y: 214, w: 62, h: 89, tone: 'area', labelRot: -90, noBadge: true },
  { label: 'Shed', x: 331, y: 306, w: 84, h: 26, tone: 'area' },
  { label: 'Teddy & Betty / Ark', x: 442, y: 348, w: 62, h: 148, rot: -28, tone: 'area' },
  { label: 'VIP', x: 128, y: 375, w: 44, h: 80, rot: -50, tone: 'area' },
  { label: 'Container Toilets', x: 318, y: 566, w: 100, h: 34, tone: 'area' },
  // Rides (several pitches share the label)
  { label: 'Rides', x: 430, y: 520, w: 80, h: 44, tone: 'area' },
  { label: 'Rides', x: 458, y: 580, w: 54, h: 80, tone: 'area', noBadge: true },
  { label: 'Rides', x: 392, y: 700, w: 92, h: 32, tone: 'area', noBadge: true },
  { label: 'Rides', x: 325, y: 634, w: 128, h: 46, rot: -34, tone: 'area', noBadge: true },
  { label: 'Rides', x: 250, y: 560, w: 66, h: 27, tone: 'area', noBadge: true },
  // Logistics (SE)
  { label: 'Boneyard', x: 660, y: 405, w: 150, h: 388, tone: 'storage' },
  { label: 'Bars storage', x: 505, y: 662, w: 148, h: 126, tone: 'storage' },
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

const SITE_FEATURES: { label: string; poly: Pt[]; cx: number; cy: number }[] =
  SITE_ZONES.map((z) => ({ label: z.label, poly: zoneCorners(z), cx: z.x + z.w / 2, cy: z.y + z.h / 2 }));

const GRID_COLS = 14;
const GRID_ROWS = 12;
const CELL_W = 1000 / GRID_COLS;
const CELL_H = 900 / GRID_ROWS;
const COL_LETTERS = 'ABCDEFGHIJKLMN';

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
        SITE_FEATURES.find((f) => pointInPolygon(cx, cy, f.poly))?.label ??
        SITE_FEATURES.find((f) => inCell(f.cx, f.cy))?.label ??
        SITE_FEATURES.find((f) => f.poly.some(([px, py]) => inCell(px, py)))?.label ??
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
const MAP_C = {
  crimson: '#dc2626',
  line: 'rgba(220,38,38,0.30)',
  lineStrong: 'rgba(220,38,38,0.45)',
  boundaryFill: '#16171c',
  passive: '#1d1e23',
  passiveStroke: 'rgba(160,160,170,0.18)',
  green: 'rgba(16,185,129,0.10)',
  greenStroke: 'rgba(16,185,129,0.30)',
  label: '#d4d4d4',
  labelDim: '#8a8a8a',
};

const ZONE_TONE: Record<ZoneTone, { fill: string; stroke: string; text: string }> = {
  area: { fill: 'rgba(220,38,38,0.16)', stroke: '#dc2626', text: '#f1d2d2' },
  storage: { fill: 'rgba(220,38,38,0.09)', stroke: 'rgba(220,38,38,0.65)', text: '#e6c3c3' },
  building: { fill: 'rgba(120,20,24,0.32)', stroke: '#dc2626', text: '#e9bcbc' },
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

// A compact, unlabelled thermal heat-map of the site for the dashboard.
// Rendered like a thermal camera: each busy area emits a soft radial "energy"
// blob; the blobs are blurred so neighbours blend, then the accumulated
// intensity is mapped through the red→orange→yellow ramp via an SVG filter
// (feGaussianBlur → alpha-to-intensity → feComponentTransfer colour tables).
// Overlapping hotspots genuinely add up and glow hotter.
function SiteHeatmap({ tasks, onOpen }: { tasks: Task[]; onOpen?: () => void }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of tasks) {
      if (t.area && t.status !== 'Completed') c[t.area] = (c[t.area] ?? 0) + 1;
    }
    return c;
  }, [tasks]);

  const max = useMemo(() => Math.max(0, ...Object.values(counts)), [counts]);
  const totalActive = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);
  const hottest = useMemo(
    () => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3),
    [counts]
  );

  const heatFor = (count: number): string => {
    if (count <= 0) return '#191a20';
    const t = max <= 0 ? 0 : 0.18 + 0.82 * (count / max);
    return heatColor(t);
  };

  // One soft hotspot per busy area — zone centroids for named zones (the
  // primary rect only, so duplicate-labelled pitches don't multiply the heat),
  // cell centres for open-ground squares. Ellipses follow each zone's
  // footprint so elongated areas (Boneyard, Food Court) read as a ridge of
  // heat rather than one huge circle.
  const hotspots = useMemo(() => {
    const spots: { cx: number; cy: number; rx: number; ry: number; rot: number; count: number }[] = [];
    for (const z of SITE_ZONES) {
      if (z.noBadge) continue;
      const count = counts[z.label] ?? 0;
      if (count <= 0) continue;
      spots.push({
        cx: z.x + z.w / 2,
        cy: z.y + z.h / 2,
        rx: Math.min(z.w / 2 + 40, 150),
        ry: Math.min(z.h / 2 + 40, 150),
        rot: z.rot ?? 0,
        count,
      });
    }
    for (const c of SITE_CELLS) {
      if (!c.inside || c.landmark) continue;
      const count = counts[c.areaKey] ?? 0;
      if (count <= 0) continue;
      spots.push({ cx: c.cx, cy: c.cy, rx: 60, ry: 60, rot: 0, count });
    }
    return spots;
  }, [counts]);

  return (
    <Panel title="Workload Heatmap" icon={MapIcon} refCode="0117-H" tier="primary">
      {totalActive === 0 ? (
        <p className="py-10 text-center text-xs text-neutral-600">
          No active tasks assigned to the site yet — assign tasks on the Site Map to light up the heat.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpen}
            className="group relative block w-full overflow-hidden rounded-md border border-neutral-400/20 bg-[#0b0b0c] transition-colors hover:border-invictus-crimson-bright/50"
            title="Open the full Site Map"
          >
            <svg viewBox="0 0 1000 900" className="mx-auto h-auto w-full max-w-sm" role="img" aria-label="Site workload heatmap">
              <defs>
                {/* Soft radial falloff for a single heat source. */}
                <radialGradient id="heat-blob">
                  <stop offset="0%" stopColor="#fff" stopOpacity={1} />
                  <stop offset="45%" stopColor="#fff" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                </radialGradient>
                {/* Thermal colormap: blur the white blobs so they merge, read
                    the accumulated alpha as intensity, then map intensity
                    through the dark-red → crimson → orange → amber ramp. */}
                <filter id="heat-thermal" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation={16} />
                  <feColorMatrix
                    type="matrix"
                    values="0 0 0 1 0
                            0 0 0 1 0
                            0 0 0 1 0
                            0 0 0 1 0"
                  />
                  <feComponentTransfer>
                    <feFuncR type="table" tableValues="0.16 0.47 0.78 0.94 0.98" />
                    <feFuncG type="table" tableValues="0.08 0.10 0.15 0.51 0.84" />
                    <feFuncB type="table" tableValues="0.09 0.11 0.15 0.13 0.27" />
                    <feFuncA type="table" tableValues="0 0.35 0.65 0.85 0.95" />
                  </feComponentTransfer>
                </filter>
              </defs>

              {/* Base map, dimmed for shape recognition */}
              <polygon points={toPoints(SITE_BOUNDARY)} fill="#101116" stroke="rgba(220,38,38,0.35)" strokeWidth={2} strokeLinejoin="round" />
              <polygon points={toPoints(CAR_PARK_POLY)} fill="#141519" stroke="rgba(160,160,170,0.12)" strokeWidth={1} />
              <polygon points={toPoints(EAST_PARK_POLY)} fill="#141519" stroke="rgba(160,160,170,0.12)" strokeWidth={1} />
              <polygon points={toPoints(CLUSTER_POLY)} fill="#141519" stroke="rgba(160,160,170,0.12)" strokeWidth={1} />
              {/* Faint zone outlines keep the site readable under the heat */}
              {SITE_ZONES.map((z, i) => {
                const cx = z.x + z.w / 2;
                const cy = z.y + z.h / 2;
                return (
                  <rect
                    key={`hz-${i}`}
                    x={z.x}
                    y={z.y}
                    width={z.w}
                    height={z.h}
                    rx={2}
                    fill="rgba(255,255,255,0.015)"
                    stroke="rgba(220,38,38,0.18)"
                    strokeWidth={0.8}
                    transform={z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined}
                  />
                );
              })}

              {/* Thermal layer — blurred energy blobs run through the colormap.
                  Screen blending means heat only ever lightens the map (a true
                  glow), never casts a dark halo over it. */}
              <g filter="url(#heat-thermal)" style={{ mixBlendMode: 'screen' }}>
                {hotspots.map((s, i) => (
                  <ellipse
                    key={`spot-${i}`}
                    cx={s.cx}
                    cy={s.cy}
                    rx={s.rx}
                    ry={s.ry}
                    fill="url(#heat-blob)"
                    opacity={0.45 + 0.55 * (max > 0 ? s.count / max : 0)}
                    transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined}
                  />
                ))}
              </g>

              {/* Invisible hover targets with exact counts */}
              {SITE_ZONES.filter((z) => !z.noBadge && (counts[z.label] ?? 0) > 0).map((z, i) => {
                const cx = z.x + z.w / 2;
                const cy = z.y + z.h / 2;
                const count = counts[z.label] ?? 0;
                return (
                  <rect
                    key={`hit-${i}`}
                    x={z.x}
                    y={z.y}
                    width={z.w}
                    height={z.h}
                    fill="transparent"
                    transform={z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined}
                  >
                    <title>{`${z.label}: ${count} active task${count === 1 ? '' : 's'}`}</title>
                  </rect>
                );
              })}
              {SITE_CELLS.filter((c) => c.inside && !c.landmark && (counts[c.areaKey] ?? 0) > 0).map((cell) => (
                <rect key={`hitc-${cell.ref}`} x={cell.x} y={cell.y} width={CELL_W} height={CELL_H} fill="transparent">
                  <title>{`${cell.areaKey}: ${counts[cell.areaKey]} active`}</title>
                </rect>
              ))}
            </svg>
            <span className="pointer-events-none absolute bottom-1.5 right-2 text-[9px] uppercase tracking-widest text-neutral-500 group-hover:text-invictus-crimson-bright">
              Open site map &rarr;
            </span>
          </button>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">Fewer</span>
            <span
              className="h-2 flex-1 rounded-full"
              style={{ background: `linear-gradient(to right, ${heatColor(0.18)}, ${heatColor(0.5)}, ${heatColor(0.82)}, ${heatColor(1)})` }}
            />
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">More tasks</span>
          </div>

          {/* Busiest areas (names live here, not on the map) */}
          {hottest.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {hottest.map(([area, count]) => (
                <span
                  key={area}
                  className="inline-flex items-center gap-1.5 rounded-full border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-2 py-0.5 text-[10px] text-neutral-200"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: heatFor(count) }} />
                  {area}
                  <span className="font-mono font-semibold text-neutral-100">{count}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function SiteMapPage({
  tasks,
  team,
  currentUid,
  onAddTask,
}: {
  tasks: Task[];
  team: TeamMember[];
  currentUid: string;
  onAddTask: (task: Task) => void;
}) {
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [hoverRef, setHoverRef] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeUid, setAssigneeUid] = useState('');
  const { playConfirm } = useSound();
  const teammates = team.filter((m) => m.uid !== currentUid);

  const selectedCell = SITE_CELLS.find((c) => c.ref === selectedRef) ?? null;

  const activeCountByArea = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.area && t.status !== 'Completed') counts[t.area] = (counts[t.area] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  const tasksForArea = useMemo(
    () => (selectedCell ? tasks.filter((t) => t.area === selectedCell.areaKey) : []),
    [tasks, selectedCell]
  );

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell || !name.trim()) return;
    const assignee = teammates.find((m) => m.uid === assigneeUid);
    onAddTask({
      id: genId(),
      name: name.trim(),
      priority,
      dueDate,
      status: 'Not Started',
      area: selectedCell.areaKey,
      ...(assignee ? { pendingUid: assignee.uid, pendingName: assignee.name } : {}),
    });
    playConfirm();
    setName('');
    setPriority('Medium');
    setDueDate('');
    setAssigneeUid('');
  };

  const cellFill = (cell: GridCell): string => {
    if (cell.ref === selectedRef) return 'rgba(220,38,38,0.42)';
    if (cell.ref === hoverRef) return 'rgba(220,38,38,0.22)';
    return 'rgba(220,38,38,0.03)';
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
          <div className="relative w-full overflow-hidden rounded-md border border-neutral-400/20 bg-[#0b0b0c]">
            <svg viewBox="0 0 1000 900" className="h-auto w-full" role="img" aria-label="Dreamland site map grid">
              {/* Site boundary */}
              <polygon points={toPoints(SITE_BOUNDARY)} fill={MAP_C.boundaryFill} stroke={MAP_C.crimson} strokeWidth={2} strokeLinejoin="round" />

              {/* Passive context areas */}
              <polygon points={toPoints(CAR_PARK_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />
              <polygon points={toPoints(EAST_PARK_POLY)} fill={MAP_C.green} stroke={MAP_C.greenStroke} strokeWidth={1} />
              <polygon points={toPoints(CLUSTER_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />

              {/* Working zones */}
              {SITE_ZONES.map((z, i) => {
                const cx = z.x + z.w / 2;
                const cy = z.y + z.h / 2;
                const tone = ZONE_TONE[z.tone ?? 'area'];
                const transform = z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined;
                return (
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
              <line x1={19} y1={132} x2={644} y2={114} stroke="rgba(180,180,190,0.35)" strokeWidth={3} />
              <line x1={644} y1={127} x2={965} y2={520} stroke="rgba(180,180,190,0.35)" strokeWidth={3} />

              {/* Context labels */}
              <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }}>
                <text x={330} y={104} fontSize={12} letterSpacing={2} fill={MAP_C.labelDim}>Hall by the Sea Road</text>
                <text x={812} y={300} fontSize={12} letterSpacing={2} fill={MAP_C.labelDim} transform="rotate(58 812 300)">Belgrave Road</text>
                <text x={70} y={500} fontSize={11} fill={MAP_C.labelDim}>Arlington Car Park</text>
                <text x={600} y={300} fontSize={11} fontWeight={600} fill={MAP_C.labelDim}>Dreamland Car Park</text>
                <text x={70} y={120} fontSize={8} fill={MAP_C.crimson}>Undercover Entrance</text>
              </g>

              {/* Zone labels */}
              <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }}>
                {SITE_ZONES.map((z, i) => {
                  const cx = z.x + z.w / 2;
                  const cy = z.y + z.h / 2;
                  const tone = ZONE_TONE[z.tone ?? 'area'];
                  const lr = z.labelRot ?? z.rot ?? 0;
                  const fs = z.w < 78 || z.h < 32 ? 7.5 : 9;
                  return (
                    <text
                      key={`zlbl-${i}`}
                      x={cx}
                      y={cy + 3}
                      fontSize={fs}
                      fontWeight={600}
                      letterSpacing={0.5}
                      fill={tone.text}
                      transform={lr ? `rotate(${lr} ${cx} ${cy})` : undefined}
                    >
                      {z.label}
                    </text>
                  );
                })}
              </g>

              {/* Undercover entrance marker */}
              <circle cx={64} cy={128} r={4} fill={MAP_C.crimson} />

              {/* Grid lines */}
              <g stroke={MAP_C.line} strokeWidth={1}>
                {Array.from({ length: GRID_COLS - 1 }, (_, i) => (
                  <line key={`v${i}`} x1={(i + 1) * CELL_W} y1={0} x2={(i + 1) * CELL_W} y2={900} />
                ))}
                {Array.from({ length: GRID_ROWS - 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={(i + 1) * CELL_H} x2={1000} y2={(i + 1) * CELL_H} />
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
                  stroke={cell.ref === selectedRef ? MAP_C.crimson : MAP_C.lineStrong}
                  strokeWidth={cell.ref === selectedRef ? 2 : 0.75}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverRef(cell.ref)}
                  onMouseLeave={() => setHoverRef((r) => (r === cell.ref ? null : r))}
                  onClick={() => setSelectedRef(cell.ref)}
                />
              ))}

              {/* Task-count badges on named zones */}
              {SITE_ZONES.filter((z) => !z.noBadge && (activeCountByArea[z.label] ?? 0) > 0).map((z, i) => (
                <g key={`badge-${i}`} pointerEvents="none">
                  <circle cx={z.x + z.w / 2} cy={z.y + z.h / 2 - 14} r={9} fill={MAP_C.crimson} stroke="#fff" strokeWidth={0.8} />
                  <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 10.5} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">
                    {activeCountByArea[z.label]}
                  </text>
                </g>
              ))}
              {/* Badges on grid-reference cells that carry tasks */}
              {SITE_CELLS.filter((c) => c.inside && !c.landmark && (activeCountByArea[c.areaKey] ?? 0) > 0).map((cell) => (
                <g key={`gbadge-${cell.ref}`} pointerEvents="none">
                  <circle cx={cell.cx} cy={cell.cy} r={9} fill={MAP_C.crimson} stroke="#fff" strokeWidth={0.8} />
                  <text x={cell.cx} y={cell.cy + 3.5} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">
                    {activeCountByArea[cell.areaKey]}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[2px] border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/20" />
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Working Area</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[2px] border border-invictus-crimson-bright/50 bg-[#78141880]" />
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Building</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[2px] border border-neutral-400/25 bg-neutral-700/40" />
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Car Park</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-invictus-crimson-bright text-[8px] font-bold text-white">1</span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Tasks assigned</span>
            </div>
          </div>
        </Panel>

        <Panel title={selectedCell ? (selectedCell.landmark ?? `Grid ${selectedCell.ref}`) : 'Grid Square'} icon={MapPin} refCode="0107-M">
          {!selectedCell ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 text-center">
              <MapPin className="h-8 w-8 text-neutral-700" />
              <p className="text-xs text-neutral-500">
                Click a grid square on the map to view its tasks and assign new ones.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-neutral-400/40 bg-neutral-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                    Square {selectedCell.ref}
                  </span>
                  {selectedCell.landmark && (
                    <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-100">
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

              <div>
                <Kicker>Tasks here ({tasksForArea.length})</Kicker>
                <div className="mt-2 space-y-1.5">
                  {tasksForArea.length === 0 && (
                    <p className="py-2 text-xs text-neutral-600">No tasks assigned to this location yet.</p>
                  )}
                  {tasksForArea.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{t.name}</span>
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_STYLES[t.status]}`}>
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

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
                <InvictusSelect
                  value={assigneeUid}
                  onChange={setAssigneeUid}
                  title="Assign this task to a teammate — they'll get it as an offer to accept"
                  className="bg-invictus-base/60"
                  options={[
                    { value: '', label: 'Keep to myself' },
                    ...teammates.map((m) => ({ value: m.uid, label: `Assign to ${m.name}` })),
                  ]}
                />
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
    updates: { name: string; notes: string; priority: Priority; dueDate: string; pendingUid: string | null; pendingName: string | null }
  ) => void;
  onSetImages: (id: string, images: TaskImage[]) => void;
  onFileReport: (task: Task) => void;
}) {
  const completedCount = tasks.filter((t) => t.status === 'Completed').length;
  const todayStr = toDateInputValue(new Date());
  const isOverdueOrToday = (t: Task) =>
    t.status !== 'Completed' && Boolean(t.dueDate) && daysFromToday(t.dueDate, todayStr) <= 0;
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
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
  }, [tasks, todayStr]);
  // Split the sorted list into status groups (Not Started → In Progress → Completed)
  // so the queue is easier to manage at a glance. Within each group the existing
  // urgency/priority/due-date sort is preserved.
  const groupedTasks = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        items: sortedTasks.filter((t) => t.status === status),
      })).filter((group) => group.items.length > 0),
    [sortedTasks]
  );
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Not Started');
  const [assigneeUid, setAssigneeUid] = useState('');
  const { playConfirm } = useSound();
  const { haptic } = usePreferences();
  const teammates = team.filter((m) => m.uid !== currentUid);

  // Inline editing of an existing task.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('Medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAssigneeUid, setEditAssigneeUid] = useState('');

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditName(task.name);
    setEditNotes(task.notes ?? '');
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate);
    setEditAssigneeUid(task.pendingUid ?? '');
  };
  const saveEdit = (task: Task) => {
    if (!editName.trim()) return;
    const assignee = teammates.find((m) => m.uid === editAssigneeUid);
    onEdit(task.id, {
      name: editName.trim(),
      notes: editNotes.trim(),
      priority: editPriority,
      dueDate: editDueDate,
      pendingUid: assignee?.uid ?? null,
      pendingName: assignee?.name ?? null,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const assignee = teammates.find((m) => m.uid === assigneeUid);
    onAdd({
      id: genId(),
      name: name.trim(),
      priority,
      dueDate,
      status,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(assignee ? { pendingUid: assignee.uid, pendingName: assignee.name } : {}),
    });
    playConfirm();
    setName('');
    setNotes('');
    setPriority('Medium');
    setDueDate('');
    setStatus('Not Started');
    setAssigneeUid('');
  };

  return (
    <div className="space-y-5">
      {offers.length > 0 && (
        <Panel title={`Task Offers (${offers.length})`} icon={Inbox} refCode="0105-O">
          <p className="mb-3 text-xs text-neutral-500">
            Tasks a teammate has assigned to you. Accept to share the task — it appears on both
            your boards, and either of you completing it completes it for both.
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

      <Panel title="Deploy New Task" icon={Plus} refCode="0103-T">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-2"
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
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <InvictusSelect
            value={status}
            onChange={(v) => setStatus(v as TaskStatus)}
            className="bg-invictus-base/60"
            options={[
              { value: 'Not Started', label: 'Not Started' },
              { value: 'In Progress', label: 'In Progress' },
              { value: 'Completed', label: 'Completed' },
            ]}
          />
          <InvictusSelect
            value={assigneeUid}
            onChange={setAssigneeUid}
            title="Assign this task to a teammate — they'll get it as an offer to accept"
            className="bg-invictus-base/60"
            options={[
              { value: '', label: 'Keep to myself' },
              ...teammates.map((m) => ({ value: m.uid, label: `Assign to ${m.name}` })),
            ]}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full min-w-0 resize-y rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-6"
          />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong sm:col-span-2 lg:col-span-6"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </form>
      </Panel>

      <Panel title={`Active Tasks (${tasks.length})`} icon={ListChecks} refCode="0104-T">
        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagesChosen} />
        {imageError && <p className="mb-2 text-xs text-alert">{imageError}</p>}
        <div className="space-y-2">
          {completedCount > 0 && (
            <button
              onClick={onArchiveAllCompleted}
              className="mb-1 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
            >
              <Archive className="h-3.5 w-3.5" /> Archive {completedCount} Completed
            </button>
          )}
          {tasks.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No tasks in queue.</p>
          )}
          {groupedTasks.map((group) => (
            <div key={group.status} className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${STATUS_STYLES[group.status]}`}>
                  {group.status}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                  {group.items.length}
                </span>
                <span className="h-px flex-1 bg-neutral-400/10" />
              </div>
              {group.items.map((task) => {
                const isPinned = isOverdueOrToday(task);
                return (
            <div
              key={task.id}
              className={`relative flex flex-col gap-3 rounded-md border p-3 shadow-glow-subtle ${
                isPinned ? 'border-alert/50 bg-alert/5 shadow-glow-alert' : 'border-neutral-400/20 bg-invictus-base/40'
              }`}
            >
              <MicroCorners />
              {editingId === task.id ? (
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
                  <InvictusSelect
                    value={editAssigneeUid}
                    onChange={setEditAssigneeUid}
                    title="Assign this task to a teammate — they'll get it as an offer to accept"
                    className="bg-invictus-base/60"
                    options={[
                      { value: '', label: 'No assignment' },
                      ...teammates.map((m) => ({ value: m.uid, label: `Assign to ${m.name}` })),
                    ]}
                  />
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
              ) : (
              <>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-snug text-neutral-100 md:text-lg">{task.name}</p>
                <Kicker>Due {task.dueDate || '—'}</Kicker>
                {task.notes && <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{task.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isPinned && (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${URGENCY_STYLES.red}`}>
                    {formatDueIn(daysFromToday(task.dueDate, todayStr))}
                  </span>
                )}
                {task.category && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_TAG_STYLE}`}>
                    {task.category}
                  </span>
                )}
                {task.area && (
                  <span className="flex items-center gap-1 rounded-full border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                    <MapPin className="h-3 w-3" /> {task.area}
                  </span>
                )}
                {task.pendingUid && (
                  <span
                    className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
                    title="Waiting for them to accept this task"
                  >
                    <UserPlus className="h-3 w-3" /> Awaiting {task.pendingName || 'accept'}
                  </span>
                )}
                {!task.pendingUid && (task.participants?.length ?? 0) > 1 && (
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
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>
                <InvictusSelect
                  value={task.status}
                  onChange={(v) => {
                    if (v === 'Completed' && task.status !== 'Completed') haptic();
                    onUpdateStatus(task.id, v as TaskStatus);
                  }}
                  compact
                  className={`w-auto ${STATUS_STYLES[task.status]}`}
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
                  onClick={() => startEdit(task)}
                  className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
                  title="Edit task"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onFileReport(task)}
                  className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-invictus-crimson-bright shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
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
                  className="rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
                  title="Delete task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              </div>
              {(task.images?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
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
              </>
              )}
            </div>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>

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
  const crimson: [number, number, number] = [194, 48, 74];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...crimson);
  doc.text('I.N.V.I.C.T.U.S. — Completion Reports', 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')} · ${entries.length} entries`, 40, 60);

  autoTable(doc, {
    startY: 76,
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
    margin: { left: 40, right: 40 },
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

export default function InvictusTrackerPage() {
  const { user } = useAuth();
  const { profile, team: myTeam } = useProfile();
  const teamId = profile?.teamId ?? null;
  const isDreamland = teamId === DREAMLAND_TEAM_ID;
  const amCommander = isCommander(profile);
  const [teamChecklistForms, setTeamChecklistForms] = useState<{ section: string; name: string; description?: string; url: string }[]>([]);
  const [mounted, setMounted] = useState(false);
  const [booting, setBooting] = useState(true);
  // Open on the page named in ?page= (used by notification deep-links), else
  // the dashboard. Validated against the known page keys.
  const [activePage, setActivePage] = useState<PageKey>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const wanted = new URLSearchParams(window.location.search).get('page');
    const keys: PageKey[] = ['dashboard', 'calendar', 'shows', 'sitemap', 'tasks', 'archive', 'compliance', 'reports', 'admin'];
    return wanted && (keys as string[]).includes(wanted) ? (wanted as PageKey) : 'dashboard';
  });
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
  // brief spinning-logo splash, then load the app in after 1 second.
  useEffect(() => {
    setMounted(true);
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
    // Commanders oversee the whole team's tasks; everyone else sees only tasks
    // they participate in. (A commander's own tasks carry the same teamId, so
    // the team query is a superset of the participant query for them.)
    const mineQ =
      amCommander && teamId
        ? query(collection(db, 'tasks'), where('teamId', '==', teamId))
        : query(collection(db, 'tasks'), where('participants', 'array-contains', user.uid));
    const unsubMine = onSnapshot(
      mineQ,
      (snap) => {
        const all = snap.docs.map((d) => ({ ...(d.data() as Omit<Task, 'id'>), id: d.id } as Task));
        setTasks(all.filter((t) => !t.archived));
        setArchivedTasks(all.filter((t) => t.archived));
      },
      (error) => console.error('Tasks subscription failed:', error)
    );
    const offersQ = query(collection(db, 'tasks'), where('pendingUid', '==', user.uid));
    const unsubOffers = onSnapshot(
      offersQ,
      (snap) => setTaskOffers(snap.docs.map((d) => ({ ...(d.data() as Omit<Task, 'id'>), id: d.id } as Task))),
      (error) => console.error('Task offers subscription failed:', error)
    );
    return () => {
      unsubMine();
      unsubOffers();
    };
  }, [user, amCommander, teamId]);

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
      pendingUid: task.pendingUid ?? null,
      pendingName: task.pendingName ?? null,
      archived: false,
    })
      .then(() => {
        if (task.pendingUid) notifyAssignment(task.pendingUid, task.name, id);
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
  // teammate after creation (sets a fresh pending offer; null clears one).
  const handleEditTask = (
    id: string,
    updates: { name: string; notes: string; priority: Priority; dueDate: string; pendingUid: string | null; pendingName: string | null }
  ) => {
    if (!user) return;
    const prev = tasks.find((t) => t.id === id);
    updateDoc(doc(db, 'tasks', id), updates)
      .then(() => {
        // Only notify when this edit sets a NEW offer (not on unrelated edits).
        if (updates.pendingUid && updates.pendingUid !== prev?.pendingUid) {
          notifyAssignment(updates.pendingUid, updates.name, id);
        }
      })
      .catch(logTaskError('edit task'));
  };
  const handleSetTaskImages = (id: string, images: TaskImage[]) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { images }).catch(logTaskError('update task images'));
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
  // to both, one completion completes it for everyone). Declining just clears
  // the offer and it stays the owner's private task.
  const handleAcceptOffer = (id: string) => {
    if (!user) return;
    const myName = user.displayName || user.email || 'Unknown';
    updateDoc(doc(db, 'tasks', id), {
      participants: arrayUnion(user.uid),
      [`participantNames.${user.uid}`]: myName,
      pendingUid: null,
      pendingName: null,
    }).catch(logTaskError('accept task offer'));
  };
  const handleDeclineOffer = (id: string) => {
    if (!user) return;
    updateDoc(doc(db, 'tasks', id), { pendingUid: null, pendingName: null }).catch(logTaskError('decline task offer'));
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
        <div className="relative flex h-full">
          <Sidebar activePage={activePage} onNavigate={setActivePage} user={user} syncStatus={syncStatus} syncError={syncError} isAdmin={isAdmin} features={myTeam?.features} isMaster={isMaster} />
          <main className="flex-1 overflow-y-auto p-5">
            {activePage === 'dashboard' && (
              <Dashboard
                tasks={tasks}
                archivedTasks={archivedTasks}
                compliances={compliances}
                events={events}
                onToggleMeeting={handleToggleMeeting}
                onOpenSiteMap={() => setActivePage('sitemap')}
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
              <SiteMapPage tasks={tasks} team={team} currentUid={user?.uid ?? ''} onAddTask={handleAddTask} />
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

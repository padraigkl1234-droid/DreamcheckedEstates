'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, type User } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useSound, getSharedAudioContext } from '@/components/SoundProvider';
import { BRAND_NAME, BRAND_NAME_DOTTED } from '@/lib/brand';
import { Trident } from '@/components/icons/Trident';
import {
  type ComplianceItem,
  type ComplianceUrgency,
  getOutstandingCompliances,
} from '@/lib/complianceCountdown';
import {
  Power,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Plus,
  Trash2,
  Cpu,
  Activity,
  Wifi,
  Radio,
  Newspaper,
  CheckCircle2,
  Circle,
  AlertTriangle,
  X,
  Gauge,
  Satellite,
  Server,
  Briefcase,
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
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';
type PageKey = 'dashboard' | 'calendar' | 'tasks' | 'archive' | 'compliance';

interface Task {
  id: string;
  name: string;
  priority: Priority;
  dueDate: string;
  status: TaskStatus;
  archivedAt?: number;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  priority: Priority;
  notes: string;
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

const SEED_TASKS: Task[] = [
  { id: 't1', name: 'Inspect rooftop HVAC unit 4', priority: 'High', dueDate: '2026-06-20', status: 'In Progress' },
  { id: 't2', name: 'Replace lobby lighting fixtures', priority: 'Medium', dueDate: '2026-06-22', status: 'Not Started' },
  { id: 't3', name: 'Service car park barrier system', priority: 'Low', dueDate: '2026-06-25', status: 'Completed' },
  { id: 't4', name: 'Audit fire extinguisher inventory', priority: 'High', dueDate: '2026-06-19', status: 'Completed' },
];

const SEED_EVENTS: CalendarEvent[] = [
  { id: 'e1', title: 'Ansul Meeting', date: '2026-06-20', priority: 'High', notes: 'It is with Paul A.' },
];

const SEED_COMPLIANCES: ComplianceItem[] = [
  { id: 'c1', name: 'AC System', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c2', name: 'Ansul fire suppression', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c3', name: 'Asbestos survey', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c4', name: 'Boiler Service', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c5', name: 'Carpentry Machinery Servicing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c6', name: 'CCTV Maintenance', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c7', name: 'Emergency Lighting Testing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c8', name: 'Fire Alarm & PAVA', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c9', name: 'Fire Door Inspections', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c10', name: 'Fire extinguishers', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c11', name: 'Fire Shutters', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c12', name: 'Fixed wiring inspection', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c13', name: 'Generator Servicing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c14', name: 'Kitchen Extract Cleaning', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c15', name: 'Legionella Risk Assessment', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c16', name: 'Lighting Protection', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c17', name: 'LOLER inspections (Cinema roof platform & lifting equipment)', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c18', name: 'Passenger lift & barrel lift Cinque Ports service & LOLER', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c19', name: 'PAT Testing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c20', name: 'People Counter', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c21', name: 'Pest Control', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c22', name: 'Scaffold Inspections', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c23', name: 'Water Hygiene Testing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c24', name: 'Workshop machine LEV', completed: false, date: '', nextDueDate: '', comments: '' },
];

const BOOT_STEPS = [
  'INITIALIZING CORE...',
  'ESTATES ONLINE...',
  'COMPLIANCE SYNCED...',
  'NEWS & WEATHER UPLINK ESTABLISHED...',
  'ALL SYSTEMS NOMINAL.',
];

// Once-per-browser-session gate: cleared on a new tab/session, untouched by in-app navigation.
const SESSION_BOOTED_KEY = 'invictus:sessionBooted';

// Per-card stagger timing for the dashboard's post-boot reveal animation.
const CARD_REVEAL_STEP_MS = 90;
const CARD_REVEAL_DURATION_MS = 420;

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'tasks', label: 'Task Manager', icon: ListChecks },
  { key: 'archive', label: 'Archive', icon: Archive },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'text-alert border-alert/40 bg-alert/10 shadow-glow-subtle',
  Medium: 'text-amber-300 border-amber-400/30 bg-amber-400/10 shadow-glow-subtle',
  Low: 'text-neutral-300 border-neutral-400/30 bg-neutral-400/10 shadow-glow-subtle',
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  'Not Started': 'text-neutral-400 border-neutral-500/40 bg-neutral-500/10',
  'In Progress': 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  Completed: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
// Boot sequence power-up hum — a one-off effect tied to the ignite button
// itself (the click is the unlock gesture), reusing the shared AudioContext
// from SoundProvider so the app only ever has one audio graph.
// ---------------------------------------------------------------------------

function playPowerUpHum() {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const duration = 1.6;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(5000, now + duration);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.22, now + duration * 0.55);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const fundamental = ctx.createOscillator();
  fundamental.type = 'sawtooth';
  fundamental.frequency.setValueAtTime(70, now);
  fundamental.frequency.exponentialRampToValueAtTime(660, now + duration);

  const overtone = ctx.createOscillator();
  overtone.type = 'sine';
  overtone.frequency.setValueAtTime(140, now);
  overtone.frequency.exponentialRampToValueAtTime(990, now + duration);

  fundamental.connect(filter);
  overtone.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  fundamental.start(now);
  overtone.start(now);
  fundamental.stop(now + duration);
  overtone.stop(now + duration);
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
// Boot dial — slim glowing ring, rotating clockwise
// ---------------------------------------------------------------------------

function BootDial({ onIgnite }: { onIgnite: () => void }) {
  return (
    <div className="relative h-[240px] w-[240px] shrink-0 sm:h-[300px] sm:w-[300px] lg:h-[360px] lg:w-[360px]">
      <svg viewBox="0 0 200 200" className="absolute h-full w-full">
        <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      </svg>
      <svg viewBox="0 0 200 200" className="absolute h-full w-full animate-[spin_5s_linear_infinite]">
        <circle
          cx="100"
          cy="100"
          r="94"
          fill="none"
          stroke="rgba(194,48,74,0.9)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="110 480"
          style={{ filter: 'drop-shadow(0 0 10px rgba(194,48,74,0.9))' }}
        />
      </svg>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onIgnite();
        }}
        className="group absolute inset-[32%] flex items-center justify-center rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/5 shadow-glow-subtle transition-all duration-300 hover:scale-105 hover:shadow-glow-strong"
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
  { label: `${BRAND_NAME} Core`, icon: Trident, value: 100 },
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
// Boot sequence
// ---------------------------------------------------------------------------

function BootSequence({ onComplete }: { onComplete: (skipped: boolean) => void }) {
  const [stage, setStage] = useState<'idle' | 'booting'>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const { playHover } = useSound();
  const finishedRef = useRef(false);

  const finish = useCallback(
    (skipped: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onComplete(skipped);
    },
    [onComplete]
  );

  // Any keypress (Escape included) jumps straight to the final state.
  useEffect(() => {
    const handleKeyDown = () => finish(true);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finish]);

  useEffect(() => {
    if (stage !== 'booting') return;
    setStepIndex(0);
    const interval = setInterval(() => {
      setStepIndex((prev) => {
        if (prev + 1 >= BOOT_STEPS.length) {
          clearInterval(interval);
          setTimeout(() => finish(false), 700);
          return prev;
        }
        return prev + 1;
      });
    }, 480);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Soft blip per readout line as it streams in; respects mute via useSound.
  useEffect(() => {
    if (stage !== 'booting') return;
    playHover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, stepIndex]);

  const progress = ((stepIndex + 1) / BOOT_STEPS.length) * 100;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-invictus-base"
      onClick={() => finish(true)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_70%)]" />

      {stage === 'idle' && (
        <div className="flex w-full max-w-6xl items-center justify-center gap-6 px-6 lg:gap-10">
          <div className="hidden shrink-0 lg:block">
            <NetworkPanel />
          </div>
          <BootDial
            onIgnite={() => {
              playPowerUpHum();
              setStage('booting');
            }}
          />
          <div className="hidden shrink-0 lg:block">
            <EnvironmentPanel />
          </div>
        </div>
      )}

      {stage === 'booting' && (
        <div className="w-80 max-w-[90vw]">
          <div className="mb-6 flex items-center justify-center gap-3">
            <Satellite className="h-8 w-8 animate-pulse text-invictus-crimson-bright drop-shadow-[0_0_10px_rgba(194,48,74,0.8)]" />
          </div>
          <div className="space-y-1.5 text-xs">
            {BOOT_STEPS.map((step, i) => (
              <p
                key={step}
                className={`tracking-wider transition-opacity duration-300 ${
                  i <= stepIndex ? 'text-neutral-100 opacity-100' : 'text-neutral-700 opacity-30'
                }`}
              >
                {i < stepIndex ? '> ' : i === stepIndex ? '> ' : '  '}
                {step}
              </p>
            ))}
          </div>
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-invictus-crimson to-invictus-crimson-bright shadow-[0_0_10px_rgba(194,48,74,0.8)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <SysRef code="0000-BOOT" className="text-neutral-700/60" />
            <span className="font-mono text-[10px] tabular-nums tracking-widest text-neutral-500/70">
              {String(Math.round(progress)).padStart(3, '0')}%
            </span>
          </div>
        </div>
      )}
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
}: {
  activePage: PageKey;
  onNavigate: (p: PageKey) => void;
  user: User | null;
  syncStatus: 'idle' | 'loading' | 'synced' | 'error';
}) {
  const { playHover } = useSound();
  return (
    <aside className="flex w-16 flex-col border-r border-neutral-400/20 bg-invictus-base/70 shadow-glow-subtle backdrop-blur-xl md:w-60">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-neutral-400/20 px-2 md:justify-start md:px-5">
        <Trident className="h-7 w-7 text-invictus-crimson-bright drop-shadow-glow-subtle" />
        <div className="hidden md:block">
          <p className="font-display text-sm font-normal tracking-[0.15em] text-invictus-crimson-bright [text-shadow:var(--glow-text-subtle)]">{BRAND_NAME_DOTTED}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-2 md:p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              onMouseEnter={playHover}
              className={`flex items-center justify-center gap-3 rounded-md border px-3 py-2.5 text-xs uppercase tracking-wider transition-all md:justify-start ${
                active
                  ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100 shadow-glow-strong'
                  : 'border-transparent text-neutral-500 hover:border-invictus-crimson-bright/20 hover:bg-invictus-crimson-bright/5 hover:text-invictus-crimson-bright'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-400/20 p-3">
        <div className="flex items-center justify-center gap-2 md:justify-start">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="hidden text-[10px] uppercase tracking-widest text-emerald-400 md:inline">
            Online
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
              ? 'Sign in to save'
              : syncStatus === 'error'
              ? 'Sync error'
              : syncStatus === 'loading'
              ? 'Syncing...'
              : 'Progress saved'}
          </span>
        </div>
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
        <Trident className="h-4 w-4 text-invictus-crimson-bright" />
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
  compliances,
  animateCardsIn = false,
  onCardsRevealed,
}: {
  tasks: Task[];
  compliances: ComplianceItem[];
  animateCardsIn?: boolean;
  onCardsRevealed?: () => void;
}) {
  const [now, setNow] = useState(new Date());
  const [load, setLoad] = useState({ cpu: 38, mem: 52, net: 24 });
  const [news, setNews] = useState<{ general: NewsItem[]; business: NewsItem[]; football: NewsItem[] }>({
    general: [],
    business: [],
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
        setNews({ general: data.general ?? [], business: data.business ?? [], football: data.football ?? [] });
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

  useEffect(() => {
    const clockId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockId);
  }, []);

  useEffect(() => {
    const loadId = setInterval(() => {
      setLoad((prev) => ({
        cpu: clamp(prev.cpu + Math.round((Math.random() - 0.5) * 16), 12, 96),
        mem: clamp(prev.mem + Math.round((Math.random() - 0.5) * 10), 20, 90),
        net: clamp(prev.net + Math.round((Math.random() - 0.5) * 20), 5, 99),
      }));
    }, 2200);
    return () => clearInterval(loadId);
  }, []);

  // Tell the parent once the staggered reveal has finished so re-mounting
  // this component later in the same session (switching tabs and back) won't replay it.
  useEffect(() => {
    if (!animateCardsIn) return;
    const cardCount = 9; // greeting + 8 panels
    const totalMs = (cardCount - 1) * CARD_REVEAL_STEP_MS + CARD_REVEAL_DURATION_MS;
    const timeout = setTimeout(() => onCardsRevealed?.(), totalMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateCardsIn]);

  const totalItems = tasks.length + compliances.length;
  const completedItems = tasks.filter((t) => t.status === 'Completed').length + compliances.filter((c) => c.completed).length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const recentTasks = [...tasks].slice(-4).reverse();

  const upcomingCompliances = getOutstandingCompliances(compliances).slice(0, 4);

  return (
    <div className="space-y-6">
      <Reveal index={0} animate={animateCardsIn}>
        <InvictusGreeting compliances={compliances} />
      </Reveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal index={1} animate={animateCardsIn}>
        <Panel title="Estates & Maintenance Overall" icon={Gauge} refCode="0012-A" tier="primary">
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

        <Reveal index={2} animate={animateCardsIn}>
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

        <Reveal index={3} animate={animateCardsIn}>
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

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Reveal index={4} animate={animateCardsIn}>
        <Panel title="System Diagnostics" icon={Activity} refCode="0048-A" tier="ambient">
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="font-mono text-2xl font-bold tabular-nums tracking-widest text-neutral-200 [text-shadow:var(--glow-text-subtle)]">
                {now.toLocaleTimeString('en-GB')}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-600">
                {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <RadialGauge icon={Cpu} label="CPU" value={load.cpu} />
              <RadialGauge icon={Server} label="Server" value={load.mem} />
              <RadialGauge icon={Wifi} label="Network" value={load.net} />
            </div>

            <div className="flex items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <span className="text-xs uppercase tracking-widest text-emerald-300">System Status: Nominal</span>
            </div>
          </div>
        </Panel>
        </Reveal>

        <Reveal index={5} animate={animateCardsIn}>
          <WeatherPanel weather={weather} status={weatherStatus} tier="ambient" />
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal index={6} animate={animateCardsIn}>
          <NewsPanel
            title="BBC News Feed"
            icon={Newspaper}
            refCode="0091-N"
            items={news.general}
            status={newsStatus}
            tier="ambient"
          />
        </Reveal>
        <Reveal index={7} animate={animateCardsIn}>
          <NewsPanel
            title="Business & Economics"
            icon={Briefcase}
            refCode="0092-B"
            items={news.business}
            status={newsStatus}
            tier="ambient"
          />
        </Reveal>
        <Reveal index={8} animate={animateCardsIn}>
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

  return (
    <Panel title="Margate Weather" icon={WeatherIcon} refCode="0061-W" tier={tier}>
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

function RadialGauge({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: number }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value > 80 ? '#FF3B4E' : value > 55 ? '#fbbf24' : '#C2304A';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <MicroCorners />
        <svg viewBox="0 0 60 60" className="absolute h-full w-full -rotate-90">
          <circle cx="30" cy="30" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="30"
            cy="30"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease', filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        <span className="font-mono text-[11px] font-bold tabular-nums text-neutral-200">{value}%</span>
      </div>
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-neutral-500">
        <Icon className="h-3 w-3" /> {label}
      </span>
    </div>
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
        {refCode && <SysRef code={refCode} className="hidden sm:inline-flex" />}
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
  const [priority, setPriority] = useState<Priority>('Medium');
  const [notes, setNotes] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const { playConfirm } = useSound();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    onAdd({ id: genId(), title: title.trim(), date, priority, notes: notes.trim() });
    playConfirm();
    setTitle('');
    setPriority('Medium');
    setNotes('');
  };

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
      (acc[ev.date] ??= []).push(ev);
      return acc;
    }, {});
  }, [events]);

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
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes, e.g. it is with Paul A"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
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

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-1 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              {label}
            </div>
          ))}
          {cells.map((cellDate, i) => {
            if (!cellDate) {
              return <div key={`blank-${i}`} className="min-h-[5.5rem] rounded-md border border-transparent" />;
            }
            const dayEvents = eventsByDate[cellDate] ?? [];
            const isToday = cellDate === todayStr;
            const dayNum = Number(cellDate.slice(-2));
            return (
              <div
                key={cellDate}
                className={`relative flex min-h-[5.5rem] flex-col gap-1 rounded-md border p-1.5 ${
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
                      onClick={() => setSelectedEvent(ev)}
                      title={ev.notes ? `${ev.title} — ${ev.notes}` : ev.title}
                      className={`group flex cursor-pointer items-center justify-between gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors hover:brightness-125 ${PRIORITY_STYLES[ev.priority]}`}
                    >
                      <span className="truncate">{ev.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(ev.id);
                        }}
                        className="shrink-0 opacity-60 hover:opacity-100"
                        title="Delete entry"
                      >
                        <X className="h-3 w-3" />
                      </button>
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
            <h3 className="mt-1 pr-6 text-base font-semibold text-neutral-100">{selectedEvent.title}</h3>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-neutral-300">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{formatDisplayDate(selectedEvent.date)}</span>
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[selectedEvent.priority]}`}
              >
                {selectedEvent.priority} Priority
              </span>
              <p className="rounded-md border border-neutral-400/20 bg-invictus-base/60 p-2 text-xs text-neutral-200">
                {selectedEvent.notes || 'No notes added.'}
              </p>
            </div>
            <button
              onClick={() => {
                onDelete(selectedEvent.id);
                setSelectedEvent(null);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-alert/40 bg-alert/10 py-2 text-xs font-semibold uppercase tracking-widest text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Manager
// ---------------------------------------------------------------------------

function TaskManager({
  tasks,
  onAdd,
  onUpdateStatus,
  onDelete,
  onArchive,
  onArchiveAllCompleted,
}: {
  tasks: Task[];
  onAdd: (task: Task) => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onArchiveAllCompleted: () => void;
}) {
  const completedCount = tasks.filter((t) => t.status === 'Completed').length;
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Not Started');
  const { playConfirm } = useSound();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ id: genId(), name: name.trim(), priority, dueDate, status });
    playConfirm();
    setName('');
    setPriority('Medium');
    setDueDate('');
    setStatus('Not Started');
  };

  return (
    <div className="space-y-5">
      <Panel title="Deploy New Task" icon={Plus} refCode="0103-T">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-2"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          >
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong sm:col-span-2 lg:col-span-5"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </form>
      </Panel>

      <Panel title={`Active Tasks (${tasks.length})`} icon={ListChecks} refCode="0104-T">
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
          {tasks.map((task) => (
            <div
              key={task.id}
              className="relative flex flex-col gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:flex-row md:items-center md:justify-between"
            >
              <MicroCorners />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-100">{task.name}</p>
                <Kicker>Due {task.dueDate || '—'}</Kicker>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>
                <select
                  value={task.status}
                  onChange={(e) => onUpdateStatus(task.id, e.target.value as TaskStatus)}
                  className={`rounded-md border bg-black/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide focus:outline-none ${STATUS_STYLES[task.status]}`}
                >
                  <option>Not Started</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                </select>
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
          ))}
        </div>
      </Panel>
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
  onAddMissingStandard,
}: {
  compliances: ComplianceItem[];
  onAdd: (item: ComplianceItem) => void;
  onToggle: (id: string) => void;
  onChangeDate: (id: string, date: string) => void;
  onChangeNextDueDate: (id: string, date: string) => void;
  onChangeComments: (id: string, comments: string) => void;
  onDelete: (id: string) => void;
  onAddMissingStandard: () => void;
}) {
  const missingStandardCount = SEED_COMPLIANCES.filter(
    (seed) => !compliances.some((c) => c.name.trim().toLowerCase() === seed.name.trim().toLowerCase())
  ).length;
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [comments, setComments] = useState('');
  const { playConfirm } = useSound();

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
        {missingStandardCount > 0 && (
          <button
            onClick={onAddMissingStandard}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Add {missingStandardCount} Missing Standard Item{missingStandardCount === 1 ? '' : 's'}
          </button>
        )}
      </Panel>

      <Panel title="Estate Compliance Tracker" icon={ShieldCheck} refCode="0200-C">
        <div className="mb-2 hidden gap-3 px-3 text-[10px] uppercase tracking-widest text-neutral-600 md:grid md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.3fr_auto]">
          <span>Status</span>
          <span>Item</span>
          <span>Last Completed</span>
          <span>Next Due</span>
          <span>Comments</span>
          <span />
        </div>
        <div className="space-y-2">
          {compliances.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No compliance items logged.</p>
          )}
          {compliances.map((item) => (
            <div
              key={item.id}
              className="relative grid grid-cols-1 items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.3fr_auto]"
            >
              <MicroCorners />
              <button
                onClick={() => {
                  if (!item.completed) playConfirm();
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
// Root page
// ---------------------------------------------------------------------------

export default function InvictusTrackerPage() {
  const { user } = useAuth();
  const [bootPhase, setBootPhase] = useState<'pending' | 'boot' | 'done'>('pending');
  const [animateCardsIn, setAnimateCardsIn] = useState(false);
  const cardsRevealedRef = useRef(false);
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [compliances, setCompliances] = useState<ComplianceItem[]>(SEED_COMPLIANCES);
  const [events, setEvents] = useState<CalendarEvent[]>(SEED_EVENTS);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>('idle');
  const loadedForUid = useRef<string | null>(null);
  const readyToSave = useRef(false);

  // Decide once on mount whether the boot sequence should play: skip it for
  // an already-booted session (in-app navigation) or for reduced-motion users.
  useEffect(() => {
    const alreadyBooted = window.sessionStorage.getItem(SESSION_BOOTED_KEY) === 'true';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setBootPhase(alreadyBooted || reducedMotion ? 'done' : 'boot');
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
          if (Array.isArray(data.tasks)) setTasks(data.tasks as Task[]);
          if (Array.isArray(data.archivedTasks)) setArchivedTasks(data.archivedTasks as Task[]);
          if (Array.isArray(data.compliances)) setCompliances(data.compliances as ComplianceItem[]);
          if (Array.isArray(data.events)) setEvents(data.events as CalendarEvent[]);
        }
        setSyncStatus('synced');
      } catch (error) {
        console.error('Failed to load INVICTUS progress:', error);
        setSyncStatus('error');
      } finally {
        readyToSave.current = true;
      }
    })();
  }, [user]);

  // Persist tasks/compliances to Firestore whenever they change, while signed in.
  useEffect(() => {
    if (!user || !readyToSave.current) return;
    const timeout = setTimeout(() => {
      setDoc(doc(db, 'jarvisState', user.uid), {
        tasks,
        archivedTasks,
        compliances,
        events,
        updatedAt: Date.now(),
      })
        .then(() => setSyncStatus('synced'))
        .catch((error) => {
          console.error('Failed to save INVICTUS progress:', error);
          setSyncStatus('error');
        });
    }, 600);
    return () => clearTimeout(timeout);
  }, [tasks, archivedTasks, compliances, events, user]);

  const totalItems = tasks.length + compliances.length;
  const completedItems = tasks.filter((t) => t.status === 'Completed').length + compliances.filter((c) => c.completed).length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const handleAddTask = (task: Task) => setTasks((prev) => [...prev, task]);
  const handleUpdateStatus = (id: string, status: TaskStatus) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  const handleDeleteTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const handleArchiveTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setArchivedTasks((archived) => [...archived, { ...task, archivedAt: Date.now() }]);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };
  const handleArchiveAllCompleted = () => {
    const completed = tasks.filter((t) => t.status === 'Completed');
    if (completed.length === 0) return;
    const now = Date.now();
    setArchivedTasks((archived) => [...archived, ...completed.map((t) => ({ ...t, archivedAt: now }))]);
    setTasks((prev) => prev.filter((t) => t.status !== 'Completed'));
  };
  const handleRestoreTask = (id: string) => {
    const task = archivedTasks.find((t) => t.id === id);
    if (!task) return;
    const { archivedAt, ...rest } = task;
    setTasks((prev) => [...prev, rest]);
    setArchivedTasks((prev) => prev.filter((t) => t.id !== id));
  };
  const handleDeleteArchivedTask = (id: string) => setArchivedTasks((prev) => prev.filter((t) => t.id !== id));

  const handleAddCompliance = (item: ComplianceItem) => setCompliances((prev) => [...prev, item]);
  const handleToggleCompliance = (id: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c)));
  const handleChangeDate = (id: string, date: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, date } : c)));
  const handleChangeNextDueDate = (id: string, nextDueDate: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, nextDueDate } : c)));
  const handleChangeComments = (id: string, comments: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, comments } : c)));
  const handleDeleteCompliance = (id: string) => setCompliances((prev) => prev.filter((c) => c.id !== id));
  const handleAddMissingStandardCompliances = () => {
    setCompliances((prev) => {
      const missing = SEED_COMPLIANCES.filter(
        (seed) => !prev.some((c) => c.name.trim().toLowerCase() === seed.name.trim().toLowerCase())
      );
      return [...prev, ...missing.map((item) => ({ ...item, id: genId() }))];
    });
  };

  const handleAddEvent = (event: CalendarEvent) => setEvents((prev) => [...prev, event]);
  const handleDeleteEvent = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id));

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

      {bootPhase === 'boot' && (
        <BootSequence
          onComplete={(skipped) => {
            window.sessionStorage.setItem(SESSION_BOOTED_KEY, 'true');
            if (!skipped) setAnimateCardsIn(true);
            setBootPhase('done');
          }}
        />
      )}

      {bootPhase === 'done' && (
        <div className="relative flex h-full">
          <Sidebar activePage={activePage} onNavigate={setActivePage} user={user} syncStatus={syncStatus} />
          <main className="flex-1 overflow-y-auto p-5">
            {activePage === 'dashboard' && (
              <Dashboard
                tasks={tasks}
                compliances={compliances}
                animateCardsIn={animateCardsIn && !cardsRevealedRef.current}
                onCardsRevealed={() => {
                  cardsRevealedRef.current = true;
                }}
              />
            )}
            {activePage === 'calendar' && (
              <CalendarPage events={events} onAdd={handleAddEvent} onDelete={handleDeleteEvent} />
            )}
            {activePage === 'tasks' && (
              <TaskManager
                tasks={tasks}
                onAdd={handleAddTask}
                onUpdateStatus={handleUpdateStatus}
                onDelete={handleDeleteTask}
                onArchive={handleArchiveTask}
                onArchiveAllCompleted={handleArchiveAllCompleted}
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
                onAddMissingStandard={handleAddMissingStandardCompliances}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

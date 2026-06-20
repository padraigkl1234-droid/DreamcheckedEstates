'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, type User } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
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
  Bot,
  Send,
  CheckCircle2,
  Circle,
  AlertTriangle,
  X,
  Minus,
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
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';
type PageKey = 'dashboard' | 'calendar' | 'tasks' | 'compliance';

interface Task {
  id: string;
  name: string;
  priority: Priority;
  dueDate: string;
  status: TaskStatus;
}

interface ComplianceItem {
  id: string;
  name: string;
  completed: boolean;
  date: string;
  nextDueDate: string;
  comments: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  priority: Priority;
  notes: string;
}

interface ChatMessage {
  id: string;
  sender: 'jarvis' | 'user';
  text: string;
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
  { id: 'c1', name: 'Fire Risk Assessment (FRA)', completed: true, date: '2026-04-12', nextDueDate: '2027-04-12', comments: 'Annual review complete, no actions outstanding.' },
  { id: 'c2', name: 'Legionella Risk Assessment', completed: false, date: '', nextDueDate: '2026-07-01', comments: '' },
  { id: 'c3', name: 'Gas Safety Certification (CP12)', completed: true, date: '2026-02-03', nextDueDate: '2027-02-03', comments: 'Engineer signed off, certificate filed.' },
  { id: 'c4', name: 'Fixed Wire Testing (EICR)', completed: false, date: '', nextDueDate: '2026-09-15', comments: 'Booked in for next quarter.' },
  { id: 'c5', name: 'Emergency Lighting Testing', completed: true, date: '2026-05-30', nextDueDate: '2026-06-30', comments: 'Monthly function test passed.' },
  { id: 'c6', name: 'Lift Inspections (LOLER)', completed: false, date: '', nextDueDate: '2026-08-01', comments: '' },
];

const BOOT_STEPS = [
  'INITIALIZING CORE...',
  'CALIBRATING SENSOR ARRAY...',
  'ESTABLISHING ESTATE UPLINK...',
  'LOADING COMPLIANCE DATABASE...',
  'SYSTEMS NOMINAL.',
];

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'tasks', label: 'Task Manager', icon: ListChecks },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'text-red-400 border-red-500/30 bg-red-500/10 shadow-glow-subtle',
  Medium: 'text-amber-300 border-amber-400/30 bg-amber-400/10 shadow-glow-subtle',
  Low: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10 shadow-glow-subtle',
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  'Not Started': 'text-slate-400 border-slate-500/40 bg-slate-500/10',
  'In Progress': 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  Completed: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

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
// Synthesized interface sound effects (Web Audio API, no audio files)
// ---------------------------------------------------------------------------

let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new AudioContextCtor();
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
  return sharedAudioCtx;
}

function playPowerUpHum() {
  const ctx = getAudioCtx();
  if (!ctx) return;
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

function playSuccessChime() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes: Array<{ freq: number; start: number; dur: number }> = [
    { freq: 880, start: 0, dur: 0.08 },
    { freq: 1320, start: 0.09, dur: 0.12 },
  ];

  notes.forEach(({ freq, start, dur }) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + start);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.22, now + start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  });
}

// ---------------------------------------------------------------------------
// HUD bracket corners (Iron Man style panel frame accents)
// ---------------------------------------------------------------------------

function HudCorners({ tone = 'cyan' }: { tone?: 'cyan' | 'amber' }) {
  const c = tone === 'amber' ? 'border-amber-400/70' : 'border-cyan-400/70';
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
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[9px] tracking-widest text-cyan-600/70 ${className}`}>
      <Crosshair className="text-cyan-500/50" />
      SYS_REF: {code}
    </span>
  );
}

function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-cyan-600 ${className}`}>
      <Crosshair className="text-cyan-500/40" />
      {children}
    </span>
  );
}

function MicroCorners() {
  return (
    <>
      <span className="pointer-events-none absolute -top-px -left-px h-1.5 w-1.5 border-l border-t border-cyan-400/35" />
      <span className="pointer-events-none absolute -top-px -right-px h-1.5 w-1.5 border-r border-t border-cyan-400/35" />
      <span className="pointer-events-none absolute -bottom-px -left-px h-1.5 w-1.5 border-l border-b border-cyan-400/35" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-1.5 w-1.5 border-r border-b border-cyan-400/35" />
    </>
  );
}

function ConcentricPulse() {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-cyan-400/40 animate-ping"
        style={{ animationDuration: '2.6s' }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-cyan-400/25 animate-ping"
        style={{ animationDuration: '2.6s', animationDelay: '0.9s' }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-cyan-400/15 animate-ping"
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
        <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(0,240,255,0.12)" strokeWidth="1.5" />
      </svg>
      <svg viewBox="0 0 200 200" className="absolute h-full w-full animate-[spin_5s_linear_infinite]">
        <circle
          cx="100"
          cy="100"
          r="94"
          fill="none"
          stroke="rgba(0,240,255,0.9)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="110 480"
          style={{ filter: 'drop-shadow(0 0 10px rgba(0,240,255,0.9))' }}
        />
      </svg>

      <button
        onClick={onIgnite}
        className="group absolute inset-[32%] flex items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/5 shadow-glow-subtle transition-all duration-300 hover:scale-105 hover:shadow-glow-strong"
      >
        <span className="absolute inset-0 rounded-full border border-cyan-400/30 animate-pulse" />
        <Power className="relative z-10 h-7 w-7 text-cyan-300 drop-shadow-glow-subtle transition-all group-hover:text-white group-hover:drop-shadow-glow-strong" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot HUD side panels — network/quick-links and environment/systems
// ---------------------------------------------------------------------------

function HudCornerPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-cyan-400/20 bg-[#020813]/60 p-4 shadow-glow-subtle backdrop-blur-md ${className}`}>
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
          className={`w-1 rounded-sm ${i < level ? 'bg-cyan-300 shadow-glow-subtle' : 'bg-cyan-900'}`}
          style={{ height: `${6 + i * 3}px` }}
        />
      ))}
    </div>
  );
}

function MiniMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-widest text-cyan-500">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-cyan-300">{value}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-cyan-950/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0066ff] to-[#00f0ff] shadow-glow-subtle"
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
  { label: 'JARVIS Core', icon: Bot, value: 100 },
];

function NetworkPanel() {
  return (
    <HudCornerPanel className="w-52">
      <div className="mb-4 flex items-center justify-between">
        <Kicker>Estate Link</Kicker>
        <SignalBars level={5} />
      </div>
      <div className="mb-1 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-cyan-300" />
        <span className="font-mono text-lg font-bold tabular-nums text-cyan-200 [text-shadow:var(--glow-text-subtle)]">98%</span>
      </div>
      <p className="mb-4 text-[10px] tracking-widest text-cyan-600">ESTATE-WIFI · LAN SECURE</p>

      <div className="space-y-3 border-t border-cyan-400/15 pt-3">
        {BOOT_QUICK_LINKS.map((link) => (
          <div key={link.label} className="flex items-center gap-2">
            <link.icon className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
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
          className="w-[3px] rounded-sm bg-cyan-300/80 shadow-glow-subtle"
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
        <Cloud className="h-5 w-5 text-cyan-300" />
        <span className="font-mono text-2xl font-bold tabular-nums text-cyan-200 [text-shadow:var(--glow-text-subtle)]">18°C</span>
      </div>
      <p className="mb-3 text-[10px] tracking-widest text-cyan-600">OVERCAST · ESTATE GROUNDS</p>

      <div className="mb-4 grid grid-cols-3 gap-2 border-t border-cyan-400/15 pt-3 text-center">
        <div>
          <Droplets className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-500" />
          <p className="font-mono text-xs text-cyan-200">64%</p>
          <p className="text-[8px] uppercase tracking-widest text-cyan-700">Humid</p>
        </div>
        <div>
          <Eye className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-500" />
          <p className="font-mono text-xs text-cyan-200">9km</p>
          <p className="text-[8px] uppercase tracking-widest text-cyan-700">Visib</p>
        </div>
        <div>
          <Wind className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-500" />
          <p className="font-mono text-xs text-cyan-200">14kt</p>
          <p className="text-[8px] uppercase tracking-widest text-cyan-700">Wind</p>
        </div>
      </div>

      <div className="border-t border-cyan-400/15 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cyan-500">
            <Music2 className="h-3 w-3" /> Ambient Feed
          </span>
          <span className="text-[9px] uppercase tracking-widest text-emerald-400 [text-shadow:0_0_8px_rgba(52,211,153,0.8)]">Live</span>
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
          <linearGradient id="jarvisProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#0066ff" />
          </linearGradient>
        </defs>

        {/* base ring */}
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(0,240,255,0.08)" strokeWidth="10" />

        {/* progress ring */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#jarvisProgressGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.7s ease',
            filter: 'drop-shadow(0 0 3px rgba(0,240,255,0.3))',
          }}
        />

        {/* rotating radar sweep arc */}
        <circle
          cx="100"
          cy="100"
          r={radius - 18}
          fill="none"
          stroke="rgba(0,240,255,0.55)"
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
          stroke="rgba(0,240,255,0.25)"
          strokeWidth="1"
          strokeDasharray="2 5"
          className="animate-[spin_9s_linear_infinite_reverse]"
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-5xl font-bold tabular-nums tracking-tight text-cyan-300 [text-shadow:var(--glow-text-subtle)]">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<'idle' | 'booting'>('idle');
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stage !== 'booting') return;
    setStepIndex(0);
    const interval = setInterval(() => {
      setStepIndex((prev) => {
        if (prev + 1 >= BOOT_STEPS.length) {
          clearInterval(interval);
          setTimeout(onComplete, 700);
          return prev;
        }
        return prev + 1;
      });
    }, 480);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const progress = ((stepIndex + 1) / BOOT_STEPS.length) * 100;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#020813]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,102,255,0.1),transparent_70%)]" />

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
            <Satellite className="h-8 w-8 animate-pulse text-cyan-300 drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
          </div>
          <div className="space-y-1.5 text-xs">
            {BOOT_STEPS.map((step, i) => (
              <p
                key={step}
                className={`tracking-wider transition-opacity duration-300 ${
                  i <= stepIndex ? 'text-cyan-300 opacity-100' : 'text-cyan-900 opacity-30'
                }`}
              >
                {i < stepIndex ? '> ' : i === stepIndex ? '> ' : '  '}
                {step}
              </p>
            ))}
          </div>
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0066ff] to-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.8)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <SysRef code="0000-BOOT" className="text-cyan-700/60" />
            <span className="font-mono text-[10px] tabular-nums tracking-widest text-cyan-500/70">
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
  return (
    <aside className="flex w-16 flex-col border-r border-cyan-400/20 bg-[#020813]/70 shadow-glow-subtle backdrop-blur-xl md:w-60">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-cyan-400/20 px-2 md:justify-start md:px-5">
        <Bot className="h-7 w-7 text-cyan-300 drop-shadow-glow-subtle" />
        <div className="hidden md:block">
          <p className="text-sm font-bold tracking-[0.15em] text-cyan-300 [text-shadow:var(--glow-text-subtle)]">J.A.R.V.I.S.</p>
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
              className={`flex items-center justify-center gap-3 rounded-md border px-3 py-2.5 text-xs uppercase tracking-wider transition-all md:justify-start ${
                active
                  ? 'border-[#0066ff]/60 bg-[#0066ff]/10 text-cyan-200 shadow-glow-strong-blue'
                  : 'border-transparent text-cyan-700 hover:border-cyan-500/20 hover:bg-cyan-500/5 hover:text-cyan-400'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-cyan-400/20 p-3">
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
                ? 'text-cyan-800'
                : syncStatus === 'error'
                ? 'text-red-400'
                : syncStatus === 'loading'
                ? 'animate-pulse text-cyan-400'
                : 'text-emerald-400'
            }`}
          />
          <span
            className={`hidden text-[10px] uppercase tracking-widest md:inline ${
              !user
                ? 'text-cyan-800'
                : syncStatus === 'error'
                ? 'text-red-400'
                : syncStatus === 'loading'
                ? 'text-cyan-400'
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
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ tasks, compliances }: { tasks: Task[]; compliances: ComplianceItem[] }) {
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

  const totalItems = tasks.length + compliances.length;
  const completedItems = tasks.filter((t) => t.status === 'Completed').length + compliances.filter((c) => c.completed).length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const recentTasks = [...tasks].slice(-4).reverse();

  const upcomingCompliances = [...compliances]
    .filter((c) => !c.completed)
    .sort((a, b) => (a.nextDueDate || '').localeCompare(b.nextDueDate || ''))
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Panel title="Estates & Maintenance Overall" icon={Gauge} refCode="0012-A" tier="primary">
          <div className="flex flex-1 items-center justify-center py-2">
            <CircularProgress percentage={completionPct} />
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-cyan-500/15 pt-4 text-center">
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-emerald-300">{completedItems}</p>
              <Kicker className="justify-center">Completed</Kicker>
            </div>
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-cyan-200">{totalItems - completedItems}</p>
              <Kicker className="justify-center">Outstanding</Kicker>
            </div>
          </div>
        </Panel>

        <Panel title="Recently Added Tasks" icon={ListChecks} refCode="0027-T" tier="primary">
          <div className="flex flex-col gap-2">
            {recentTasks.length === 0 && (
              <p className="py-6 text-center text-xs text-cyan-700">No tasks logged yet.</p>
            )}
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="relative flex items-center justify-between gap-2 rounded-md border border-cyan-400/20 bg-[#020813]/40 shadow-glow-subtle px-3 py-2.5"
              >
                <MicroCorners />
                <div className="min-w-0">
                  <p className="truncate text-sm text-cyan-100">{task.name}</p>
                  <Kicker>Due {task.dueDate || '—'}</Kicker>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[task.status]}`}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Compliance" icon={ShieldCheck} refCode="0030-C" tier="primary">
          <div className="flex flex-col gap-2">
            {upcomingCompliances.length === 0 && (
              <p className="py-6 text-center text-xs text-cyan-700">No outstanding compliance items.</p>
            )}
            {upcomingCompliances.map((item) => (
              <div
                key={item.id}
                className="relative flex items-center justify-between gap-2 rounded-md border border-cyan-400/20 bg-[#020813]/40 shadow-glow-subtle px-3 py-2.5"
              >
                <MicroCorners />
                <div className="min-w-0">
                  <p className="truncate text-sm text-cyan-100">{item.name}</p>
                  <Kicker>Due {item.nextDueDate || '—'}</Kicker>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES['Not Started']}`}>
                  Outstanding
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="System Diagnostics" icon={Activity} refCode="0048-A" tier="ambient">
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="font-mono text-3xl font-bold tabular-nums tracking-widest text-cyan-300 [text-shadow:var(--glow-text-subtle)]">
                {now.toLocaleTimeString('en-GB')}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-cyan-600">
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

        <WeatherPanel weather={weather} status={weatherStatus} tier="ambient" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <NewsPanel
          title="BBC News Feed"
          icon={Newspaper}
          refCode="0091-N"
          items={news.general}
          status={newsStatus}
          tier="ambient"
        />
        <NewsPanel
          title="Business & Economics"
          icon={Briefcase}
          refCode="0092-B"
          items={news.business}
          status={newsStatus}
          tier="ambient"
        />
        <NewsPanel
          title="Football News"
          icon={Trophy}
          refCode="0093-F"
          items={news.football}
          status={newsStatus}
          tier="ambient"
        />
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
        <div className="flex flex-col items-center gap-2 py-10 text-cyan-600">
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
              <WeatherIcon className="h-6 w-6 text-cyan-300" />
              <span className="font-mono text-3xl font-bold tabular-nums text-cyan-200 [text-shadow:var(--glow-text-subtle)]">
                {weather.temperatureC}°C
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-cyan-600">{info.label} · Margate, UK</p>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-cyan-500/15 pt-4 text-center">
            <div>
              <Droplets className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-500" />
              <p className="font-mono text-xs text-cyan-200">{weather.humidity}%</p>
              <p className="text-[8px] uppercase tracking-widest text-cyan-700">Humidity</p>
            </div>
            <div>
              <Wind className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-500" />
              <p className="font-mono text-xs text-cyan-200">{weather.windSpeedKmh}km/h</p>
              <p className="text-[8px] uppercase tracking-widest text-cyan-700">Wind</p>
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
    <div className="relative min-h-[90px] flex-1 overflow-hidden rounded-md border border-cyan-400/15 bg-[#01060f]/40">
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
        className="absolute top-1/2 h-12 w-12 -translate-y-1/2 text-cyan-200 drop-shadow-[0_0_4px_rgba(0,240,255,0.18)] animate-cloud-drift"
        style={{ left: '22%' }}
      />
      <Cloud
        className="absolute top-[62%] h-7 w-7 text-cyan-300/50 animate-cloud-drift"
        style={{ left: '54%', animationDuration: '13s', animationDirection: 'reverse' }}
      />
    </div>
  );
}

function FogScene() {
  const bands = Array.from({ length: 3 });
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2.5">
      <CloudFog className="mb-1 h-9 w-9 text-cyan-200/80 drop-shadow-[0_0_4px_rgba(0,240,255,0.15)]" />
      {bands.map((_, i) => (
        <span
          key={i}
          className="h-1 w-[70%] rounded-full bg-cyan-300/30 animate-fog-drift"
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
      <CloudRain className="absolute left-1/2 top-[18%] h-11 w-11 -translate-x-1/2 text-cyan-200 drop-shadow-[0_0_4px_rgba(0,240,255,0.18)]" />
      {drops.map((_, i) => (
        <span
          key={i}
          className="absolute top-[52%] w-[2px] h-2.5 rounded-full bg-cyan-300/70 animate-rain-fall"
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
      <CloudSnow className="absolute left-1/2 top-[16%] h-11 w-11 -translate-x-1/2 text-cyan-100 drop-shadow-[0_0_4px_rgba(0,240,255,0.18)]" />
      {flakes.map((_, i) => (
        <span
          key={i}
          className="absolute top-[48%] h-1.5 w-1.5 rounded-full bg-cyan-100/80 animate-snow-fall"
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
      <Cloud className="absolute left-1/2 top-[14%] h-11 w-11 -translate-x-1/2 text-cyan-200/90" />
      <CloudLightning className="absolute left-1/2 top-[34%] h-8 w-8 -translate-x-1/2 text-amber-300 drop-shadow-glow-strong-amber animate-bolt-flash" />
      {drops.map((_, i) => (
        <span
          key={i}
          className="absolute top-[58%] w-[2px] h-2.5 rounded-full bg-cyan-300/70 animate-rain-fall"
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
        <Radio className="h-3 w-3 text-red-400" />
        <span className="text-[10px] uppercase tracking-widest text-red-400 [text-shadow:var(--glow-text-strong-red)]">Live</span>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-10 text-cyan-600">
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
        <p className="py-10 text-center text-xs text-cyan-700">No headlines returned.</p>
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
      className="group relative flex gap-2 rounded-md border border-cyan-400/20 bg-[#020813]/40 p-2 shadow-glow-subtle transition-all hover:border-cyan-400/60 hover:bg-cyan-400/5 hover:shadow-glow-strong-blue"
    >
      <MicroCorners />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-cyan-400/20 bg-[#01060f]">
        {showImage ? (
          <img
            src={item.image ?? ''}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImageOff className="h-4 w-4 text-cyan-700" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <p className="line-clamp-2 text-xs text-cyan-100 group-hover:text-cyan-50">{item.title}</p>
        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-cyan-600">
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
  const color = value > 80 ? '#f87171' : value > 55 ? '#fbbf24' : '#0066ff';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <MicroCorners />
        <svg viewBox="0 0 60 60" className="absolute h-full w-full -rotate-90">
          <circle cx="30" cy="30" r={radius} fill="none" stroke="rgba(0,240,255,0.1)" strokeWidth="4" />
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
        <span className="font-mono text-[11px] font-bold tabular-nums text-cyan-200">{value}%</span>
      </div>
      <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-cyan-500">
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
          ? 'relative flex flex-col border border-cyan-400/10 bg-[#020813]/50 p-4 shadow-glow-none backdrop-blur-xl'
          : 'relative flex flex-col border border-cyan-400/30 bg-[#020813]/50 p-5 shadow-glow-subtle backdrop-blur-xl'
      }
    >
      <HudCorners />
      <div
        className={
          isAmbient
            ? 'mb-4 flex items-center justify-between gap-2 border-b border-cyan-400/15 pb-3'
            : 'mb-4 flex items-center justify-between gap-2 border-b border-cyan-400/20 pb-3'
        }
      >
        <div className="flex items-center gap-2">
          <Icon
            className={
              isAmbient
                ? 'h-4 w-4 text-cyan-500/70'
                : 'h-4 w-4 text-cyan-300 drop-shadow-glow-subtle'
            }
          />
          <h2
            className={
              isAmbient
                ? 'text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-500/70'
                : 'text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300 [text-shadow:var(--glow-text-subtle)]'
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    onAdd({ id: genId(), title: title.trim(), date, priority, notes: notes.trim() });
    playSuccessChime();
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
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50 sm:col-span-2 lg:col-span-2"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes, e.g. it is with Paul A"
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[#0066ff]/60 bg-[#0066ff]/10 py-2 text-xs font-semibold uppercase tracking-widest text-cyan-200 shadow-glow-subtle transition-all hover:bg-[#0066ff]/20 hover:shadow-glow-strong-blue sm:col-span-2 lg:col-span-5"
          >
            <Plus className="h-4 w-4" /> Add to Diary
          </button>
        </form>
      </Panel>

      <Panel title={`${MONTH_LABELS[viewMonth]} ${viewYear}`} icon={CalendarDays} refCode="0103-C">
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            onClick={goToPrevMonth}
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 p-1.5 text-cyan-300 transition-colors hover:bg-cyan-400/10"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToToday}
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-300 transition-colors hover:bg-cyan-400/10"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 p-1.5 text-cyan-300 transition-colors hover:bg-cyan-400/10"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-1 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-cyan-500">
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
                    ? 'border-cyan-300 bg-cyan-400/10 shadow-glow-strong'
                    : 'border-cyan-400/15 bg-[#020813]/40'
                }`}
              >
                <span className={`font-mono text-[11px] ${isToday ? 'font-bold text-cyan-200' : 'text-cyan-500'}`}>{dayNum}</span>
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
            className="relative w-full max-w-sm border border-cyan-400/40 bg-[#020813]/95 p-5 shadow-glow-strong-blue"
            onClick={(e) => e.stopPropagation()}
          >
            <HudCorners />
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute right-3 top-3 text-cyan-500 transition-colors hover:text-cyan-200"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <Kicker>Diary Entry</Kicker>
            <h3 className="mt-1 pr-6 text-base font-semibold text-cyan-100">{selectedEvent.title}</h3>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-cyan-300">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{formatDisplayDate(selectedEvent.date)}</span>
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[selectedEvent.priority]}`}
              >
                {selectedEvent.priority} Priority
              </span>
              <p className="rounded-md border border-cyan-400/20 bg-[#020813]/60 p-2 text-xs text-cyan-200">
                {selectedEvent.notes || 'No notes added.'}
              </p>
            </div>
            <button
              onClick={() => {
                onDelete(selectedEvent.id);
                setSelectedEvent(null);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 py-2 text-xs font-semibold uppercase tracking-widest text-red-300 transition-all hover:bg-red-500/20 hover:shadow-glow-strong-red"
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
}: {
  tasks: Task[];
  onAdd: (task: Task) => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Not Started');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ id: genId(), name: name.trim(), priority, dueDate, status });
    playSuccessChime();
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
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50 sm:col-span-2 lg:col-span-2"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="w-full min-w-0 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          >
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[#0066ff]/60 bg-[#0066ff]/10 py-2 text-xs font-semibold uppercase tracking-widest text-cyan-200 shadow-glow-subtle transition-all hover:bg-[#0066ff]/20 hover:shadow-glow-strong-blue sm:col-span-2 lg:col-span-5"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </form>
      </Panel>

      <Panel title={`Active Tasks (${tasks.length})`} icon={ListChecks} refCode="0104-T">
        <div className="space-y-2">
          {tasks.length === 0 && (
            <p className="py-8 text-center text-xs text-cyan-700">No tasks in queue.</p>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="relative flex flex-col gap-3 rounded-md border border-cyan-400/20 bg-[#020813]/40 shadow-glow-subtle p-3 md:flex-row md:items-center md:justify-between"
            >
              <MicroCorners />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-cyan-100">{task.name}</p>
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
                <button
                  onClick={() => onDelete(task.id)}
                  className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 transition-all hover:bg-red-500/20 hover:shadow-glow-strong-red"
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
}: {
  compliances: ComplianceItem[];
  onAdd: (item: ComplianceItem) => void;
  onToggle: (id: string) => void;
  onChangeDate: (id: string, date: string) => void;
  onChangeNextDueDate: (id: string, date: string) => void;
  onChangeComments: (id: string, comments: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [comments, setComments] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ id: genId(), name: name.trim(), completed: false, date, nextDueDate, comments });
    playSuccessChime();
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
            className="md:col-span-2 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <div className="flex flex-col gap-1">
            <label className="text-[9px] uppercase tracking-widest text-cyan-600">Last Completed</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] uppercase tracking-widest text-cyan-600">Next Due Date</label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
            />
          </div>
          <input
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Comments..."
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <button
            type="submit"
            className="md:col-span-5 flex items-center justify-center gap-2 rounded-md border border-[#0066ff]/60 bg-[#0066ff]/10 py-2 text-xs font-semibold uppercase tracking-widest text-cyan-200 shadow-glow-subtle transition-all hover:bg-[#0066ff]/20 hover:shadow-glow-strong-blue"
          >
            <Plus className="h-4 w-4" /> Add Compliance Item
          </button>
        </form>
      </Panel>

      <Panel title="Estate Compliance Tracker" icon={ShieldCheck} refCode="0200-C">
        <div className="mb-2 hidden gap-3 px-3 text-[9px] uppercase tracking-widest text-cyan-600 md:grid md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.3fr_auto]">
          <span>Status</span>
          <span>Item</span>
          <span>Last Completed</span>
          <span>Next Due</span>
          <span>Comments</span>
          <span />
        </div>
        <div className="space-y-2">
          {compliances.length === 0 && (
            <p className="py-8 text-center text-xs text-cyan-700">No compliance items logged.</p>
          )}
          {compliances.map((item) => (
            <div
              key={item.id}
              className="relative grid grid-cols-1 items-center gap-3 rounded-md border border-cyan-400/20 bg-[#020813]/40 shadow-glow-subtle p-3 md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.3fr_auto]"
            >
              <MicroCorners />
              <button
                onClick={() => {
                  if (!item.completed) playSuccessChime();
                  onToggle(item.id);
                }}
                className="flex items-center justify-center"
                title={item.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                {item.completed ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]" />
                ) : (
                  <Circle className="h-6 w-6 text-cyan-700" />
                )}
              </button>

              <p className={`text-sm ${item.completed ? 'text-emerald-200' : 'text-cyan-100'}`}>{item.name}</p>

              <input
                type="date"
                value={item.date}
                onChange={(e) => onChangeDate(item.id, e.target.value)}
                className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-2 py-1.5 text-xs text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
              />

              <input
                type="date"
                value={item.nextDueDate}
                onChange={(e) => onChangeNextDueDate(item.id, e.target.value)}
                className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-2 py-1.5 text-xs text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
              />

              <input
                value={item.comments}
                onChange={(e) => onChangeComments(item.id, e.target.value)}
                placeholder="Comments..."
                className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-2 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
              />

              <button
                onClick={() => onDelete(item.id)}
                className="flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 transition-all hover:bg-red-500/20 hover:shadow-glow-strong-red"
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
// JARVIS intent parsing — turns free-text chat commands into state actions
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDueDate(text: string, now: Date): string | null {
  const lower = text.toLowerCase();
  const monthPattern = MONTH_NAMES.join('|');

  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const monthDay = lower.match(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (monthDay) {
    const month = MONTH_NAMES.indexOf(monthDay[1]);
    const day = parseInt(monthDay[2], 10);
    const year = monthDay[3] ? parseInt(monthDay[3], 10) : now.getFullYear();
    return toISODate(new Date(year, month, day));
  }

  const dayMonth = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:,?\\s+(\\d{4}))?\\b`));
  if (dayMonth) {
    const day = parseInt(dayMonth[1], 10);
    const month = MONTH_NAMES.indexOf(dayMonth[2]);
    const year = dayMonth[3] ? parseInt(dayMonth[3], 10) : now.getFullYear();
    return toISODate(new Date(year, month, day));
  }

  if (/\btomorrow\b/.test(lower)) return toISODate(addDays(now, 1));
  if (/\btoday\b/.test(lower)) return toISODate(now);
  if (/\bnext week\b/.test(lower)) return toISODate(addDays(now, 7));
  if (/\bnext month\b/.test(lower)) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return toISODate(d);
  }
  if (/\bnext year\b/.test(lower)) {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() + 1);
    return toISODate(d);
  }
  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) return toISODate(addDays(now, parseInt(inDays[1], 10)));
  const inWeeks = lower.match(/\bin\s+(\d+)\s+weeks?\b/);
  if (inWeeks) return toISODate(addDays(now, parseInt(inWeeks[1], 10) * 7));
  const inMonths = lower.match(/\bin\s+(\d+)\s+months?\b/);
  if (inMonths) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + parseInt(inMonths[1], 10));
    return toISODate(d);
  }
  const inYears = lower.match(/\bin\s+(\d+)\s+years?\b/);
  if (inYears) {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() + parseInt(inYears[1], 10));
    return toISODate(d);
  }

  return null;
}

const DUE_CLAUSE = new RegExp(
  `\\b(on|by|due)\\s+(today|tomorrow|next\\s+week|next\\s+month|next\\s+year|in\\s+\\d+\\s+(days?|weeks?|months?|years?)|\\d{4}-\\d{2}-\\d{2}|(${MONTH_NAMES.join('|')})\\s+\\d{1,2}(st|nd|rd|th)?(,?\\s+\\d{4})?|\\d{1,2}(st|nd|rd|th)?\\s+(${MONTH_NAMES.join('|')})(,?\\s+\\d{4})?)\\b`,
  'gi'
);

function cleanName(name: string, fallback: string): string {
  const trimmed = name.replace(/\s{2,}/g, ' ').trim().replace(/^[.,;:\s]+|[.,;:\s]+$/g, '');
  if (!trimmed) return fallback;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

type JarvisIntent =
  | { type: 'add_task'; task: Task }
  | { type: 'add_compliance'; item: ComplianceItem }
  | { type: 'none' };

function parseJarvisCommand(text: string, now: Date = new Date()): JarvisIntent {
  const lower = text.toLowerCase();
  const actionWord = /\b(add|create|schedule|deploy|log|set\s*up)\b/;
  const mentionsCompliance = /\bcompliance\b/.test(lower);
  const mentionsTask = /\btask\b/.test(lower);

  if (mentionsCompliance && actionWord.test(lower)) {
    const dueDate = parseDueDate(text, now) ?? toISODate(addDays(now, 365));
    let name = text
      .replace(/^.*?\b(add|create|schedule|deploy|log|set\s*up)\b\s+(a\s+)?(new\s+)?/i, '')
      .replace(/\bcompliance\b\s*(log|item|record|entry)?/gi, '')
      .replace(DUE_CLAUSE, '');
    return {
      type: 'add_compliance',
      item: {
        id: genId(),
        name: cleanName(name, 'Untitled compliance item'),
        completed: false,
        date: '',
        nextDueDate: dueDate,
        comments: '',
      },
    };
  }

  if (mentionsTask && actionWord.test(lower)) {
    const priorityMatch = lower.match(/\b(high|medium|low)\b\s*(priority)?/);
    const priority: Priority = priorityMatch
      ? ((priorityMatch[1][0].toUpperCase() + priorityMatch[1].slice(1)) as Priority)
      : 'Medium';
    const dueDate = parseDueDate(text, now) ?? toISODate(addDays(now, 7));
    let name = text
      .replace(/^.*?\btask\b(\s+to)?\s*/i, '')
      .replace(/\b(with\s+)?(high|medium|low)\s*(priority)?\b/gi, '')
      .replace(DUE_CLAUSE, '');
    return {
      type: 'add_task',
      task: {
        id: genId(),
        name: cleanName(name, 'Untitled task'),
        priority,
        dueDate,
        status: 'Not Started',
      },
    };
  }

  return { type: 'none' };
}

// ---------------------------------------------------------------------------
// JARVIS Chatbox
// ---------------------------------------------------------------------------

function JarvisChatbox({
  completionPct,
  outstandingTasks,
  onAddTask,
  onAddCompliance,
}: {
  completionPct: number;
  outstandingTasks: number;
  onAddTask: (task: Task) => void;
  onAddCompliance: (item: ComplianceItem) => void;
}) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const reply = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('status') || lower.includes('progress')) {
      return `Current estate completion stands at ${completionPct} percent, with ${outstandingTasks} item(s) outstanding, sir.`;
    }
    if (lower.includes('compliance')) {
      return 'Compliance records are up to date. I recommend reviewing any outstanding certifications on the Compliance page.';
    }
    if (lower.includes('task')) {
      return 'You can deploy or update tasks from the Task Manager. Shall I flag any high-priority items?';
    }
    if (lower.includes('hello') || lower.includes('hi')) {
      return 'Good to see you again, sir. All estate systems are functioning within normal parameters.';
    }
    return "Noted, sir. I've logged that for the estate records.";
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: genId(), sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    const intent = parseJarvisCommand(text);
    let responseText: string;
    if (intent.type === 'add_task') {
      onAddTask(intent.task);
      responseText = `Understood, sir. I have deployed the "${intent.task.name}" task with ${intent.task.priority} priority for ${intent.task.dueDate}.`;
    } else if (intent.type === 'add_compliance') {
      onAddCompliance(intent.item);
      responseText = `Understood, sir. I have created the "${intent.item.name}" compliance log, due ${intent.item.nextDueDate}.`;
    } else {
      responseText = reply(text);
    }

    setTimeout(() => {
      setMessages((prev) => [...prev, { id: genId(), sender: 'jarvis', text: responseText }]);
    }, 700);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div className="relative mb-3 flex h-96 w-80 flex-col overflow-hidden border border-cyan-400/30 bg-[#020813]/70 shadow-glow-subtle backdrop-blur-xl">
          <HudCorners />
          <div className="flex items-center justify-between border-b border-cyan-400/25 bg-cyan-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-400/10">
                <Bot className="h-4 w-4 text-cyan-300" />
                <ConcentricPulse />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-cyan-300 [text-shadow:var(--glow-text-subtle)]">J.A.R.V.I.S.</p>
                <p className="text-[9px] uppercase tracking-widest text-emerald-400">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SysRef code="0500-AI" className="hidden text-cyan-700/60 sm:inline-flex" />
              <button onClick={() => setOpen(false)} className="text-cyan-500 hover:text-cyan-300">
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
                  m.sender === 'jarvis'
                    ? 'border border-cyan-400/25 bg-cyan-500/10 text-cyan-100 shadow-glow-subtle'
                    : 'ml-auto border border-[#0066ff]/30 bg-[#0066ff]/10 text-right text-cyan-50 shadow-glow-subtle'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-cyan-400/25 p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Message J.A.R.V.I.S..."
              className="flex-1 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-glow-strong-blue px-3 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
            />
            <button
              onClick={handleSend}
              className="rounded-md border border-cyan-400/50 bg-cyan-400/10 p-2 text-cyan-300 transition-colors hover:bg-cyan-400/20"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/50 bg-[#020813]/90 shadow-glow-subtle backdrop-blur-xl transition-all hover:scale-105 hover:shadow-glow-strong-blue"
      >
        <ConcentricPulse />
        {open ? <X className="h-5 w-5 text-cyan-300" /> : <Bot className="h-6 w-6 text-cyan-300" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

export default function JarvisTrackerPage() {
  const { user } = useAuth();
  const [booted, setBooted] = useState(false);
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [compliances, setCompliances] = useState<ComplianceItem[]>(SEED_COMPLIANCES);
  const [events, setEvents] = useState<CalendarEvent[]>(SEED_EVENTS);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>('idle');
  const loadedForUid = useRef<string | null>(null);
  const readyToSave = useRef(false);

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
          if (Array.isArray(data.compliances)) setCompliances(data.compliances as ComplianceItem[]);
          if (Array.isArray(data.events)) setEvents(data.events as CalendarEvent[]);
        }
        setSyncStatus('synced');
      } catch (error) {
        console.error('Failed to load JARVIS progress:', error);
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
        compliances,
        events,
        updatedAt: Date.now(),
      })
        .then(() => setSyncStatus('synced'))
        .catch((error) => {
          console.error('Failed to save JARVIS progress:', error);
          setSyncStatus('error');
        });
    }, 600);
    return () => clearTimeout(timeout);
  }, [tasks, compliances, events, user]);

  const totalItems = tasks.length + compliances.length;
  const completedItems = tasks.filter((t) => t.status === 'Completed').length + compliances.filter((c) => c.completed).length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const handleAddTask = (task: Task) => setTasks((prev) => [...prev, task]);
  const handleUpdateStatus = (id: string, status: TaskStatus) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  const handleDeleteTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

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

  const handleAddEvent = (event: CalendarEvent) => setEvents((prev) => [...prev, event]);
  const handleDeleteEvent = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#020813] font-sans text-cyan-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#0066ff]/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 z-40 animate-scanlines opacity-[0.07] mix-blend-screen"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(0,240,255,0.6) 0px, rgba(0,240,255,0.6) 1px, transparent 1px, transparent 8px)',
        }}
      />

      {!booted && <BootSequence onComplete={() => setBooted(true)} />}

      {booted && (
        <div className="relative flex h-full">
          <Sidebar activePage={activePage} onNavigate={setActivePage} user={user} syncStatus={syncStatus} />
          <main className="flex-1 overflow-y-auto p-5">
            {activePage === 'dashboard' && <Dashboard tasks={tasks} compliances={compliances} />}
            {activePage === 'calendar' && (
              <CalendarPage events={events} onAdd={handleAddEvent} onDelete={handleDeleteEvent} />
            )}
            {activePage === 'tasks' && (
              <TaskManager
                tasks={tasks}
                onAdd={handleAddTask}
                onUpdateStatus={handleUpdateStatus}
                onDelete={handleDeleteTask}
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
              />
            )}
          </main>
          <JarvisChatbox
            completionPct={completionPct}
            outstandingTasks={totalItems - completedItems}
            onAddTask={handleAddTask}
            onAddCompliance={handleAddCompliance}
          />
        </div>
      )}
    </div>
  );
}

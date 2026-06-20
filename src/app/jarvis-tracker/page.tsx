'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';
type PageKey = 'dashboard' | 'tasks' | 'compliance';

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

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_TASKS: Task[] = [
  { id: 't1', name: 'Inspect rooftop HVAC unit 4', priority: 'High', dueDate: '2026-06-20', status: 'In Progress' },
  { id: 't2', name: 'Replace lobby lighting fixtures', priority: 'Medium', dueDate: '2026-06-22', status: 'Not Started' },
  { id: 't3', name: 'Service car park barrier system', priority: 'Low', dueDate: '2026-06-25', status: 'Completed' },
  { id: 't4', name: 'Audit fire extinguisher inventory', priority: 'High', dueDate: '2026-06-19', status: 'Completed' },
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
  { key: 'tasks', label: 'Task Manager', icon: ListChecks },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'text-red-400 border-red-500/40 bg-red-500/10 shadow-[0_0_10px_rgba(248,113,113,0.35)]',
  Medium: 'text-amber-300 border-amber-400/40 bg-amber-400/10 shadow-[0_0_10px_rgba(251,191,36,0.3)]',
  Low: 'text-cyan-300 border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_10px_rgba(0,240,255,0.3)]',
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
        className="group absolute inset-[32%] flex items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/5 shadow-[0_0_24px_rgba(0,240,255,0.4)] transition-transform duration-300 hover:scale-105"
      >
        <span className="absolute inset-0 rounded-full border border-cyan-400/30 animate-pulse" />
        <Power className="relative z-10 h-7 w-7 text-cyan-300 drop-shadow-[0_0_12px_rgba(0,240,255,0.9)] transition-colors group-hover:text-white" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot HUD side panels — network/quick-links and environment/systems
// ---------------------------------------------------------------------------

function HudCornerPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-cyan-400/30 bg-[#020813]/60 p-4 shadow-[0_0_20px_rgba(0,102,255,0.1)] backdrop-blur-md ${className}`}>
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
          className={`w-1 rounded-sm ${i < level ? 'bg-cyan-300 shadow-[0_0_4px_rgba(0,240,255,0.8)]' : 'bg-cyan-900'}`}
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
          className="h-full rounded-full bg-gradient-to-r from-[#0066ff] to-[#00f0ff] shadow-[0_0_6px_rgba(0,240,255,0.7)]"
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
        <span className="font-mono text-lg font-bold tabular-nums text-cyan-200 [text-shadow:0_0_8px_rgba(0,240,255,0.5)]">98%</span>
      </div>
      <p className="mb-4 font-mono text-[10px] tracking-widest text-cyan-600">ESTATE-WIFI · LAN SECURE</p>

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
          className="w-[3px] rounded-sm bg-cyan-300/80 shadow-[0_0_4px_rgba(0,240,255,0.6)]"
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
        <span className="font-mono text-2xl font-bold tabular-nums text-cyan-200 [text-shadow:0_0_8px_rgba(0,240,255,0.5)]">18°C</span>
      </div>
      <p className="mb-3 font-mono text-[10px] tracking-widest text-cyan-600">OVERCAST · ESTATE GROUNDS</p>

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
          <span className="text-[9px] uppercase tracking-widest text-emerald-400">Live</span>
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
  const ticks = Array.from({ length: 60 });

  return (
    <div className="relative flex h-56 w-56 items-center justify-center">
      <svg viewBox="0 0 200 200" className="absolute h-full w-full -rotate-90">
        <defs>
          <linearGradient id="jarvisProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#0066ff" />
          </linearGradient>
        </defs>

        {/* faint outer dial ring, slowly rotating */}
        <circle
          cx="100"
          cy="100"
          r="97"
          fill="none"
          stroke="rgba(0,240,255,0.18)"
          strokeWidth="1"
          strokeDasharray="1 9"
          className="animate-[spin_22s_linear_infinite]"
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />

        {/* compass-style tick ring */}
        <g stroke="rgba(0,240,255,0.5)">
          {ticks.map((_, i) => {
            const angle = (i / ticks.length) * 360;
            const major = i % 5 === 0;
            return (
              <line
                key={i}
                x1="100"
                y1={major ? 6 : 11}
                x2="100"
                y2="16"
                strokeWidth={major ? 2 : 1}
                opacity={major ? 0.85 : 0.35}
                transform={`rotate(${angle} 100 100)`}
              />
            );
          })}
        </g>

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
            filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.85))',
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
        <span className="font-mono text-5xl font-bold tabular-nums tracking-tight text-cyan-300 [text-shadow:0_0_15px_rgba(0,240,255,0.8)]">
          {percentage}%
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-500/70">
          Overall Complete
        </span>
        <SysRef code="0013-OC" className="mt-1.5 text-cyan-600/50" />
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
        <div className="w-80 max-w-[90vw] font-mono">
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

function Sidebar({ activePage, onNavigate }: { activePage: PageKey; onNavigate: (p: PageKey) => void }) {
  return (
    <aside className="flex w-16 flex-col border-r border-cyan-400/30 bg-[#020813]/70 shadow-[0_0_25px_rgba(0,102,255,0.1)] backdrop-blur-xl md:w-60">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-cyan-400/30 px-2 md:justify-start md:px-5">
        <Bot className="h-7 w-7 text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]" />
        <div className="hidden md:block">
          <p className="font-mono text-sm font-bold tracking-[0.15em] text-cyan-300 [text-shadow:0_0_10px_rgba(0,240,255,0.6)]">J.A.R.V.I.S.</p>
          <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-600">ESTATES OS</p>
          <SysRef code="0001-CORE" className="mt-0.5 text-cyan-700/60" />
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
              className={`flex items-center justify-center gap-3 rounded-md border px-3 py-2.5 font-mono text-xs uppercase tracking-wider transition-all md:justify-start ${
                active
                  ? 'border-[#0066ff]/60 bg-[#0066ff]/10 text-cyan-200 shadow-[0_0_15px_rgba(0,102,255,0.4)]'
                  : 'border-transparent text-cyan-700 hover:border-cyan-500/20 hover:bg-cyan-500/5 hover:text-cyan-400'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-cyan-400/30 p-3">
        <div className="flex items-center justify-center gap-2 md:justify-start">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-emerald-400 md:inline">
            Online
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
  const [news, setNews] = useState<{ general: NewsItem[]; business: NewsItem[] }>({ general: [], business: [] });
  const [newsStatus, setNewsStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
        setNews({ general: data.general ?? [], business: data.business ?? [] });
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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Estates & Maintenance Overall" icon={Gauge} refCode="0012-A">
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

        <Panel title="Recently Added Tasks" icon={ListChecks} refCode="0027-T">
          <div className="flex flex-col gap-2">
            {recentTasks.length === 0 && (
              <p className="py-6 text-center font-mono text-xs text-cyan-700">No tasks logged yet.</p>
            )}
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="relative flex items-center justify-between gap-2 rounded-md border border-cyan-400/25 bg-[#020813]/40 shadow-[0_0_12px_rgba(0,102,255,0.08)] px-3 py-2.5"
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

        <Panel title="System Diagnostics" icon={Activity} refCode="0048-A">
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="font-mono text-3xl font-bold tabular-nums tracking-widest text-cyan-300 [text-shadow:0_0_12px_rgba(0,240,255,0.7)]">
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
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-300">System Status: Nominal</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NewsPanel
          title="BBC News Feed"
          icon={Newspaper}
          refCode="0091-N"
          items={news.general}
          status={newsStatus}
        />
        <NewsPanel
          title="Business & Economics"
          icon={Briefcase}
          refCode="0092-B"
          items={news.business}
          status={newsStatus}
        />
      </div>
    </div>
  );
}

function NewsPanel({
  title,
  icon,
  refCode,
  items,
  status,
}: {
  title: string;
  icon: typeof Gauge;
  refCode: string;
  items: NewsItem[];
  status: 'loading' | 'ready' | 'error';
}) {
  return (
    <Panel title={title} icon={icon} refCode={refCode}>
      <div className="flex items-center gap-1.5 pb-3">
        <Radio className="h-3 w-3 text-red-400" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-red-400">Live</span>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-10 text-cyan-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <p className="font-mono text-xs uppercase tracking-widest">Acquiring feed...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2 py-10 text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-center font-mono text-xs uppercase tracking-widest">Feed uplink unavailable</p>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className="py-10 text-center font-mono text-xs text-cyan-700">No headlines returned.</p>
      )}

      {status === 'ready' && items.length > 0 && (
        <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
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
      className="group relative flex gap-3 rounded-md border border-cyan-400/25 bg-[#020813]/40 p-2.5 shadow-[0_0_12px_rgba(0,102,255,0.08)] transition-colors hover:border-cyan-400/60 hover:bg-cyan-400/5"
    >
      <MicroCorners />
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-cyan-400/20 bg-[#01060f]">
        {showImage ? (
          <img
            src={item.image ?? ''}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImageOff className="h-5 w-5 text-cyan-700" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <p className="line-clamp-2 text-sm text-cyan-100 group-hover:text-cyan-50">{item.title}</p>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-600">
          {item.pubDate && <span>{formatRelativeTime(item.pubDate)}</span>}
          <ExternalLink className="h-3 w-3" />
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
  children,
}: {
  title: string;
  icon: typeof Gauge;
  refCode?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col border border-cyan-400/40 bg-[#020813]/50 p-4 shadow-[0_0_25px_rgba(0,102,255,0.12)] backdrop-blur-xl">
      <HudCorners />
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-cyan-400/25 pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-cyan-300 drop-shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300 [text-shadow:0_0_8px_rgba(0,240,255,0.5)]">
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            className="md:col-span-2 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          >
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          <button
            type="submit"
            className="md:col-span-5 flex items-center justify-center gap-2 rounded-md border border-[#0066ff]/60 bg-[#0066ff]/10 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-cyan-200 shadow-[0_0_15px_rgba(0,102,255,0.3)] transition-colors hover:bg-[#0066ff]/20"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </form>
      </Panel>

      <Panel title={`Active Tasks (${tasks.length})`} icon={ListChecks} refCode="0104-T">
        <div className="space-y-2">
          {tasks.length === 0 && (
            <p className="py-8 text-center font-mono text-xs text-cyan-700">No tasks in queue.</p>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="relative flex flex-col gap-3 rounded-md border border-cyan-400/25 bg-[#020813]/40 shadow-[0_0_12px_rgba(0,102,255,0.08)] p-3 md:flex-row md:items-center md:justify-between"
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
                  className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
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
            className="md:col-span-2 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <div className="flex flex-col gap-1">
            <label className="text-[9px] uppercase tracking-widest text-cyan-600">Last Completed</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] uppercase tracking-widest text-cyan-600">Next Due Date</label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
            />
          </div>
          <input
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Comments..."
            className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
          />
          <button
            type="submit"
            className="md:col-span-5 flex items-center justify-center gap-2 rounded-md border border-[#0066ff]/60 bg-[#0066ff]/10 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-cyan-200 shadow-[0_0_15px_rgba(0,102,255,0.3)] transition-colors hover:bg-[#0066ff]/20"
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
            <p className="py-8 text-center font-mono text-xs text-cyan-700">No compliance items logged.</p>
          )}
          {compliances.map((item) => (
            <div
              key={item.id}
              className="relative grid grid-cols-1 items-center gap-3 rounded-md border border-cyan-400/25 bg-[#020813]/40 shadow-[0_0_12px_rgba(0,102,255,0.08)] p-3 md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.3fr_auto]"
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
                  <CheckCircle2 className="h-6 w-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                ) : (
                  <Circle className="h-6 w-6 text-cyan-700" />
                )}
              </button>

              <p className={`text-sm ${item.completed ? 'text-emerald-200' : 'text-cyan-100'}`}>{item.name}</p>

              <input
                type="date"
                value={item.date}
                onChange={(e) => onChangeDate(item.id, e.target.value)}
                className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-2 py-1.5 text-xs text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
              />

              <input
                type="date"
                value={item.nextDueDate}
                onChange={(e) => onChangeNextDueDate(item.id, e.target.value)}
                className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-2 py-1.5 text-xs text-cyan-100 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
              />

              <input
                value={item.comments}
                onChange={(e) => onChangeComments(item.id, e.target.value)}
                placeholder="Comments..."
                className="rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-2 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
              />

              <button
                onClick={() => onDelete(item.id)}
                className="flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: genId(),
      sender: 'jarvis',
      text: 'Welcome back, sir. Systems are online. How can I assist you with the estate today?',
    },
  ]);
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
        <div className="relative mb-3 flex h-96 w-80 flex-col overflow-hidden border border-cyan-400/40 bg-[#020813]/70 shadow-[0_0_30px_rgba(0,102,255,0.25)] backdrop-blur-xl">
          <HudCorners />
          <div className="flex items-center justify-between border-b border-cyan-400/25 bg-cyan-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-400/10">
                <Bot className="h-4 w-4 text-cyan-300" />
                <ConcentricPulse />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold tracking-widest text-cyan-300 [text-shadow:0_0_8px_rgba(0,240,255,0.5)]">J.A.R.V.I.S.</p>
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
                    ? 'border border-cyan-400/35 bg-cyan-500/10 text-cyan-100 shadow-[0_0_10px_rgba(0,240,255,0.12)]'
                    : 'ml-auto border border-[#0066ff]/40 bg-[#0066ff]/10 text-right text-cyan-50 shadow-[0_0_10px_rgba(0,102,255,0.18)]'
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
              className="flex-1 rounded-md border border-cyan-400/30 bg-[#020813]/60 focus:shadow-[0_0_10px_rgba(0,102,255,0.35)] px-3 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-[#0066ff]/50"
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
        className="relative flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/50 bg-[#020813]/90 shadow-[0_0_20px_rgba(0,102,255,0.4)] backdrop-blur-xl transition-transform hover:scale-105"
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
  const [booted, setBooted] = useState(false);
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [compliances, setCompliances] = useState<ComplianceItem[]>(SEED_COMPLIANCES);

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

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#020813] font-mono text-cyan-100">
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
          <Sidebar activePage={activePage} onNavigate={setActivePage} />
          <main className="flex-1 overflow-y-auto p-5">
            {activePage === 'dashboard' && <Dashboard tasks={tasks} compliances={compliances} />}
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

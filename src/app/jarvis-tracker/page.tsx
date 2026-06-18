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
  comments: string;
}

interface ChatMessage {
  id: string;
  sender: 'jarvis' | 'user';
  text: string;
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
  { id: 'c1', name: 'Fire Risk Assessment (FRA)', completed: true, date: '2026-04-12', comments: 'Annual review complete, no actions outstanding.' },
  { id: 'c2', name: 'Legionella Risk Assessment', completed: false, date: '', comments: '' },
  { id: 'c3', name: 'Gas Safety Certification (CP12)', completed: true, date: '2026-02-03', comments: 'Engineer signed off, certificate filed.' },
  { id: 'c4', name: 'Fixed Wire Testing (EICR)', completed: false, date: '', comments: 'Booked in for next quarter.' },
  { id: 'c5', name: 'Emergency Lighting Testing', completed: true, date: '2026-05-30', comments: 'Monthly function test passed.' },
  { id: 'c6', name: 'Lift Inspections (LOLER)', completed: false, date: '', comments: '' },
];

const BOOT_STEPS = [
  'INITIALIZING CORE...',
  'CALIBRATING SENSOR ARRAY...',
  'ESTABLISHING ESTATE UPLINK...',
  'LOADING COMPLIANCE DATABASE...',
  'SYSTEMS NOMINAL.',
];

const NEWS_HEADLINES = [
  'BBC NEWS // Global markets steady as energy prices ease across Europe',
  'BBC NEWS // Met Office issues amber wind warning for the weekend',
  'BBC NEWS // Council approves new funding for coastal flood defences',
  'BBC NEWS // Tech sector reports strong quarterly growth amid AI investment surge',
  'BBC NEWS // Transport authority announces signalling upgrades on the underground',
  'BBC NEWS // Health officials issue updated guidance on seasonal flu vaccination',
  'BBC NEWS // Housing report shows uptick in regional construction activity',
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

// ---------------------------------------------------------------------------
// Circular progress chart
// ---------------------------------------------------------------------------

function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex h-56 w-56 items-center justify-center">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="jarvisProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#00d2ff" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(0,240,255,0.08)" strokeWidth="14" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#jarvisProgressGradient)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.7s ease',
            filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.85))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tracking-tight text-cyan-300 [text-shadow:0_0_15px_rgba(0,240,255,0.8)]">
          {percentage}%
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-500/70">
          Overall Complete
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
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,240,255,0.08),transparent_70%)]" />

      {stage === 'idle' && (
        <button
          onClick={() => setStage('booting')}
          className="group relative flex h-40 w-40 items-center justify-center rounded-full border-2 border-cyan-400/60 bg-cyan-500/5 transition-transform duration-300 hover:scale-105"
        >
          <span className="absolute inset-0 rounded-full border border-cyan-400/40 animate-ping" />
          <span className="absolute -inset-3 rounded-full border border-cyan-400/20 animate-pulse" />
          <Power className="h-14 w-14 text-cyan-300 drop-shadow-[0_0_12px_rgba(0,240,255,0.9)] transition-colors group-hover:text-white" />
        </button>
      )}

      {stage === 'idle' && (
        <p className="mt-8 font-mono text-sm uppercase tracking-[0.3em] text-cyan-400/80">
          Tap to activate J.A.R.V.I.S. core
        </p>
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
              className="h-full rounded-full bg-gradient-to-r from-[#00d2ff] to-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.8)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
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
    <aside className="flex w-16 flex-col border-r border-cyan-500/20 bg-black/60 backdrop-blur-md md:w-60">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-cyan-500/20 px-2 md:justify-start md:px-5">
        <Bot className="h-7 w-7 text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]" />
        <div className="hidden md:block">
          <p className="font-mono text-sm font-bold tracking-[0.15em] text-cyan-300">J.A.R.V.I.S.</p>
          <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-600">ESTATES OS</p>
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
                  ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
                  : 'border-transparent text-cyan-700 hover:border-cyan-500/20 hover:bg-cyan-500/5 hover:text-cyan-400'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-cyan-500/20 p-3">
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
        <Panel title="Estates & Maintenance Overall" icon={Gauge}>
          <div className="flex flex-1 items-center justify-center py-2">
            <CircularProgress percentage={completionPct} />
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-cyan-500/15 pt-4 text-center">
            <div>
              <p className="text-xl font-bold text-emerald-300">{completedItems}</p>
              <p className="text-[10px] uppercase tracking-widest text-cyan-600">Completed</p>
            </div>
            <div>
              <p className="text-xl font-bold text-cyan-200">{totalItems - completedItems}</p>
              <p className="text-[10px] uppercase tracking-widest text-cyan-600">Outstanding</p>
            </div>
          </div>
        </Panel>

        <Panel title="Recently Added Tasks" icon={ListChecks}>
          <div className="flex flex-col gap-2">
            {recentTasks.length === 0 && (
              <p className="py-6 text-center font-mono text-xs text-cyan-700">No tasks logged yet.</p>
            )}
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-md border border-cyan-500/15 bg-cyan-500/5 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-cyan-100">{task.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-cyan-600">Due {task.dueDate || '—'}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[task.status]}`}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="System Diagnostics" icon={Activity}>
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="font-mono text-3xl font-bold tracking-widest text-cyan-300 [text-shadow:0_0_12px_rgba(0,240,255,0.7)]">
                {now.toLocaleTimeString('en-GB')}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-cyan-600">
                {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <LoadBar icon={Cpu} label="CPU Load" value={load.cpu} />
            <LoadBar icon={Server} label="Server Load" value={load.mem} />
            <LoadBar icon={Wifi} label="Network I/O" value={load.net} />

            <div className="flex items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-300">System Status: Nominal</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="BBC News Feed" icon={Newspaper}>
        <div className="relative flex items-center overflow-hidden rounded-md border border-cyan-500/15 bg-black/40 py-3">
          <span className="absolute left-0 z-10 flex h-full items-center bg-gradient-to-r from-black via-black to-transparent px-3">
            <Radio className="h-4 w-4 text-red-400" />
          </span>
          <div className="flex w-max animate-marquee whitespace-nowrap pl-12">
            {[...NEWS_HEADLINES, ...NEWS_HEADLINES].map((headline, i) => (
              <span key={i} className="mx-6 text-sm text-cyan-200">
                {headline}
              </span>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function LoadBar({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: number }) {
  const color = value > 80 ? 'from-red-500 to-orange-400' : value > 55 ? 'from-amber-400 to-cyan-300' : 'from-[#00d2ff] to-[#00f0ff]';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cyan-500">
          <Icon className="h-3 w-3" /> {label}
        </span>
        <span className="font-mono text-xs text-cyan-300">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/60">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} shadow-[0_0_8px_rgba(0,240,255,0.6)] transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Gauge; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-cyan-500/20 bg-gradient-to-b from-cyan-500/[0.04] to-transparent p-4 shadow-[0_0_20px_rgba(0,240,255,0.06)]">
      <div className="mb-4 flex items-center gap-2 border-b border-cyan-500/15 pb-3">
        <Icon className="h-4 w-4 text-cyan-400" />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{title}</h2>
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
    setName('');
    setPriority('Medium');
    setDueDate('');
    setStatus('Not Started');
  };

  return (
    <div className="space-y-5">
      <Panel title="Deploy New Task" icon={Plus}>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            className="md:col-span-2 rounded-md border border-cyan-500/30 bg-black/40 px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-md border border-cyan-500/30 bg-black/40 px-3 py-2 text-sm text-cyan-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-md border border-cyan-500/30 bg-black/40 px-3 py-2 text-sm text-cyan-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="rounded-md border border-cyan-500/30 bg-black/40 px-3 py-2 text-sm text-cyan-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          >
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          <button
            type="submit"
            className="md:col-span-5 flex items-center justify-center gap-2 rounded-md border border-cyan-400/50 bg-cyan-400/10 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)] transition-colors hover:bg-cyan-400/20"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </form>
      </Panel>

      <Panel title={`Active Tasks (${tasks.length})`} icon={ListChecks}>
        <div className="space-y-2">
          {tasks.length === 0 && (
            <p className="py-8 text-center font-mono text-xs text-cyan-700">No tasks in queue.</p>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-3 rounded-md border border-cyan-500/15 bg-cyan-500/5 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-cyan-100">{task.name}</p>
                <p className="text-[10px] uppercase tracking-widest text-cyan-600">Due {task.dueDate || '—'}</p>
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
  onToggle,
  onChangeDate,
  onChangeComments,
}: {
  compliances: ComplianceItem[];
  onToggle: (id: string) => void;
  onChangeDate: (id: string, date: string) => void;
  onChangeComments: (id: string, comments: string) => void;
}) {
  return (
    <Panel title="Estate Compliance Tracker" icon={ShieldCheck}>
      <div className="space-y-2">
        {compliances.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-1 items-center gap-3 rounded-md border border-cyan-500/15 bg-cyan-500/5 p-3 md:grid-cols-[auto_1.4fr_0.8fr_1.6fr]"
          >
            <button
              onClick={() => onToggle(item.id)}
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
              className="rounded-md border border-cyan-500/30 bg-black/40 px-2 py-1.5 text-xs text-cyan-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            />

            <input
              value={item.comments}
              onChange={(e) => onChangeComments(item.id, e.target.value)}
              placeholder="Comments..."
              className="rounded-md border border-cyan-500/30 bg-black/40 px-2 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <p className="text-xs text-amber-300/90">
          {compliances.filter((c) => !c.completed).length} compliance item(s) outstanding.
        </p>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// JARVIS Chatbox
// ---------------------------------------------------------------------------

function JarvisChatbox({ completionPct, outstandingTasks }: { completionPct: number; outstandingTasks: number }) {
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
    setTimeout(() => {
      setMessages((prev) => [...prev, { id: genId(), sender: 'jarvis', text: reply(text) }]);
    }, 700);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-3 flex h-96 w-80 flex-col overflow-hidden rounded-lg border border-cyan-400/30 bg-black/90 shadow-[0_0_30px_rgba(0,240,255,0.25)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-400/10">
                <Bot className="h-4 w-4 text-cyan-300" />
                <span className="absolute -inset-0.5 rounded-full border border-cyan-400/40 animate-pulse" />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold tracking-widest text-cyan-300">J.A.R.V.I.S.</p>
                <p className="text-[9px] uppercase tracking-widest text-emerald-400">Online</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-cyan-500 hover:text-cyan-300">
              <Minus className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
                  m.sender === 'jarvis'
                    ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
                    : 'ml-auto border border-cyan-300/20 bg-white/5 text-right text-cyan-50'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-cyan-500/20 p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Message J.A.R.V.I.S..."
              className="flex-1 rounded-md border border-cyan-500/30 bg-black/40 px-3 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-700 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
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
        className="relative flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/50 bg-black/90 shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-transform hover:scale-105"
      >
        <span className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping" />
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

  const handleToggleCompliance = (id: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c)));
  const handleChangeDate = (id: string, date: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, date } : c)));
  const handleChangeComments = (id: string, comments: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, comments } : c)));

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden bg-black font-mono text-cyan-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

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
                onToggle={handleToggleCompliance}
                onChangeDate={handleChangeDate}
                onChangeComments={handleChangeComments}
              />
            )}
          </main>
          <JarvisChatbox completionPct={completionPct} outstandingTasks={totalItems - completedItems} />
        </div>
      )}
    </div>
  );
}

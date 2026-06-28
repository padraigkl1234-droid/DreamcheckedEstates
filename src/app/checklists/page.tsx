'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { useSound } from '@/components/SoundProvider';

// ---------------------------------------------------------------------------
// Checklist data — Mobaro-style team / set-up checklists.
// Starter templates mirroring the show-day checks; refine to match the live
// Mobaro / Microsoft Forms versions.
// ---------------------------------------------------------------------------

interface ChecklistSection {
  title: string;
  items: { label: string; guidance?: string }[];
}
interface Checklist {
  id: string;
  area: string;
  title: string;
  description: string;
  externalUrl?: string;
  sections: ChecklistSection[];
}

const CHECKLISTS: Checklist[] = [
  {
    id: 'scenic-show-open',
    area: 'Scenic Stage',
    title: 'Show Open — Pre-Show',
    description: 'Pre-show safety and readiness walk-round before doors open on the Scenic Stage.',
    externalUrl:
      'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQzM1SVVONkROVFEzM0VYU1VYMDZJMjlBUi4u',
    sections: [
      {
        title: 'Access & Egress',
        items: [
          { label: 'All fire exits and gates clear and unlocked' },
          { label: 'Emergency exit signage lit and visible' },
          { label: 'Pedestrian routes free of trip hazards' },
          { label: 'Entry / scan points staffed and briefed' },
        ],
      },
      {
        title: 'Barriers & Crowd Safety',
        items: [
          { label: 'Front-of-stage barrier secure, pinned and continuous', guidance: 'No gaps a person could slip under or through.' },
          { label: 'Pit access gates operational' },
          { label: 'Crowd barriers aligned and footplates clear' },
          { label: 'Accessible / raised viewing platform set and signed' },
        ],
      },
      {
        title: 'Stage, Structure & Weather',
        items: [
          { label: 'Stage deck clear, dry and edges marked' },
          { label: 'PA wings / delay towers inspected and ballasted' },
          { label: 'Rigging and weights checked — no loose fixings' },
          { label: 'Wind / weather reading taken and within operating limits', guidance: 'Record reading; escalate to event control if near limit.' },
        ],
      },
      {
        title: 'Power & Electrical',
        items: [
          { label: 'Distro boards locked and RCDs tested' },
          { label: 'Cables matted, ramped or flown — none trailing' },
          { label: 'Generators fuelled, earthed and guarded' },
        ],
      },
      {
        title: 'Fire & Emergency',
        items: [
          { label: 'Extinguishers in position and in date' },
          { label: 'First aid point set up and staffed' },
          { label: 'Emergency lighting tested' },
          { label: 'Show-stop / evacuation procedure briefed to team' },
        ],
      },
      {
        title: 'Sound, Lighting & Comms',
        items: [
          { label: 'Soundcheck completed within agreed noise limits' },
          { label: 'Lighting rig functional — no exposed lamps' },
          { label: 'Radios / comms tested with event control' },
        ],
      },
      {
        title: 'Welfare',
        items: [
          { label: 'Toilets clean, stocked and accessible' },
          { label: 'Water points available' },
        ],
      },
      {
        title: 'Sign-off',
        items: [
          { label: 'Duty manager walk-round complete' },
          { label: 'Defects logged and actioned or accepted' },
          { label: 'Authorised to open doors' },
        ],
      },
    ],
  },
  {
    id: 'scenic-show-close',
    area: 'Scenic Stage',
    title: 'Show Close — Post-Show',
    description: 'Post-show make-safe, housekeeping and handover after the Scenic Stage show ends.',
    externalUrl:
      'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUM0RMMUhPNTdKT0I4Mk1BSFpDOEhKSUtHWC4u',
    sections: [
      {
        title: 'Crowd & Egress',
        items: [
          { label: 'Audience cleared from arena safely' },
          { label: 'Exit routes managed and clear' },
          { label: 'Lost property collected and logged' },
        ],
      },
      {
        title: 'Power Down',
        items: [
          { label: 'Stage power isolated' },
          { label: 'Distro boards locked off' },
          { label: 'Generators shut down and made safe' },
        ],
      },
      {
        title: 'Stage & Equipment',
        items: [
          { label: 'PA and lighting powered down / made safe' },
          { label: 'Loose equipment, cables and tools secured or stored' },
          { label: 'Barriers checked for damage and reported' },
        ],
      },
      {
        title: 'Fire & Safety',
        items: [
          { label: 'Extinguishers accounted for' },
          { label: 'No ignition sources or heaters left on' },
          { label: 'Pyro / effects (if used) made safe and logged' },
        ],
      },
      {
        title: 'Housekeeping',
        items: [
          { label: 'Litter pick of arena completed' },
          { label: 'Spills and hazards cleared' },
          { label: 'Toilets checked and locked' },
        ],
      },
      {
        title: 'Security & Handover',
        items: [
          { label: 'Containers and stores locked' },
          { label: 'Cash, valuables and equipment removed / secured' },
          { label: 'Gates secured' },
          { label: 'Final walk-round complete — site handed to security' },
        ],
      },
      {
        title: 'Sign-off',
        items: [
          { label: 'Incidents / defects logged' },
          { label: 'Handover notes recorded' },
        ],
      },
    ],
  },
];

const STORAGE_KEY = 'invictus:checklists:v1';

interface ChecklistState {
  checked: Record<string, boolean>;
  flagged: Record<string, boolean>;
  notes: Record<string, string>;
  completedAt?: number;
}
type AllState = Record<string, ChecklistState>;

const emptyState = (): ChecklistState => ({ checked: {}, flagged: {}, notes: {} });

function itemId(checklistId: string, si: number, ii: number): string {
  return `${checklistId}:${si}:${ii}`;
}
function totalItems(cl: Checklist): number {
  return cl.sections.reduce((sum, s) => sum + s.items.length, 0);
}

// Small HUD corner accents to echo the INVICTUS panels.
function Corners() {
  const base = 'pointer-events-none absolute h-2.5 w-2.5 border-invictus-crimson-bright/40';
  return (
    <>
      <span className={`${base} left-0 top-0 border-l border-t`} />
      <span className={`${base} right-0 top-0 border-r border-t`} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} />
      <span className={`${base} bottom-0 right-0 border-b border-r`} />
    </>
  );
}

export default function ChecklistsPage() {
  const [state, setState] = useState<AllState>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const { playConfirm } = useSound();

  // Load saved progress (device-local) after mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as AllState);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [state]);

  const activeChecklist = CHECKLISTS.find((c) => c.id === activeId) ?? null;

  const areas = useMemo(() => {
    const map = new Map<string, Checklist[]>();
    for (const cl of CHECKLISTS) {
      const list = map.get(cl.area);
      if (list) list.push(cl);
      else map.set(cl.area, [cl]);
    }
    return [...map.entries()];
  }, []);

  const doneCount = (cl: Checklist): number => {
    const cur = state[cl.id];
    if (!cur) return 0;
    return Object.values(cur.checked).filter(Boolean).length;
  };

  const update = (clId: string, fn: (s: ChecklistState) => ChecklistState) => {
    setState((prev) => ({ ...prev, [clId]: fn(prev[clId] ?? emptyState()) }));
  };

  const toggleCheck = (clId: string, id: string) => {
    update(clId, (s) => {
      const next = !s.checked[id];
      if (next) playConfirm();
      return { ...s, checked: { ...s.checked, [id]: next } };
    });
  };
  const toggleFlag = (clId: string, id: string) => {
    update(clId, (s) => ({ ...s, flagged: { ...s.flagged, [id]: !s.flagged[id] } }));
  };
  const setNote = (clId: string, id: string, note: string) => {
    update(clId, (s) => ({ ...s, notes: { ...s.notes, [id]: note } }));
  };
  const resetChecklist = (clId: string) => setState((prev) => ({ ...prev, [clId]: emptyState() }));
  const toggleComplete = (clId: string) => {
    update(clId, (s) => ({ ...s, completedAt: s.completedAt ? undefined : Date.now() }));
    playConfirm();
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 z-0 animate-scanlines opacity-[0.06] mix-blend-screen"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 8px)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <ClipboardCheck className="h-8 w-8 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
              Checklists
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              Team &amp; set-up checks · Mobaro-style
            </p>
          </div>
        </div>

        {!activeChecklist ? (
          <ChecklistIndex areas={areas} doneCount={doneCount} state={state} onOpen={setActiveId} />
        ) : (
          <ChecklistRunner
            checklist={activeChecklist}
            cur={state[activeChecklist.id] ?? emptyState()}
            onBack={() => setActiveId(null)}
            onToggleCheck={(id) => toggleCheck(activeChecklist.id, id)}
            onToggleFlag={(id) => toggleFlag(activeChecklist.id, id)}
            onSetNote={(id, note) => setNote(activeChecklist.id, id, note)}
            onReset={() => resetChecklist(activeChecklist.id)}
            onToggleComplete={() => toggleComplete(activeChecklist.id)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Index — grouped checklist cards
// ---------------------------------------------------------------------------

function ChecklistIndex({
  areas,
  doneCount,
  state,
  onOpen,
}: {
  areas: [string, Checklist[]][];
  doneCount: (cl: Checklist) => number;
  state: AllState;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-8">
      {areas.map(([area, lists]) => (
        <section key={area} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-100">
              {area}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">{lists.length}</span>
            <span className="h-px flex-1 bg-neutral-400/10" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {lists.map((cl) => {
              const total = totalItems(cl);
              const done = doneCount(cl);
              const pct = total === 0 ? 0 : Math.round((done / total) * 100);
              const completed = Boolean(state[cl.id]?.completedAt);
              return (
                <div
                  key={cl.id}
                  className="relative flex flex-col gap-3 border border-neutral-400/25 bg-invictus-surface/60 p-5 shadow-glow-subtle backdrop-blur-sm"
                >
                  <Corners />
                  <button onClick={() => onOpen(cl.id)} className="flex flex-col gap-2 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-sm uppercase tracking-[0.12em] text-neutral-100">{cl.title}</h3>
                      {completed && (
                        <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-neutral-400">{cl.description}</p>
                  </button>

                  {/* Progress */}
                  <div className="mt-1">
                    <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
                      <span>{done}/{total} checks</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-700/40">
                      <div
                        className="h-full rounded-full bg-invictus-crimson-bright shadow-glow-strong transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                    <button
                      onClick={() => onOpen(cl.id)}
                      className="flex items-center gap-1 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
                    >
                      {done > 0 ? 'Resume' : 'Start'} <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    {cl.externalUrl && (
                      <a
                        href={cl.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
                      >
                        Forms <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="pt-2 text-center text-[10px] uppercase tracking-widest text-neutral-700">
        Progress is saved on this device · Starter templates — refine to match your Mobaro forms
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Runner — a single checklist in progress
// ---------------------------------------------------------------------------

function ChecklistRunner({
  checklist,
  cur,
  onBack,
  onToggleCheck,
  onToggleFlag,
  onSetNote,
  onReset,
  onToggleComplete,
}: {
  checklist: Checklist;
  cur: ChecklistState;
  onBack: () => void;
  onToggleCheck: (id: string) => void;
  onToggleFlag: (id: string) => void;
  onSetNote: (id: string, note: string) => void;
  onReset: () => void;
  onToggleComplete: () => void;
}) {
  const total = totalItems(checklist);
  const done = Object.values(cur.checked).filter(Boolean).length;
  const flagged = Object.values(cur.flagged).filter(Boolean).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const completed = Boolean(cur.completedAt);

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-neutral-400 transition-colors hover:text-invictus-crimson-bright"
      >
        <ChevronLeft className="h-4 w-4" /> All checklists
      </button>

      {/* Header panel */}
      <div className="relative border border-neutral-400/30 bg-invictus-surface/60 p-5 shadow-glow-subtle backdrop-blur-sm">
        <Corners />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-neutral-100">
              {checklist.area}
            </span>
            <h2 className="mt-2 font-display text-lg uppercase tracking-[0.14em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
              {checklist.title}
            </h2>
            <p className="mt-1 max-w-xl text-xs text-neutral-400">{checklist.description}</p>
          </div>
          {checklist.externalUrl && (
            <a
              href={checklist.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
            >
              Original form <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
            <span>
              {done}/{total} complete{flagged > 0 && <span className="ml-2 text-amber-400/90">· {flagged} flagged</span>}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-700/40">
            <div className="h-full rounded-full bg-invictus-crimson-bright shadow-glow-strong transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Sections */}
      {checklist.sections.map((section, si) => (
        <div key={si} className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-300">{section.title}</span>
            <span className="h-px flex-1 bg-neutral-400/10" />
          </div>
          {section.items.map((item, ii) => {
            const id = itemId(checklist.id, si, ii);
            const isChecked = Boolean(cur.checked[id]);
            const isFlagged = Boolean(cur.flagged[id]);
            return (
              <div
                key={id}
                className={`relative flex items-start gap-3 rounded-md border p-3 transition-colors ${
                  isFlagged
                    ? 'border-amber-400/40 bg-amber-400/[0.06]'
                    : isChecked
                    ? 'border-emerald-400/25 bg-emerald-400/[0.04]'
                    : 'border-neutral-400/20 bg-invictus-base/40'
                }`}
              >
                <button
                  onClick={() => onToggleCheck(id)}
                  className="mt-0.5 flex shrink-0 items-center justify-center"
                  title={isChecked ? 'Mark not done' : 'Mark done'}
                >
                  {isChecked ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]" />
                  ) : (
                    <Circle className="h-5 w-5 text-neutral-600" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${isChecked ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>{item.label}</p>
                  {item.guidance && <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{item.guidance}</p>}
                  {isFlagged && (
                    <input
                      value={cur.notes[id] ?? ''}
                      onChange={(e) => onSetNote(id, e.target.value)}
                      placeholder="Describe the issue…"
                      className="mt-2 w-full rounded-md border border-amber-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                    />
                  )}
                </div>

                <button
                  onClick={() => onToggleFlag(id)}
                  className={`mt-0.5 flex shrink-0 items-center justify-center rounded-md border p-1.5 transition-all ${
                    isFlagged
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                      : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-500 hover:border-amber-400/40 hover:text-amber-300'
                  }`}
                  title={isFlagged ? 'Clear flag' : 'Flag an issue'}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-400/15 pt-4">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:border-alert/40 hover:text-alert"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <div className="flex items-center gap-3">
          {completed && cur.completedAt && (
            <span className="text-[10px] uppercase tracking-widest text-emerald-300/80">
              Completed {new Date(cur.completedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={onToggleComplete}
            className={`flex items-center gap-2 rounded-md border px-4 py-2 text-[11px] font-semibold uppercase tracking-widest transition-all ${
              completed
                ? 'border-neutral-400/30 bg-invictus-base/60 text-neutral-300 hover:text-neutral-100'
                : 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100 shadow-glow-subtle hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong'
            }`}
          >
            {completed ? 'Reopen' : 'Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

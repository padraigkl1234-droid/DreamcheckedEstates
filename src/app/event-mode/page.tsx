'use client';

// Event Mode — the "is tonight live" dashboard. It hosts the same
// green/red readiness lights as the Show Board (reading and writing the
// shared `shows` collection live), plus standing procedures and a live
// train-departures feed, and switches to a dark/blue theme whenever a show
// is on the board for today. When nothing's scheduled today it stays calm.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Radio, Clapperboard, ExternalLink, TrainFront, BookOpen, AlertTriangle, CalendarClock } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { CHECKLIST_SECTIONS, type ChecklistSection } from '@/lib/checklists';
import { DREAMLAND_TEAM_ID, featureEnabled } from '@/lib/teams';
import { showReadiness, todayStr, type Show } from '@/lib/shows';
import { EVENT_PROCEDURES } from '@/lib/eventProcedures';

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

interface TrainService {
  std: string;
  etd: string;
  operator: string;
  destination: string;
  platform: string | null;
}
interface TrainsResponse {
  configured: boolean;
  error?: string;
  locationName?: string;
  nrccMessages?: string[];
  trains?: TrainService[];
}

function TrainsWidget() {
  const [data, setData] = useState<TrainsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/trains')
        .then((r) => r.json())
        .then((d: TrainsResponse) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setData({ configured: true, error: 'Failed to fetch train departures' });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="rounded-xl border border-neutral-400/20 bg-invictus-surface/60 p-5">
      <div className="mb-3 flex items-center gap-2">
        <TrainFront className="h-4 w-4 text-invictus-crimson-bright" />
        <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Trains into Margate</h3>
      </div>
      {loading && <p className="py-4 text-center text-xs text-neutral-600">Loading live departures…</p>}
      {!loading && data && !data.configured && (
        <p className="py-4 text-center text-xs text-neutral-600">
          Live train departures aren&apos;t set up yet — add a free National Rail Darwin token as{' '}
          <code className="text-neutral-500">NATIONAL_RAIL_LDBWS_TOKEN</code> to enable this.
        </p>
      )}
      {!loading && data?.configured && data.error && <p className="py-4 text-center text-xs text-alert">{data.error}</p>}
      {!loading && data?.configured && !data.error && (
        <>
          {data.nrccMessages && data.nrccMessages.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {data.nrccMessages.map((m, i) => (
                <p
                  key={i}
                  className="flex items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] text-amber-300"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span>{m}</span>
                </p>
              ))}
            </div>
          )}
          {(!data.trains || data.trains.length === 0) && (
            <p className="py-4 text-center text-xs text-neutral-600">No departures found for Margate.</p>
          )}
          <div className="space-y-1.5">
            {data.trains?.map((t, i) => {
              const disrupted = t.etd.toLowerCase() !== 'on time';
              return (
                <div
                  key={i}
                  className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs ${
                    disrupted ? 'border-alert/30 bg-alert/[0.06]' : 'border-neutral-400/15 bg-invictus-base/40'
                  }`}
                >
                  <span className="text-neutral-300">
                    {t.std} → {t.destination}
                  </span>
                  <span className="text-neutral-500">
                    {t.operator}
                    {t.platform ? ` · Plat ${t.platform}` : ''}
                  </span>
                  <span className={disrupted ? 'font-semibold text-alert' : 'text-emerald-400'}>{t.etd}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function EventModePage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const isDreamland = teamId === DREAMLAND_TEAM_ID;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'eventMode');

  const [shows, setShows] = useState<Show[]>([]);
  const [teamChecklistForms, setTeamChecklistForms] = useState<
    { section: string; name: string; description?: string; url: string }[]
  >([]);

  // Same shared, live, team-scoped `shows` collection the Show Board reads
  // and writes — lights here and on the Show Board reflect the same data.
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

  useEffect(() => {
    if (!user || !teamId) {
      setTeamChecklistForms([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'checklistForms'), where('teamId', '==', teamId)),
      (snap) =>
        setTeamChecklistForms(
          snap.docs.map((d) => d.data() as { section: string; name: string; description?: string; url: string })
        ),
      (error) => console.error('Team checklists subscription failed:', error)
    );
    return unsub;
  }, [user, teamId]);

  const sections = useMemo<ChecklistSection[]>(() => {
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

  const today = todayStr();
  const todaysShows = useMemo(
    () => shows.filter((s) => s.date === today).sort((a, b) => a.type.localeCompare(b.type)),
    [shows, today]
  );
  const upcoming = useMemo(
    () => shows.filter((s) => s.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))[0],
    [shows, today]
  );
  const isLive = todaysShows.length > 0;
  // Once every show on the board today has all its checklists green, the
  // page's whole ambient wash shifts from blue to green — three states, not
  // a flag: nothing scheduled, live but still outstanding, and fully ready.
  const allReady = isLive && todaysShows.every((s) => showReadiness(s, sections).ready);
  const mode: 'standby' | 'live' | 'ready' = !isLive ? 'standby' : allReady ? 'ready' : 'live';

  // Accent classes for the "live" chrome (show panels, hover states, the
  // tonight callout) follow the same standby→blue→green progression as the
  // background wash, so the whole page reads as one consistent state.
  const panelBorder = mode === 'ready' ? 'border-emerald-400/25' : 'border-blue-400/25';
  const panelHeaderBorder = mode === 'ready' ? 'border-emerald-400/15' : 'border-blue-400/15';
  const panelHeaderBg = mode === 'ready' ? 'bg-emerald-400/[0.04]' : 'bg-blue-400/[0.04]';
  const panelIconColor = mode === 'ready' ? 'text-emerald-300' : 'text-blue-300';
  const formHoverClasses =
    mode === 'ready' ? 'hover:border-emerald-400/40 hover:text-emerald-300' : 'hover:border-blue-400/40 hover:text-blue-300';
  const tonightBoxClasses =
    mode === 'ready' ? 'border-emerald-400/25 bg-emerald-400/[0.05] text-emerald-200' : 'border-blue-400/25 bg-blue-400/[0.05] text-blue-200';

  const handleToggleChecklist = (showId: string, checklistName: string) => {
    if (!user) return;
    const current = shows.find((s) => s.id === showId)?.completed[checklistName] ?? false;
    updateDoc(doc(db, 'shows', showId), { [`completed.${checklistName}`]: !current }).catch((e) =>
      console.error('Failed to update show checklist:', e)
    );
  };

  const chrome = (body: React.ReactNode) => (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex-1 overflow-hidden font-sans text-neutral-100">
        {/* Ambient wash — layered, cross-fading gradients rather than a hard
            colour swap, so the page shifts blue → green the way light does,
            not a flat repaint. Sits behind the independently-scrolling
            content below so it never scrolls away. */}
        <div className="pointer-events-none absolute inset-0 bg-invictus-base" />
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-950 via-blue-950/30 to-invictus-base transition-opacity duration-[1800ms] ease-in-out ${
            mode === 'live' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-950 via-emerald-900/25 to-invictus-base transition-opacity duration-[1800ms] ease-in-out ${
            mode === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full blur-3xl transition-colors duration-[1800ms] ease-in-out ${
            mode === 'ready' ? 'bg-emerald-500/10' : mode === 'live' ? 'bg-blue-500/10' : 'bg-neutral-500/10'
          }`}
        />
        <div
          className={`pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full blur-3xl transition-colors duration-[1800ms] ease-in-out ${
            mode === 'ready' ? 'bg-emerald-500/10' : mode === 'live' ? 'bg-blue-500/10' : 'bg-neutral-500/10'
          }`}
        />
        <div className="relative h-full overflow-y-auto">{body}</div>
      </main>
    </div>
  );

  if (!profileLoading && !pageEnabled) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Event Mode isn&apos;t enabled for your team.</p>
      </div>
    );
  }

  if (!user) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Sign in to view Event Mode.</p>
      </div>
    );
  }

  return chrome(
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-100 sm:text-3xl">
            <Radio
              className={`h-6 w-6 transition-colors duration-700 ${
                mode === 'ready' ? 'text-emerald-400' : mode === 'live' ? 'text-blue-400' : 'text-invictus-crimson-bright'
              }`}
            />
            Event Mode
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {mode === 'ready'
              ? `All clear — ${todaysShows.length} show${todaysShows.length > 1 ? 's' : ''} ready to go.`
              : mode === 'live'
              ? `Live — ${todaysShows.length} show${todaysShows.length > 1 ? 's' : ''} on the board today.`
              : 'Standby — no event on the Show Board today.'}
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors duration-700 ${
            mode === 'ready'
              ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
              : mode === 'live'
              ? 'border-blue-400/50 bg-blue-400/10 text-blue-300'
              : 'border-neutral-400/30 bg-invictus-base/60 text-neutral-500'
          }`}
        >
          <StatusLight on={isLive} /> {mode === 'ready' ? 'Show Ready' : mode === 'live' ? 'Event Live' : 'Standby'}
        </span>
      </div>

      {!isLive && (
        <div className="mb-6 rounded-xl border border-neutral-400/20 bg-invictus-surface/60 p-6 text-center">
          <p className="text-sm text-neutral-400">Nothing scheduled on the Show Board for today.</p>
          {upcoming && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-neutral-600">
              <CalendarClock className="h-3.5 w-3.5" /> Next up: {upcoming.type}
              {upcoming.title ? ` — ${upcoming.title}` : ''} on {upcoming.date}
            </p>
          )}
        </div>
      )}

      {isLive && (
        <div className="mb-6 space-y-5">
          {todaysShows.map((show) => {
            const { forms, done, total, ready } = showReadiness(show, sections);
            return (
              <div
                key={show.id}
                className={`overflow-hidden rounded-xl border bg-invictus-surface/60 transition-colors duration-700 ${panelBorder}`}
              >
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 transition-colors duration-700 ${panelHeaderBorder} ${panelHeaderBg}`}
                >
                  <div className="flex items-center gap-2">
                    <Clapperboard className={`h-4 w-4 transition-colors duration-700 ${panelIconColor}`} />
                    <span className="text-sm font-semibold text-neutral-100">
                      {show.title ? `${show.type} — ${show.title}` : show.type}
                    </span>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                      ready ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-alert/40 bg-alert/10 text-alert'
                    }`}
                  >
                    <StatusLight on={ready} /> {ready ? 'Show Ready' : `${total - done} Outstanding`}
                  </span>
                </div>
                <div className="space-y-2 p-4">
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
                          onClick={() => handleToggleChecklist(show.id, f.name)}
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
                          className={`flex items-center gap-1 rounded-md border border-neutral-400/25 bg-invictus-base/60 px-2 py-1 text-[10px] uppercase tracking-widest text-neutral-400 transition-colors duration-700 ${formHoverClasses}`}
                          title="Open the Microsoft Form"
                        >
                          Form <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-6 rounded-xl border border-neutral-400/20 bg-invictus-surface/60 p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-invictus-crimson-bright" />
          <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Things to Remember</h3>
        </div>
        {isLive && (
          <p className={`mb-4 rounded-md border px-3 py-2 text-xs transition-colors duration-700 ${tonightBoxClasses}`}>
            Tonight: {todaysShows.map((s) => (s.title ? `${s.type} — ${s.title}` : s.type)).join(', ')}. Keep this page open for
            live readiness and the procedures below.
          </p>
        )}
        <div className="space-y-5">
          {EVENT_PROCEDURES.map((proc) => (
            <div key={proc.title}>
              <h4 className="mb-1.5 text-sm font-semibold text-neutral-200">{proc.title}</h4>
              <div className="space-y-1 text-xs leading-relaxed text-neutral-400">
                {proc.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <TrainsWidget />
    </div>
  );
}

'use client';

// Estates HUD — the estate at a glance. A mini site map where every zone
// glows green (nothing outstanding) or red (at least one open task pinned
// there), and below it the same status broken out as a sectioned list of
// locations with a dot each.
//
// "Open" means any task that isn't Completed, matching the count badges the
// Site Map already shows. Tasks pinned to open ground ("Grid F12") are
// ignored here — the board is about named places.
//
// NOTE on what you can see: tasks are private to their participants (see the
// tasks block in firestore.rules), so for anyone but the master admin this
// board reflects the tasks they're actually on, not the whole team's.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Gauge, CircleCheck, TriangleAlert } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { featureEnabled } from '@/lib/teams';
import { hudSections } from '@/lib/estatesHud';
import {
  CAR_PARK_POLY,
  CLUSTER_POLY,
  EAST_PARK_POLY,
  MAP_C,
  MAP_H,
  MAP_W,
  SITE_BOUNDARY,
  SITE_ZONES,
  toPoints,
} from '@/lib/siteMapData';

const ALERT = 'rgb(255 59 78)';
const CLEAR = 'rgb(52 211 153)';

interface HudTask {
  id: string;
  area?: string;
  status?: string;
  archived?: boolean;
}

export default function EstatesHudPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const pageEnabled = isMaster || featureEnabled(team?.features, 'estatesHud');

  const [tasks, setTasks] = useState<HudTask[]>([]);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }
    // Master reads the whole estate; everyone else only ever sees tasks
    // they're a participant in, which is all the rules allow.
    const q = isMaster
      ? query(collection(db, 'tasks'))
      : query(collection(db, 'tasks'), where('participants', 'array-contains', user.uid));
    return onSnapshot(
      q,
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HudTask, 'id'>) }))),
      (e) => console.error('Estates HUD tasks subscription failed:', e)
    );
  }, [user, isMaster]);

  // Open task count per area — the one number every dot and glow reads from.
  const openByArea = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (!t.area || t.archived || t.status === 'Completed') continue;
      counts[t.area] = (counts[t.area] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  const sections = useMemo(() => hudSections(), []);
  const allLocations = useMemo(() => sections.flatMap((s) => s.locations), [sections]);
  const flagged = allLocations.filter((l) => (openByArea[l] ?? 0) > 0).length;

  const chrome = (body: React.ReactNode) => (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex-1 overflow-y-auto bg-invictus-base font-sans text-neutral-100">{body}</main>
    </div>
  );

  if (!profileLoading && !pageEnabled) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Estates HUD isn&apos;t enabled for your team.</p>
      </div>
    );
  }

  if (!user) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Sign in to view the Estates HUD.</p>
      </div>
    );
  }

  return chrome(
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-100 sm:text-3xl">
            <Gauge className="h-6 w-6 text-invictus-crimson-bright" />
            Estates HUD
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Every location across the estate — red where work is outstanding, green where it&apos;s clear.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest ${
              flagged > 0
                ? 'border-alert/50 bg-alert/10 text-alert'
                : 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
            }`}
          >
            {flagged > 0 ? <TriangleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
            {flagged > 0 ? `${flagged} of ${allLocations.length} need attention` : 'All locations clear'}
          </span>
        </div>
      </div>

      {/* Mini site map */}
      <div className="overflow-hidden rounded-xl border border-neutral-400/25 bg-invictus-surface/60 p-3 shadow-glow-subtle">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block w-full select-none" role="img" aria-label="Estate status map">
          <polygon points={toPoints(SITE_BOUNDARY)} fill={MAP_C.boundaryFill} stroke={MAP_C.accent} strokeWidth={2} strokeLinejoin="round" />
          <polygon points={toPoints(CAR_PARK_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />
          <polygon points={toPoints(EAST_PARK_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />
          <polygon points={toPoints(CLUSTER_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />

          {SITE_ZONES.map((z, i) => {
            const count = openByArea[z.label] ?? 0;
            const hot = count > 0;
            const cx = z.x + z.w / 2;
            const cy = z.y + z.h / 2;
            const transform = z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined;
            const glow = {
              fill: hot ? 'rgb(255 59 78 / 0.26)' : 'rgb(52 211 153 / 0.16)',
              stroke: hot ? ALERT : CLEAR,
              // The glow itself — hot zones burn brighter so they pull the eye.
              filter: `drop-shadow(0 0 ${hot ? 6 : 3}px ${hot ? 'rgb(255 59 78 / 0.85)' : 'rgb(52 211 153 / 0.5)'})`,
            };
            return z.shape === 'ellipse' ? (
              <ellipse
                key={`z-${i}`}
                cx={cx}
                cy={cy}
                rx={z.w / 2}
                ry={z.h / 2}
                fill={glow.fill}
                stroke={glow.stroke}
                strokeWidth={1.6}
                transform={transform}
                style={{ filter: glow.filter }}
              >
                <title>{`${z.label} — ${hot ? `${count} open task${count === 1 ? '' : 's'}` : 'clear'}`}</title>
              </ellipse>
            ) : (
              <rect
                key={`z-${i}`}
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                rx={2}
                fill={glow.fill}
                stroke={glow.stroke}
                strokeWidth={1.6}
                transform={transform}
                style={{ filter: glow.filter }}
              >
                <title>{`${z.label} — ${hot ? `${count} open task${count === 1 ? '' : 's'}` : 'clear'}`}</title>
              </rect>
            );
          })}

          {/* Zone labels, drawn over the glows */}
          <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }} pointerEvents="none">
            {SITE_ZONES.map((z, i) => {
              const cx = z.x + z.w / 2;
              const cy = z.y + z.h / 2;
              const lr = z.labelRot ?? z.rot ?? 0;
              const fs = z.labelSize ?? (z.w < 78 || z.h < 32 ? 7.5 : 9);
              const lines = z.labelLines ?? [z.label];
              const top = cy + (z.labelSize ? 2 : 3) - ((lines.length - 1) * fs * 1.15) / 2;
              return (
                <text
                  key={`zl-${i}`}
                  x={cx}
                  y={top}
                  fontSize={fs}
                  fontWeight={600}
                  letterSpacing={z.labelSize ? 0.2 : 0.5}
                  fill="hsl(var(--foreground))"
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
        </svg>

        <div className="mt-2 flex flex-wrap items-center gap-4 px-1">
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLEAR, boxShadow: `0 0 6px ${CLEAR}` }} /> Clear
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALERT, boxShadow: `0 0 6px ${ALERT}` }} /> Task outstanding
          </span>
        </div>
      </div>

      {/* Sectioned location list */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const hotCount = section.locations.filter((l) => (openByArea[l] ?? 0) > 0).length;
          return (
            <div key={section.name} className="rounded-xl border border-neutral-400/20 bg-invictus-surface/60 p-4 shadow-glow-subtle">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-300">{section.name}</span>
                <span className="h-px flex-1 bg-neutral-400/15" />
                {hotCount > 0 && (
                  <span className="rounded-full border border-alert/40 bg-alert/10 px-1.5 py-0.5 text-[9px] font-semibold text-alert">
                    {hotCount}
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {section.locations.map((loc) => {
                  const count = openByArea[loc] ?? 0;
                  const hot = count > 0;
                  return (
                    <li key={loc} className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: hot ? ALERT : CLEAR,
                          boxShadow: `0 0 ${hot ? 7 : 5}px ${hot ? 'rgb(255 59 78 / 0.9)' : 'rgb(52 211 153 / 0.6)'}`,
                        }}
                      />
                      <span className={`min-w-0 flex-1 truncate text-sm ${hot ? 'text-neutral-100' : 'text-neutral-400'}`}>{loc}</span>
                      {hot && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-alert">
                          {count} open
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {!isMaster && (
        <p className="mt-5 text-[11px] text-neutral-600">
          Tasks are private to the people on them, so this board shows the ones you&apos;re on. A full estate-wide view is
          master-only.
        </p>
      )}
    </div>
  );
}

'use client';

// My tasks (housekeeper, phone-first). Today's rooms for the signed-in
// person in work order — whatever's in progress, then urgent, then
// departures before deep cleans before stayovers. Start → checklist →
// Finish, each timestamped and reflected on the manager's board. Big tap
// targets, little text; every write goes through Firestore's offline queue
// so a dead spot in a corridor doesn't lose anything.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Ban, Check, ChevronDown, ListChecks, MoonStar, Play, Undo2, Zap } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useHotel } from '@/components/hotel/HotelProvider';
import { useMyAssignments } from '@/components/hotel/hooks';
import { Empty, Pill, RoleGate, inputClass } from '@/components/hotel/ui';
import { OUTCOME_LABELS, cleanTypeLabel, statusMeta } from '@/lib/hotel/constants';
import { FINISHED_OUTCOMES, sortMyTasks } from '@/lib/hotel/logic';
import { formatTime, todayStr } from '@/lib/hotel/dates';
import { finishClean, queued, setOutcome, startClean, tickChecklist } from '@/lib/hotel/actions';
import type { AssignmentOutcome, HotelAssignment, HotelRoom } from '@/lib/hotel/types';

function TaskCard({ a, room, open, onToggle }: { a: HotelAssignment; room: HotelRoom | undefined; open: boolean; onToggle: () => void }) {
  const { ctx, checklists, reportError } = useHotel();
  const [mode, setMode] = useState<null | 'refused' | 'dnd' | 'confirmFinish'>(null);
  const [note, setNote] = useState('');
  const items = checklists[a.cleanType];
  const ticked = items.filter((i) => a.checklist?.[i.id]).length;
  const finished = FINISHED_OUTCOMES.includes(a.outcome);
  const ooo = room?.status === 'out_of_order';

  if (!ctx || !room) return null;

  const start = () => queued(startClean(ctx, a, room), reportError);
  const finish = () => {
    setMode(null);
    queued(finishClean(ctx, a, room), reportError);
  };
  const markOutcome = (o: AssignmentOutcome) => {
    queued(setOutcome(ctx, a, room, o, note), reportError);
    setMode(null);
    setNote('');
  };

  return (
    <li
      className={`overflow-hidden rounded-lg border ${
        a.outcome === 'in_progress' ? 'border-amber-400/50 bg-amber-400/5' : finished ? 'border-neutral-400/15 bg-invictus-base/30 opacity-70' : 'border-neutral-400/25 bg-invictus-surface/60'
      }`}
    >
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="font-mono text-3xl font-bold leading-none">{a.roomNumber}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{cleanTypeLabel(a.cleanType)}</span>
            {a.urgent && (
              <Pill className="border-alert/50 bg-alert/15 text-alert">
                <Zap className="h-3 w-3" /> Urgent
              </Pill>
            )}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {a.roomType} · {a.outcome === 'in_progress' ? `${ticked}/${items.length} done` : a.outcome === 'pending' ? statusMeta(room.status).label : OUTCOME_LABELS[a.outcome]}
            {a.finishedAt ? ` · ${formatTime(a.finishedAt)}` : ''}
          </span>
        </span>
        {a.outcome === 'done' ? <Check className="h-6 w-6 text-emerald-300" /> : <ChevronDown className={`h-5 w-5 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-neutral-400/15 p-4">
          {ooo && (
            <p className="flex items-center gap-2 rounded-md border border-neutral-400/30 bg-neutral-500/10 p-2 text-xs text-neutral-300">
              <AlertTriangle className="h-4 w-4 text-alert" /> This room is out of order.
            </p>
          )}
          {a.note && <p className="text-xs text-amber-300">“{a.note}”</p>}

          {a.outcome === 'pending' && (
            <button onClick={start} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-lg bg-invictus-crimson-bright text-base font-bold uppercase tracking-widest text-invictus-base">
              <Play className="h-5 w-5" /> Start
            </button>
          )}

          {a.outcome === 'in_progress' && (
            <>
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const on = !!a.checklist?.[item.id];
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => queued(tickChecklist(ctx, a, item.id, !on), reportError)}
                        className={`flex min-h-[52px] w-full items-center gap-3 rounded-md border px-3 text-left text-sm ${
                          on ? 'border-emerald-400/40 bg-emerald-400/10 text-neutral-300 line-through decoration-neutral-500' : 'border-neutral-400/25 bg-invictus-base/60'
                        }`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${on ? 'border-emerald-300 bg-emerald-400/30' : 'border-neutral-400/50'}`}>
                          {on && <Check className="h-4 w-4 text-emerald-300" />}
                        </span>
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {mode === 'confirmFinish' ? (
                <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                  <p className="mb-2 text-sm text-amber-300">
                    {items.length - ticked} item{items.length - ticked === 1 ? '' : 's'} not ticked. Finish anyway?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setMode(null)} className="min-h-[48px] rounded-md border border-neutral-400/30 text-sm">
                      Back
                    </button>
                    <button onClick={finish} className="min-h-[48px] rounded-md bg-emerald-500 text-sm font-bold text-invictus-base">
                      Finish
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => (ticked < items.length ? setMode('confirmFinish') : finish())}
                  className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-base font-bold uppercase tracking-widest text-invictus-base"
                >
                  <Check className="h-5 w-5" /> Finish
                </button>
              )}
            </>
          )}

          {!finished && (
            <>
              {mode === 'refused' || mode === 'dnd' ? (
                <div className="space-y-2 rounded-md border border-neutral-400/25 bg-invictus-base/60 p-3">
                  <p className="text-sm font-semibold">{mode === 'refused' ? 'Guest refused service' : 'Do not disturb'}</p>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional) — e.g. try again after 2pm" className={inputClass} />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setMode(null)} className="min-h-[48px] rounded-md border border-neutral-400/30 text-sm">
                      Cancel
                    </button>
                    <button onClick={() => markOutcome(mode)} className="min-h-[48px] rounded-md bg-amber-400 text-sm font-bold text-invictus-base">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setMode('refused')} className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-md border border-neutral-400/25 text-[11px] text-neutral-300">
                    <Ban className="h-5 w-5" /> Refused
                  </button>
                  <button onClick={() => setMode('dnd')} className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-md border border-neutral-400/25 text-[11px] text-neutral-300">
                    <MoonStar className="h-5 w-5" /> DND
                  </button>
                  <Link
                    href={`/hotel/report?room=${room.id}`}
                    className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-md border border-alert/40 text-[11px] text-alert"
                  >
                    <AlertTriangle className="h-5 w-5" /> Fault
                  </Link>
                </div>
              )}
            </>
          )}

          {(a.outcome === 'refused' || a.outcome === 'dnd') && (
            <button
              onClick={() => markOutcome('pending')}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 text-sm text-neutral-300"
            >
              <Undo2 className="h-4 w-4" /> Back to my list
            </button>
          )}
          {a.outcome === 'done' && (
            <Link href={`/hotel/report?room=${room.id}`} className="flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-alert/40 text-sm text-alert">
              <AlertTriangle className="h-4 w-4" /> Report a fault in {a.roomNumber}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function MyTasks() {
  const { user } = useAuth();
  const { teamId, rooms, me } = useHotel();
  const today = todayStr();
  const { data, loading } = useMyAssignments(teamId, today, user?.uid ?? null);
  const list = useMemo(() => sortMyTasks(data), [data]);
  const [openId, setOpenId] = useState<string | null>(null);
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const active = list.find((a) => a.outcome === 'in_progress');
  const effectiveOpen = openId ?? active?.id ?? null;
  const done = list.filter((a) => a.outcome === 'done').length;
  const firstName = (me?.name ?? '').split(' ')[0];

  return (
    <div className="mx-auto max-w-lg px-3 py-5">
      <div className="mb-4 px-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ListChecks className="h-6 w-6 text-invictus-crimson-bright" /> {firstName ? `Hi ${firstName}` : 'My tasks'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {list.length ? `${done} of ${list.length} rooms done today` : 'Today'}
        </p>
        {list.length > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-500/20">
            <div className="h-full bg-emerald-400" style={{ width: `${(done / list.length) * 100}%` }} />
          </div>
        )}
      </div>
      {loading ? null : list.length === 0 ? (
        <Empty>No rooms assigned to you today yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <TaskCard
              key={a.id}
              a={a}
              room={roomsById.get(a.roomId)}
              open={effectiveOpen === a.id}
              onToggle={() => setOpenId(effectiveOpen === a.id ? '' : a.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <RoleGate allow={['housekeeper', 'manager']}>
      <MyTasks />
    </RoleGate>
  );
}

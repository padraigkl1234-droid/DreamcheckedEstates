'use client';

// Tap a tile on the Today board: everything about that room right now —
// status (and changing it), today's job and checklist, open faults, notes,
// and the full status history.

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BadgeCheck, CheckSquare, History, Square, Wrench } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useHotel } from '@/components/hotel/HotelProvider';
import { useRoomEvents } from '@/components/hotel/hooks';
import { Pill, SectionTitle, inputClass, primaryButton } from '@/components/hotel/ui';
import { cleanTypeLabel, faultStatusMeta, OUTCOME_LABELS, priorityMeta, ROOM_STATUSES, statusMeta } from '@/lib/hotel/constants';
import { formatDateTime, formatTime } from '@/lib/hotel/dates';
import { queued, setRoomStatus } from '@/lib/hotel/actions';
import type { HotelAssignment, HotelFault, HotelRoom, RoomStatus } from '@/lib/hotel/types';

export function RoomDetailSheet({
  room,
  assignment,
  faults,
  onClose,
}: {
  room: HotelRoom | null;
  assignment: HotelAssignment | null;
  faults: HotelFault[];
  onClose: () => void;
}) {
  const { ctx, teamId, isManager, checklists, reportError } = useHotel();
  const { data: events } = useRoomEvents(teamId, room?.id ?? null);
  const [note, setNote] = useState('');

  if (!room) return null;
  const meta = statusMeta(room.status);
  const items = assignment ? checklists[assignment.cleanType] : [];
  const ticked = assignment ? items.filter((i) => assignment.checklist?.[i.id]).length : 0;
  const history = [...events].sort((a, b) => b.at - a.at).slice(0, 40);

  const change = (to: RoomStatus) => {
    if (!ctx || to === room.status) return;
    queued(setRoomStatus(ctx, room, to, note), reportError);
    setNote('');
  };

  return (
    <Sheet open={!!room} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-neutral-400/20 bg-invictus-surface text-neutral-100 sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-3 text-2xl text-neutral-100">
            Room {room.number}
            <Pill className={meta.tile}>{meta.label}</Pill>
          </SheetTitle>
          <SheetDescription className="text-neutral-500">
            Floor {room.floor} · {room.type}
            {room.statusByName ? ` · ${meta.label} since ${formatTime(room.statusAt)} (${room.statusByName})` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-6">
          {isManager && (
            <section>
              {room.status === 'clean' && (
                <button onClick={() => change('inspected')} className={`${primaryButton} mb-3 w-full py-3`}>
                  <BadgeCheck className="h-4 w-4" /> Mark inspected
                </button>
              )}
              <SectionTitle>Change status</SectionTitle>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ROOM_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => change(s.value)}
                    disabled={s.value === room.status}
                    className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors disabled:cursor-default ${
                      s.value === room.status ? `${s.tile} ring-1 ring-current` : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400 hover:text-neutral-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note for the history (optional)"
                className={`${inputClass} mt-2`}
              />
            </section>
          )}

          <section>
            <SectionTitle icon={CheckSquare}>Today</SectionTitle>
            {assignment ? (
              <div className="space-y-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{cleanTypeLabel(assignment.cleanType)}</span>
                  {assignment.urgent && <Pill className="border-alert/50 bg-alert/10 text-alert">Urgent</Pill>}
                  <span className="text-neutral-500">· {assignment.assigneeName ?? 'Unassigned'}</span>
                </div>
                <p className="text-xs text-neutral-400">
                  {OUTCOME_LABELS[assignment.outcome]}
                  {assignment.startedAt ? ` · started ${formatTime(assignment.startedAt)}` : ''}
                  {assignment.finishedAt ? ` · finished ${formatTime(assignment.finishedAt)}` : ''}
                </p>
                {assignment.note && <p className="text-xs text-amber-300">“{assignment.note}”</p>}
                <div>
                  <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-neutral-500">
                    <span>Checklist</span>
                    <span className="font-mono">
                      {ticked}/{items.length}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-500/20">
                    <div className="h-full bg-invictus-crimson-bright" style={{ width: `${items.length ? (ticked / items.length) * 100 : 0}%` }} />
                  </div>
                  <ul className="mt-2 space-y-1">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 text-xs text-neutral-400">
                        {assignment.checklist?.[i.id] ? (
                          <CheckSquare className="h-3.5 w-3.5 text-emerald-300" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                        {i.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Nothing assigned for this room today.</p>
            )}
          </section>

          <section>
            <SectionTitle icon={Wrench} right={<Link href={`/hotel/report?room=${room.id}`} className="text-[10px] uppercase tracking-widest text-invictus-crimson-bright">Report fault</Link>}>
              Open faults
            </SectionTitle>
            {faults.length === 0 ? (
              <p className="text-xs text-neutral-500">None.</p>
            ) : (
              <ul className="space-y-1.5">
                {faults.map((f) => (
                  <li key={f.id}>
                    <Link href={`/hotel/maintenance?fault=${f.id}`} className="flex items-center gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-2 text-xs hover:border-invictus-crimson-bright/40">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-alert" />
                      <span className="min-w-0 flex-1 truncate">{f.category}: {f.note || '—'}</span>
                      <Pill className={priorityMeta(f.priority).accent}>{priorityMeta(f.priority).label}</Pill>
                      <Pill className={faultStatusMeta(f.status).accent}>{faultStatusMeta(f.status).label}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {room.notes && (
            <section>
              <SectionTitle>Room notes</SectionTitle>
              <p className="text-sm text-neutral-300">{room.notes}</p>
            </section>
          )}

          <section>
            <SectionTitle icon={History}>Status history</SectionTitle>
            {history.length === 0 ? (
              <p className="text-xs text-neutral-500">No changes recorded yet.</p>
            ) : (
              <ol className="space-y-1.5 border-l border-neutral-400/20 pl-3">
                {history.map((e) => (
                  <li key={e.id} className="text-xs">
                    <span className="font-mono text-neutral-500">{formatDateTime(e.at)}</span>{' '}
                    <span className="text-neutral-300">
                      {e.from ? `${statusMeta(e.from).label} → ` : ''}
                      {statusMeta(e.to).label}
                    </span>{' '}
                    <span className="text-neutral-500">by {e.byName}</span>
                    {e.note && <p className="text-neutral-500">“{e.note}”</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

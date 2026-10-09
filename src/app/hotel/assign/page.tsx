'use client';

// Assign (manager). The start-of-day plan: which rooms need a departure
// clean, stayover service, deep clean or nothing today, and who's doing each
// — one at a time or in bulk by floor — with a live workload panel per
// person. Every change saves immediately, so reassigning mid-shift is the
// same action as planning the morning.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Square, UserCheck, Users, Zap } from 'lucide-react';
import { useHotel } from '@/components/hotel/HotelProvider';
import { useAssignmentsForDate } from '@/components/hotel/hooks';
import { Empty, Label, PageHeader, Pill, RoleGate, SectionTitle, ghostButton, inputClass } from '@/components/hotel/ui';
import { InvictusSelect } from '@/components/InvictusSelect';
import { CLEAN_TYPES, OUTCOME_LABELS, statusMeta } from '@/lib/hotel/constants';
import { formatDate, todayStr } from '@/lib/hotel/dates';
import { queued, removeAssignment, upsertAssignments, type AssignmentInput } from '@/lib/hotel/actions';
import type { CleanType, HotelAssignment, HotelRoom, HotelStaff } from '@/lib/hotel/types';

type Plan = CleanType | 'none';

function Workload({
  people,
  assignments,
}: {
  people: HotelStaff[];
  assignments: HotelAssignment[];
}) {
  const { settings } = useHotel();
  const cap = settings.shiftCapacityMinutes;
  const unassigned = assignments.filter((a) => !a.assigneeUid);
  return (
    <section className="rounded-xl bg-white p-4">
      <SectionTitle icon={Users}>Workload</SectionTitle>
      <ul className="space-y-2.5">
        {people.map((p) => {
          const mine = assignments.filter((a) => a.assigneeUid === p.uid);
          const minutes = mine.reduce((sum, a) => sum + (settings.minutes[a.cleanType] ?? 0), 0);
          const done = mine.filter((a) => a.outcome === 'done').length;
          const over = minutes > cap;
          return (
            <li key={p.uid}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{p.name}</span>
                <span className={`shrink-0 font-mono text-xs ${over ? 'text-alert' : 'text-neutral-400'}`}>
                  {mine.length} rooms · {minutes}m
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-500/20">
                <div className={`h-full ${over ? 'bg-alert' : 'bg-invictus-crimson-bright'}`} style={{ width: `${Math.min(100, (minutes / cap) * 100)}%` }} />
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
                {over && <AlertTriangle className="h-3 w-3 text-alert" />}
                {over ? `Overloaded by ${minutes - cap}m` : `${cap - minutes}m spare`} · {done} done
              </p>
            </li>
          );
        })}
        {people.length === 0 && <li className="text-xs text-neutral-500">No housekeepers yet — set roles in Settings → Staff.</li>}
      </ul>
      {unassigned.length > 0 && (
        <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-300">
          {unassigned.length} room{unassigned.length === 1 ? '' : 's'} planned but not assigned to anyone.
        </p>
      )}
      <p className="mt-3 text-[10px] text-neutral-600">
        Estimates: departure {settings.minutes.departure}m · stayover {settings.minutes.stayover}m · deep {settings.minutes.deep}m · shift {cap}m. Change them in Settings.
      </p>
    </section>
  );
}

function Assign() {
  const { teamId, ctx, rooms, staff, reportError } = useHotel();
  const [date, setDate] = useState(todayStr());
  const { data: assignments } = useAssignmentsForDate(teamId, date);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const activeRooms = rooms.filter((r) => r.active !== false);
  const byRoom = useMemo(() => new Map(assignments.map((a) => [a.roomId, a])), [assignments]);
  const cleaners = staff.filter((s) => s.active && (s.role === 'housekeeper' || s.role === 'manager'));
  const floors = [...new Set(activeRooms.map((r) => r.floor))].sort((a, b) => a - b);
  const plannedCount = assignments.length;

  const personName = (uid: string | null) => (uid ? cleaners.find((c) => c.uid === uid)?.name ?? null : null);

  const apply = (targets: HotelRoom[], change: (current: HotelAssignment | null) => Plan | AssignmentInput | null) => {
    if (!ctx) return;
    const upserts: Parameters<typeof upsertAssignments>[2] = [];
    let skipped = 0;
    for (const room of targets) {
      const existing = byRoom.get(room.id) ?? null;
      const next = change(existing);
      if (next === null) continue;
      if (next === 'none') {
        if (!existing) continue;
        if (existing.outcome !== 'pending') {
          skipped++;
          continue;
        }
        queued(removeAssignment(existing), reportError);
        continue;
      }
      const input: AssignmentInput =
        typeof next === 'string'
          ? {
              cleanType: next,
              assigneeUid: existing?.assigneeUid ?? null,
              assigneeName: existing?.assigneeName ?? null,
              urgent: existing?.urgent ?? false,
            }
          : next;
      upserts.push({ room, existing, input });
    }
    if (upserts.length) queued(upsertAssignments(ctx, date, upserts), reportError);
    setNotice(skipped ? `${skipped} room${skipped === 1 ? ' was' : 's were'} already started, so left as planned.` : null);
  };

  const setPlan = (room: HotelRoom, plan: Plan) => apply([room], () => plan);
  const setAssignee = (room: HotelRoom, uid: string) =>
    apply([room], (cur) => (cur ? { cleanType: cur.cleanType, urgent: cur.urgent, assigneeUid: uid || null, assigneeName: personName(uid || null) } : null));
  const toggleUrgent = (room: HotelRoom) =>
    apply([room], (cur) => (cur ? { cleanType: cur.cleanType, assigneeUid: cur.assigneeUid, assigneeName: cur.assigneeName, urgent: !cur.urgent } : null));

  const selectedRooms = activeRooms.filter((r) => selected.has(r.id));
  const toggleSel = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const bulkPlan = (plan: Plan) => apply(selectedRooms, () => plan);
  const bulkAssign = () => {
    let missing = 0;
    apply(selectedRooms, (cur) => {
      if (!cur) {
        missing++;
        return null;
      }
      return { cleanType: cur.cleanType, urgent: cur.urgent, assigneeUid: bulkAssignee || null, assigneeName: personName(bulkAssignee || null) };
    });
    if (missing) setNotice(`${missing} selected room${missing === 1 ? ' has' : 's have'} no clean planned — choose a clean type for ${missing === 1 ? 'it' : 'them'} first.`);
  };

  return (
    <div className="mx-auto max-w-[1180px] px-9 py-[30px] max-md:px-4 max-md:py-5">
      <PageHeader
        icon={UserCheck}
        title="Assign"
        subtitle={`${formatDate(date)} · ${plannedCount} of ${activeRooms.length} rooms planned`}
        actions={
          <div className="w-44">
            <Label>Day</Label>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="order-2 lg:order-1">
          {/* Bulk bar */}
          <div className="sticky top-0 z-10 mb-4 rounded-xl bg-white p-4 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400">
                <span className="font-mono text-neutral-100">{selected.size}</span> selected
              </span>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-200">
                  Clear
                </button>
              )}
              <span className="mx-1 hidden h-4 border-l border-neutral-400/20 sm:block" />
              {CLEAN_TYPES.map((c) => (
                <button key={c.value} disabled={!selected.size} onClick={() => bulkPlan(c.value)} className={ghostButton}>
                  {c.short}
                </button>
              ))}
              <button disabled={!selected.size} onClick={() => bulkPlan('none')} className={ghostButton}>
                None
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="min-w-[180px] flex-1">
                <InvictusSelect
                  compact
                  value={bulkAssignee}
                  onChange={setBulkAssignee}
                  options={[{ value: '', label: 'Unassigned' }, ...cleaners.map((c) => ({ value: c.uid, label: c.name }))]}
                />
              </div>
              <button disabled={!selected.size} onClick={bulkAssign} className={ghostButton}>
                Assign selected
              </button>
            </div>
            {notice && <p className="mt-2 text-[11px] text-amber-300">{notice}</p>}
          </div>

          {activeRooms.length === 0 && <Empty>No rooms yet. Add them in Settings → Rooms.</Empty>}

          {floors.map((f) => {
            const floorRooms = activeRooms.filter((r) => r.floor === f);
            const allOn = floorRooms.every((r) => selected.has(r.id));
            return (
              <section key={f} className="mb-6">
                <SectionTitle
                  right={
                    <button
                      onClick={() => toggleSel(floorRooms.map((r) => r.id), !allOn)}
                      className="text-[10px] uppercase tracking-widest text-invictus-crimson-bright"
                    >
                      {allOn ? 'Deselect floor' : 'Select floor'}
                    </button>
                  }
                >
                  Floor {f}
                </SectionTitle>
                <div className="space-y-1.5">
                  {floorRooms.map((room) => {
                    const a = byRoom.get(room.id) ?? null;
                    const plan: Plan = a?.cleanType ?? 'none';
                    const sel = selected.has(room.id);
                    const sMeta = statusMeta(room.status);
                    return (
                      <div
                        key={room.id}
                        className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${sel ? 'border-invictus-crimson-bright/50 bg-invictus-crimson-bright/5' : 'border-neutral-400/20 bg-invictus-base/40'}`}
                      >
                        <button onClick={() => toggleSel([room.id], !sel)} className="p-1 text-neutral-400" aria-label={sel ? 'Deselect' : 'Select'}>
                          {sel ? <CheckSquare className="h-5 w-5 text-invictus-crimson-bright" /> : <Square className="h-5 w-5" />}
                        </button>
                        <div className="w-24 min-w-0">
                          <p className="font-mono text-base font-bold leading-tight">{room.number}</p>
                          <p className="flex items-center gap-1 truncate text-[10px] text-neutral-500">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${sMeta.dot}`} />
                            {room.type}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {(['none', ...CLEAN_TYPES.map((c) => c.value)] as Plan[]).map((p) => (
                            <button
                              key={p}
                              onClick={() => setPlan(room, p)}
                              className={`min-h-[36px] rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide ${
                                plan === p
                                  ? 'border-invictus-crimson-bright/70 bg-invictus-crimson-bright/20 text-neutral-100'
                                  : 'border-neutral-400/20 text-neutral-500 hover:text-neutral-200'
                              }`}
                            >
                              {p === 'none' ? '—' : CLEAN_TYPES.find((c) => c.value === p)?.short}
                            </button>
                          ))}
                        </div>
                        <div className="min-w-[150px] flex-1">
                          <InvictusSelect
                            compact
                            value={a?.assigneeUid ?? ''}
                            onChange={(v) => setAssignee(room, v)}
                            options={
                              a
                                ? [{ value: '', label: 'Unassigned' }, ...cleaners.map((c) => ({ value: c.uid, label: c.name }))]
                                : [{ value: '', label: 'Plan a clean first' }]
                            }
                          />
                        </div>
                        <button
                          disabled={!a}
                          onClick={() => toggleUrgent(room)}
                          title="Urgent — do this one first"
                          className={`rounded-md border p-2 disabled:opacity-30 ${a?.urgent ? 'border-alert/60 bg-alert/15 text-alert' : 'border-neutral-400/20 text-neutral-500'}`}
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                        {a && a.outcome !== 'pending' && <Pill className="border-neutral-400/30 text-neutral-400">{OUTCOME_LABELS[a.outcome]}</Pill>}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-4">
            <Workload
              // Housekeepers always; a manager only once they've taken rooms.
              people={cleaners.filter((c) => c.role === 'housekeeper' || assignments.some((a) => a.assigneeUid === c.uid))}
              assignments={assignments}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssignPage() {
  return (
    <RoleGate allow={['manager']}>
      <Assign />
    </RoleGate>
  );
}

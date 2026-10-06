'use client';

// Today board (manager). Every room as a tile, grouped by floor and coloured
// by status, built from each room's current state plus today's assignments.
// Updates live as housekeepers start and finish rooms on their phones.

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BedDouble, Ban, LayoutGrid, MoonStar, Plus, Zap } from 'lucide-react';
import { useHotel } from '@/components/hotel/HotelProvider';
import { initials, useAssignmentsForDate, useOpenFaults } from '@/components/hotel/hooks';
import { RoomDetailSheet } from '@/components/hotel/RoomDetailSheet';
import { Empty, PageHeader, RoleGate, ghostButton } from '@/components/hotel/ui';
import { InvictusSelect } from '@/components/InvictusSelect';
import { CLEAN_TYPES, ROOM_STATUSES } from '@/lib/hotel/constants';
import { formatDate, todayStr } from '@/lib/hotel/dates';
import type { HotelAssignment, HotelFault, HotelRoom, RoomStatus } from '@/lib/hotel/types';

function RoomTile({
  room,
  assignment,
  hasFault,
  progress,
  onOpen,
}: {
  room: HotelRoom;
  assignment: HotelAssignment | undefined;
  hasFault: boolean;
  progress: number | null;
  onOpen: () => void;
}) {
  const meta = ROOM_STATUSES.find((s) => s.value === room.status) ?? ROOM_STATUSES[0];
  const clean = assignment ? CLEAN_TYPES.find((c) => c.value === assignment.cleanType) : null;
  return (
    <button
      onClick={onOpen}
      className={`relative flex min-h-[92px] flex-col justify-between rounded-md border p-2.5 text-left transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-invictus-crimson-bright/60 ${meta.tile}`}
      title={`Room ${room.number} — ${meta.label}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-mono text-xl font-bold leading-none text-neutral-100">{room.number}</span>
        <span className="flex items-center gap-1">
          {assignment?.urgent && <Zap className="h-3.5 w-3.5 text-alert" aria-label="Urgent" />}
          {assignment?.outcome === 'refused' && <Ban className="h-3.5 w-3.5 text-amber-300" aria-label="Guest refused service" />}
          {assignment?.outcome === 'dnd' && <MoonStar className="h-3.5 w-3.5 text-amber-300" aria-label="Do not disturb" />}
          {hasFault && <AlertTriangle className="h-3.5 w-3.5 text-alert" aria-label="Open fault" />}
        </span>
      </div>
      <p className="truncate text-[10px] uppercase tracking-wider text-neutral-400">{room.type}</p>
      <div className="flex items-center justify-between gap-1 text-[10px] font-semibold">
        <span className="rounded bg-invictus-base/60 px-1 py-0.5 text-neutral-300">{clean?.short ?? '—'}</span>
        <span className="font-mono text-neutral-200" title={assignment?.assigneeName ?? 'Unassigned'}>
          {assignment ? initials(assignment.assigneeName) : ''}
        </span>
      </div>
      {progress !== null && (
        <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-md bg-neutral-500/20">
          <div className="h-full bg-current" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </button>
  );
}

function Board() {
  const { teamId, rooms, checklists, staff } = useHotel();
  const today = todayStr();
  const { data: assignments } = useAssignmentsForDate(teamId, today);
  const { data: faults } = useOpenFaults(teamId);
  const [floor, setFloor] = useState('');
  const [status, setStatus] = useState<RoomStatus | ''>('');
  const [assignee, setAssignee] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const activeRooms = rooms.filter((r) => r.active !== false);
  const byRoom = useMemo(() => new Map(assignments.map((a) => [a.roomId, a])), [assignments]);
  const faultsByRoom = useMemo(() => {
    const m = new Map<string, HotelFault[]>();
    for (const f of faults) if (f.roomId) m.set(f.roomId, [...(m.get(f.roomId) ?? []), f]);
    return m;
  }, [faults]);

  const floors = [...new Set(activeRooms.map((r) => r.floor))].sort((a, b) => a - b);
  const filtered = activeRooms.filter((r) => {
    if (floor !== '' && r.floor !== Number(floor)) return false;
    if (status && r.status !== status) return false;
    if (assignee) {
      const a = byRoom.get(r.id);
      if (assignee === '__none__' ? !!a?.assigneeUid : a?.assigneeUid !== assignee) return false;
    }
    return true;
  });
  const counts = Object.fromEntries(ROOM_STATUSES.map((s) => [s.value, activeRooms.filter((r) => r.status === s.value).length]));
  const open = openId ? activeRooms.find((r) => r.id === openId) ?? null : null;

  const progressFor = (a: HotelAssignment | undefined) => {
    if (!a || a.outcome !== 'in_progress') return null;
    const items = checklists[a.cleanType];
    return items.length ? items.filter((i) => a.checklist?.[i.id]).length / items.length : 0;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        icon={LayoutGrid}
        title="Today"
        subtitle={formatDate(today)}
        actions={
          <Link href="/hotel/assign" className={ghostButton}>
            <Plus className="h-3.5 w-3.5" /> Assign rooms
          </Link>
        }
      />

      {/* Counts per status — tap to filter */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {ROOM_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus((cur) => (cur === s.value ? '' : s.value))}
            className={`rounded-md border p-2 text-left transition-colors ${s.tile} ${status === s.value ? 'ring-2 ring-current' : ''}`}
          >
            <p className="font-mono text-2xl font-bold leading-none text-neutral-100">{counts[s.value]}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <InvictusSelect
          value={floor}
          onChange={setFloor}
          options={[{ value: '', label: 'All floors' }, ...floors.map((f) => ({ value: String(f), label: `Floor ${f}` }))]}
        />
        <InvictusSelect
          value={status}
          onChange={(v) => setStatus(v as RoomStatus | '')}
          options={[{ value: '', label: 'All statuses' }, ...ROOM_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
        />
        <InvictusSelect
          value={assignee}
          onChange={setAssignee}
          options={[
            { value: '', label: 'Everyone' },
            { value: '__none__', label: 'Unassigned' },
            ...staff.filter((s) => s.active).map((s) => ({ value: s.uid, label: s.name })),
          ]}
        />
      </div>

      {activeRooms.length === 0 ? (
        <Empty>
          No rooms yet. Add them in <Link href="/hotel/settings" className="text-invictus-crimson-bright underline">Settings → Rooms</Link>.
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>No rooms match those filters.</Empty>
      ) : (
        floors
          .filter((f) => filtered.some((r) => r.floor === f))
          .map((f) => (
            <section key={f} className="mb-6">
              <h2 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
                <BedDouble className="h-3.5 w-3.5" /> Floor {f}
              </h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {filtered
                  .filter((r) => r.floor === f)
                  .map((r) => {
                    const a = byRoom.get(r.id);
                    return (
                      <RoomTile
                        key={r.id}
                        room={r}
                        assignment={a}
                        hasFault={(faultsByRoom.get(r.id)?.length ?? 0) > 0}
                        progress={progressFor(a)}
                        onOpen={() => setOpenId(r.id)}
                      />
                    );
                  })}
              </div>
            </section>
          ))
      )}

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-alert" /> Urgent</span>
        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-alert" /> Open fault</span>
        <span className="flex items-center gap-1"><Ban className="h-3 w-3 text-amber-300" /> Refused service</span>
        <span className="flex items-center gap-1"><MoonStar className="h-3 w-3 text-amber-300" /> Do not disturb</span>
        <span>DEP / STAY / DEEP = clean type</span>
      </p>

      <RoomDetailSheet
        room={open}
        assignment={open ? byRoom.get(open.id) ?? null : null}
        faults={open ? faultsByRoom.get(open.id) ?? [] : []}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

export default function BoardPage() {
  return (
    <RoleGate allow={['manager']}>
      <Board />
    </RoleGate>
  );
}

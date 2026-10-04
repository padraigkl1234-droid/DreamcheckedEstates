'use client';

// Maintenance queue (maintenance and manager). Open faults by priority, then
// age; filter by stage. Open a fault to assign it, move it along, add notes
// and an after photo, and close it — closing a fault on an out-of-order room
// offers to put the room back in the cleaning cycle as dirty.

import React, { Suspense, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, Check, Clock, ImageIcon, Loader2, MessageSquare, User, Wrench } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useHotel } from '@/components/hotel/HotelProvider';
import { useAllFaults, useFaultUpdates } from '@/components/hotel/hooks';
import { Empty, Label, PageHeader, Pill, RoleGate, SectionTitle, ghostButton, inputClass, primaryButton } from '@/components/hotel/ui';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { InvictusSelect } from '@/components/InvictusSelect';
import { FAULT_STATUSES, OPEN_FAULT_STATUSES, faultStatusMeta, priorityMeta } from '@/lib/hotel/constants';
import { ageLabel, formatDateTime } from '@/lib/hotel/dates';
import { addFaultNote, queued, setRoomStatus, updateFault } from '@/lib/hotel/actions';
import { queueFaultPhotos } from '@/lib/hotel/photos';
import { sortFaultQueue } from '@/lib/hotel/logic';
import type { FaultStatus, HotelFault, HotelPhoto } from '@/lib/hotel/types';

type Filter = 'active' | FaultStatus;

function Photos({ title, photos }: { title: string; photos: HotelPhoto[] }) {
  if (!photos.length) return null;
  return (
    <div>
      <Label>{title}</Label>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <a key={p.path} href={p.url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-md border border-neutral-400/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

function FaultSheet({ fault, onClose }: { fault: HotelFault | null; onClose: () => void }) {
  const { ctx, teamId, staff, rooms, reportError } = useHotel();
  const { data: updates } = useFaultUpdates(teamId, fault?.id ?? null);
  const [note, setNote] = useState('');
  const [askRoom, setAskRoom] = useState(false);
  const [uploading, setUploading] = useState(false);
  const afterRef = useRef<HTMLInputElement>(null);

  if (!fault || !ctx || !teamId) return null;
  const room = fault.roomId ? rooms.find((r) => r.id === fault.roomId) : undefined;
  const fixers = staff.filter((s) => s.active && (s.role === 'maintenance' || s.role === 'manager'));
  const log = [...updates].sort((a, b) => b.at - a.at);

  const setStatus = (status: FaultStatus) => {
    if (status === fault.status) return;
    queued(updateFault(ctx, fault, { status }, { kind: 'status', text: `${faultStatusMeta(fault.status).label} → ${faultStatusMeta(status).label}` }), reportError);
    if (status === 'done' && room?.status === 'out_of_order') setAskRoom(true);
  };
  const assign = (uid: string) => {
    const name = uid ? staff.find((s) => s.uid === uid)?.name ?? null : null;
    queued(updateFault(ctx, fault, { assigneeUid: uid || null, assigneeName: name }, { kind: 'assign', text: name ? `Assigned to ${name}` : 'Unassigned' }), reportError);
  };
  const addNote = () => {
    if (!note.trim()) return;
    queued(addFaultNote(ctx, fault, note), reportError);
    setNote('');
  };
  const addAfter = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      await queueFaultPhotos(teamId, fault.id, 'afterPhotos', files);
      queued(addFaultNote(ctx, fault, `Added ${files.length} after photo${files.length === 1 ? '' : 's'}`), reportError);
    } finally {
      setUploading(false);
    }
  };
  const returnRoom = () => {
    if (room) queued(setRoomStatus(ctx, room, 'dirty', `Fault fixed: ${fault.category}`), reportError);
    setAskRoom(false);
  };

  return (
    <Sheet open={!!fault} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-neutral-400/20 bg-invictus-surface text-neutral-100 sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-xl text-neutral-100">
            {fault.roomNumber ? `Room ${fault.roomNumber}` : fault.area}
            <Pill className={priorityMeta(fault.priority).accent}>{priorityMeta(fault.priority).label}</Pill>
          </SheetTitle>
          <SheetDescription className="text-neutral-500">
            {fault.category} · reported by {fault.reportedByName} · {formatDateTime(fault.createdAt)}
            {fault.markedOutOfOrder ? ' · room taken out of order' : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {fault.note && <p className="rounded-md border border-neutral-400/20 bg-invictus-base/50 p-3 text-sm">{fault.note}</p>}

          {askRoom && room && (
            <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 p-3">
              <p className="mb-2 text-sm">Room {room.number} is still out of order. Return it to dirty so it gets cleaned and let again?</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAskRoom(false)} className={ghostButton}>Leave it</button>
                <button onClick={returnRoom} className={primaryButton}>Return to dirty</button>
              </div>
            </div>
          )}

          <section>
            <SectionTitle>Stage</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {FAULT_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`min-h-[44px] rounded-md border text-xs font-semibold ${fault.status === s.value ? `${s.accent} ring-1 ring-current` : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400'}`}
                >
                  {s.value === 'done' ? 'Done — close' : s.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <Label>Assigned to</Label>
            <InvictusSelect
              value={fault.assigneeUid ?? ''}
              onChange={assign}
              options={[{ value: '', label: 'Unassigned' }, ...fixers.map((s) => ({ value: s.uid, label: s.name }))]}
            />
          </section>

          <Photos title="Before" photos={fault.photos ?? []} />
          {fault.pendingPhotos > 0 && <p className="text-xs text-amber-300">{fault.pendingPhotos} photo(s) still uploading from the reporter&apos;s phone.</p>}
          <Photos title="After" photos={fault.afterPhotos ?? []} />

          <section className="space-y-2">
            <input ref={afterRef} type="file" accept="image/*" multiple className="hidden" onChange={addAfter} />
            <button onClick={() => afterRef.current?.click()} disabled={uploading} className={`${ghostButton} w-full py-2.5`}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Add after photo
            </button>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="Add a note" className={inputClass} />
              <button onClick={addNote} disabled={!note.trim()} className={ghostButton}>
                Add
              </button>
            </div>
          </section>

          <section>
            <SectionTitle icon={MessageSquare}>Log</SectionTitle>
            <ol className="space-y-1.5 border-l border-neutral-400/20 pl-3">
              {log.map((u) => (
                <li key={u.id} className="text-xs">
                  <span className="font-mono text-neutral-500">{formatDateTime(u.at)}</span> <span className="text-neutral-300">{u.text}</span>{' '}
                  <span className="text-neutral-500">— {u.byName}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Queue() {
  const { user } = useAuth();
  const { teamId } = useHotel();
  const { data: faults } = useAllFaults(teamId);
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get('fault');
  const [filter, setFilter] = useState<Filter>('active');
  const [mine, setMine] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0 };
    for (const s of FAULT_STATUSES) c[s.value] = 0;
    for (const f of faults) {
      c[f.status] = (c[f.status] ?? 0) + 1;
      if (OPEN_FAULT_STATUSES.includes(f.status)) c.active++;
    }
    return c;
  }, [faults]);

  const visible = useMemo(() => {
    let list = faults.filter((f) => (filter === 'active' ? OPEN_FAULT_STATUSES.includes(f.status) : f.status === filter));
    if (mine) list = list.filter((f) => f.assigneeUid === user?.uid);
    if (filter === 'done') return [...list].sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, 100);
    return sortFaultQueue(list);
  }, [faults, filter, mine, user]);

  const open = openId ? faults.find((f) => f.id === openId) ?? null : null;
  const setOpen = (id: string | null) => router.replace(id ? `/hotel/maintenance?fault=${id}` : '/hotel/maintenance', { scroll: false });

  const filters: { value: Filter; label: string }[] = [{ value: 'active', label: 'All open' }, ...FAULT_STATUSES.map((s) => ({ value: s.value, label: s.label }))];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader icon={Wrench} title="Faults" subtitle={`${counts.active} open · sorted by priority, then oldest first`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === f.value ? 'border-invictus-crimson-bright/70 bg-invictus-crimson-bright/20 text-neutral-100' : 'border-neutral-400/25 text-neutral-400'}`}
          >
            {f.label} <span className="font-mono text-neutral-500">{counts[f.value] ?? 0}</span>
          </button>
        ))}
        <button
          onClick={() => setMine((m) => !m)}
          className={`ml-auto flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${mine ? 'border-invictus-crimson-bright/70 bg-invictus-crimson-bright/20 text-neutral-100' : 'border-neutral-400/25 text-neutral-400'}`}
        >
          <User className="h-3.5 w-3.5" /> Mine
        </button>
      </div>

      {visible.length === 0 ? (
        <Empty>{filter === 'active' ? 'No open faults. Nice.' : 'Nothing here.'}</Empty>
      ) : (
        <ul className="space-y-2">
          {visible.map((f) => {
            const p = priorityMeta(f.priority);
            const s = faultStatusMeta(f.status);
            return (
              <li key={f.id}>
                <button onClick={() => setOpen(f.id)} className="flex w-full items-start gap-3 rounded-md border border-neutral-400/20 bg-invictus-surface/50 p-3 text-left hover:border-invictus-crimson-bright/40">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-neutral-400/20 bg-invictus-base/60">
                    {f.photos?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.photos[0].url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="m-auto mt-4 h-5 w-5 text-neutral-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{f.roomNumber ? `Room ${f.roomNumber}` : f.area}</span>
                      <Pill className={p.accent}>{p.label}</Pill>
                      <Pill className={s.accent}>{s.label}</Pill>
                      {f.markedOutOfOrder && f.status !== 'done' && <Pill className="border-neutral-400/40 text-neutral-400">OOO</Pill>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-neutral-300">
                      {f.category}
                      {f.note ? ` — ${f.note}` : ''}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {f.status === 'done' ? `closed ${formatDateTime(f.closedAt)}` : ageLabel(f.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {f.assigneeName ?? 'Unassigned'}
                      </span>
                      {f.status === 'done' && <Check className="h-3 w-3 text-emerald-300" />}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <FaultSheet fault={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <RoleGate allow={['manager', 'maintenance']}>
      <Suspense fallback={null}>
        <Queue />
      </Suspense>
    </RoleGate>
  );
}

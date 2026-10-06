'use client';

// Report a fault (any role, phone-first). Photo from the camera or library,
// room or other area, category, priority, a short note, and optionally take
// the room out of order — which shows on the board immediately. Opened from
// a room in My tasks it arrives with that room filled in.
//
// Works with no signal: the fault is queued by Firestore and the photos by
// the hotel photo outbox (src/lib/hotel/photos.ts).

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Camera, Check, ImagePlus, Loader2, X } from 'lucide-react';
import { useHotel } from '@/components/hotel/HotelProvider';
import { HOME_FOR_ROLE } from '@/components/hotel/HotelShell';
import { ChipPicker, Label, RoleGate, inputClass } from '@/components/hotel/ui';
import { InvictusSelect } from '@/components/InvictusSelect';
import { FAULT_PRIORITIES } from '@/lib/hotel/constants';
import { queued, reportFault } from '@/lib/hotel/actions';
import { queueFaultPhotos } from '@/lib/hotel/photos';
import type { FaultPriority } from '@/lib/hotel/types';

const MAX_PHOTOS = 4;
const OTHER = '__other__';

function ReportForm() {
  const presetRoom = useSearchParams().get('room') ?? '';
  const { ctx, teamId, rooms, settings, role, reportError } = useHotel();
  const [roomId, setRoomId] = useState(presetRoom);
  const [area, setArea] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<FaultPriority>('medium');
  const [note, setNote] = useState('');
  const [ooo, setOoo] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRoomId(presetRoom), [presetRoom]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const room = rooms.find((r) => r.id === roomId) ?? null;
  const isOther = roomId === OTHER;

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    setFiles((prev) => [...prev, ...chosen].slice(0, MAX_PHOTOS));
  };

  const reset = () => {
    setCategory(null);
    setPriority('medium');
    setNote('');
    setOoo(false);
    setFiles([]);
    setArea('');
    setSent(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctx || !teamId) return;
    if (!room && !(isOther && area.trim())) return setError('Choose a room, or say where it is.');
    if (!category) return setError('Choose a category.');
    setError(null);
    setSaving(true);
    try {
      const { id, commit } = reportFault(ctx, {
        room,
        area: isOther ? area : null,
        category,
        priority,
        note,
        markOutOfOrder: ooo,
        photoCount: files.length,
      });
      queued(commit, reportError);
      if (files.length) await queueFaultPhotos(teamId, id, 'photos', files);
      setSent(room ? `Room ${room.number}` : area.trim());
    } catch (err) {
      console.error('Fault report failed:', err);
      setError("Couldn't save that photo on this device — try again, or send without it.");
    } finally {
      setSaving(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15">
          <Check className="h-8 w-8 text-emerald-300" />
        </span>
        <h1 className="text-xl font-bold">Fault reported</h1>
        <p className="text-sm text-neutral-500">
          {sent}
          {ooo ? ' is now out of order.' : '.'}{' '}
          {typeof navigator !== 'undefined' && !navigator.onLine
            ? 'It’s saved on this phone and will reach maintenance as soon as there’s signal.'
            : `Maintenance can see it now${files.length ? '; photos are on their way' : ''}.`}
        </p>
        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          <button onClick={reset} className="min-h-[52px] rounded-md border border-neutral-400/30 text-sm">
            Report another
          </button>
          <Link href={role ? HOME_FOR_ROLE[role] : '/hotel'} className="flex min-h-[52px] items-center justify-center rounded-md bg-invictus-crimson-bright text-sm font-bold text-invictus-base">
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-5 px-4 py-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <AlertTriangle className="h-6 w-6 text-alert" /> Report a fault
      </h1>

      <div>
        <Label>Photo</Label>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={addFiles} />
        <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={addFiles} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={files.length >= MAX_PHOTOS} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-md border border-neutral-400/30 bg-invictus-base/60 text-xs disabled:opacity-40">
            <Camera className="h-6 w-6" /> Take photo
          </button>
          <button type="button" onClick={() => libraryRef.current?.click()} disabled={files.length >= MAX_PHOTOS} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-md border border-neutral-400/30 bg-invictus-base/60 text-xs disabled:opacity-40">
            <ImagePlus className="h-6 w-6" /> From library
          </button>
        </div>
        {files.length > 0 && (
          <div className="mt-2 flex gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative h-20 w-20 overflow-hidden rounded-md border border-neutral-400/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-1" aria-label="Remove photo">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>Where</Label>
        <InvictusSelect
          value={roomId}
          onChange={(v) => {
            setRoomId(v);
            if (v === OTHER) setOoo(false);
          }}
          options={[
            { value: '', label: 'Choose a room' },
            ...rooms.filter((r) => r.active !== false).map((r) => ({ value: r.id, label: `Room ${r.number} · floor ${r.floor}` })),
            { value: OTHER, label: 'Somewhere else (corridor, kitchen…)' },
          ]}
        />
        {isOther && <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. 2nd floor corridor" className={`${inputClass} mt-2`} />}
      </div>

      <div>
        <Label>What kind</Label>
        <ChipPicker size="lg" value={category} onChange={setCategory} options={settings.faultCategories.map((c) => ({ value: c, label: c }))} />
      </div>

      <div>
        <Label>How urgent</Label>
        <ChipPicker
          size="lg"
          value={priority}
          onChange={setPriority}
          options={[...FAULT_PRIORITIES].reverse().map((p) => ({ value: p.value, label: p.label, accent: p.accent }))}
        />
      </div>

      <div>
        <Label>Note</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={280} placeholder="What's wrong? (short)" className={inputClass} />
      </div>

      {room && (
        <label className="flex min-h-[56px] items-center gap-3 rounded-md border border-neutral-400/25 bg-invictus-base/50 px-3">
          <input type="checkbox" checked={ooo} onChange={(e) => setOoo(e.target.checked)} className="h-6 w-6 accent-invictus-crimson-bright" />
          <span className="text-sm">
            Take room {room.number} out of order
            <span className="block text-[11px] text-neutral-500">It can&apos;t be let until the fault is fixed.</span>
          </span>
        </label>
      )}

      {error && <p className="text-sm text-alert">{error}</p>}

      <button type="submit" disabled={saving} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-lg bg-alert text-base font-bold uppercase tracking-widest text-white disabled:opacity-50">
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />} Send report
      </button>
    </form>
  );
}

export default function ReportPage() {
  return (
    <RoleGate allow={['manager', 'housekeeper', 'maintenance']}>
      <Suspense fallback={null}>
        <ReportForm />
      </Suspense>
    </RoleGate>
  );
}

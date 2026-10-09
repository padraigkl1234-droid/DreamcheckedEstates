'use client';

// Settings (manager) — just enough for a hotel to set itself up: rooms,
// staff roles (and the team code new staff join with), the checklist for
// each clean type, time estimates and fault categories. Every change is
// recorded in the hotelAudit log.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Check, ClipboardList, Copy, Plus, Settings, Trash2, Users, Wrench, BedDouble, Timer } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useHotel } from '@/components/hotel/HotelProvider';
import { Empty, Label, PageHeader, Pill, RoleGate, SectionTitle, ghostButton, inputClass, primaryButton } from '@/components/hotel/ui';
import { InvictusSelect } from '@/components/InvictusSelect';
import { CLEAN_TYPES, HOTEL_ROLES, ROLE_LABELS, ROOM_TYPES, statusMeta } from '@/lib/hotel/constants';
import { createRooms, deleteRoom, queued, roomHasHistory, saveSettings, saveTemplate, setStaffRole, updateRoom, type RoomInput } from '@/lib/hotel/actions';
import { isCommander, profileName, type UserProfile } from '@/lib/teams';
import type { ChecklistItem, CleanType, HotelRole, HotelRoom } from '@/lib/hotel/types';

type Tab = 'rooms' | 'staff' | 'checklists' | 'times' | 'faults';

function RoomsTab() {
  const { ctx, rooms, reportError } = useHotel();
  const [single, setSingle] = useState<RoomInput>({ number: '', floor: 1, type: 'Double' });
  const [range, setRange] = useState({ floor: 1, from: '', to: '', type: 'Double' });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoomInput & { active?: boolean }>({ number: '', floor: 1, type: '' });
  // Deleting is only for a room added by mistake. Asking once confirms, and
  // the history check runs before anything is removed.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const removeRoom = async (room: HotelRoom) => {
    if (!ctx) return;
    if (confirmDelete !== room.id) {
      setConfirmDelete(room.id);
      setMsg(null);
      return;
    }
    setCheckingId(room.id);
    setConfirmDelete(null);
    try {
      if (await roomHasHistory(ctx, room)) {
        setMsg(`Room ${room.number} has been used — cleans, assignments or faults are recorded against it. Retire it instead so that history still makes sense.`);
        return;
      }
      await deleteRoom(ctx, room);
      setMsg(`Room ${room.number} deleted.`);
    } catch (e) {
      reportError((e as Error).message || 'Could not delete that room.');
    } finally {
      setCheckingId(null);
    }
  };
  const [msg, setMsg] = useState<string | null>(null);
  if (!ctx) return null;
  const taken = new Set(rooms.map((r) => r.number.toLowerCase()));

  const addOne = () => {
    if (!single.number.trim()) return;
    if (taken.has(single.number.trim().toLowerCase())) return setMsg(`Room ${single.number} already exists.`);
    queued(createRooms(ctx, [single]), reportError);
    setSingle({ ...single, number: '' });
    setMsg(null);
  };
  const addRange = () => {
    const from = Number(range.from);
    const to = Number(range.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || to - from > 60) return setMsg('Enter a range like 301 to 312 (up to 60 rooms).');
    const list: RoomInput[] = [];
    for (let n = from; n <= to; n++) if (!taken.has(String(n))) list.push({ number: String(n), floor: range.floor, type: range.type });
    if (!list.length) return setMsg('Those rooms already exist.');
    queued(createRooms(ctx, list), reportError);
    setMsg(`Added ${list.length} room${list.length === 1 ? '' : 's'}.`);
  };
  const startEdit = (r: HotelRoom) => {
    setEditing(r.id);
    setDraft({ number: r.number, floor: r.floor, type: r.type, notes: r.notes ?? '' });
  };
  const saveEdit = (r: HotelRoom) => {
    queued(updateRoom(ctx, r, { number: draft.number.trim(), floor: Number(draft.floor), type: draft.type, notes: draft.notes ?? '' }), reportError);
    setEditing(null);
  };
  const typeOptions = ROOM_TYPES.map((t) => ({ value: t, label: t }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl bg-white p-4">
          <SectionTitle icon={Plus}>Add a room</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <input value={single.number} onChange={(e) => setSingle({ ...single, number: e.target.value })} placeholder="Number" className={inputClass} />
            <input type="number" value={single.floor} onChange={(e) => setSingle({ ...single, floor: Number(e.target.value) })} placeholder="Floor" className={inputClass} />
            <InvictusSelect value={single.type} onChange={(v) => setSingle({ ...single, type: v })} options={typeOptions} />
          </div>
          <button onClick={addOne} className={`${ghostButton} mt-2 w-full`}>Add room</button>
        </section>
        <section className="rounded-xl bg-white p-4">
          <SectionTitle icon={Plus}>Add a run of rooms</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            <input value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} placeholder="From" className={inputClass} inputMode="numeric" />
            <input value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} placeholder="To" className={inputClass} inputMode="numeric" />
            <input type="number" value={range.floor} onChange={(e) => setRange({ ...range, floor: Number(e.target.value) })} placeholder="Floor" className={inputClass} />
            <InvictusSelect value={range.type} onChange={(v) => setRange({ ...range, type: v })} options={typeOptions} />
          </div>
          <button onClick={addRange} className={`${ghostButton} mt-2 w-full`}>Add rooms</button>
        </section>
      </div>
      {msg && (
        <p className="rounded-lg bg-sun-panel px-3 py-2 text-[13px] font-semibold text-sun-ink">{msg}</p>
      )}

      {rooms.length === 0 ? (
        <Empty>No rooms yet.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {rooms.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="grid grid-cols-2 gap-2 rounded-md border border-invictus-crimson-bright/40 p-2 sm:grid-cols-[90px_80px_1fr_2fr_auto]">
                <input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} className={inputClass} />
                <input type="number" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: Number(e.target.value) })} className={inputClass} />
                <InvictusSelect value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} options={typeOptions.some((o) => o.value === draft.type) ? typeOptions : [...typeOptions, { value: draft.type, label: draft.type }]} />
                <input value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Notes (e.g. sea view, connecting)" className={inputClass} />
                <div className="flex gap-1">
                  <button onClick={() => saveEdit(r)} className={primaryButton}>Save</button>
                  <button onClick={() => setEditing(null)} className={ghostButton}>Cancel</button>
                </div>
              </li>
            ) : (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-2 ${r.active === false ? 'opacity-50' : ''}`}>
                <span className="w-14 font-mono font-bold">{r.number}</span>
                <span className="w-16 text-xs text-neutral-500">Floor {r.floor}</span>
                <span className="w-24 text-xs">{r.type}</span>
                <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta(r.status).dot}`} /> {statusMeta(r.status).label}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{r.notes}</span>
                <button onClick={() => startEdit(r)} className={ghostButton}>Edit</button>
                <button onClick={() => queued(updateRoom(ctx, r, { active: r.active === false }), reportError)} className={ghostButton}>
                  {r.active === false ? 'Reinstate' : 'Retire'}
                </button>
                <button
                  onClick={() => removeRoom(r)}
                  onMouseLeave={() => setConfirmDelete((cur) => (cur === r.id ? null : cur))}
                  disabled={checkingId === r.id}
                  title={confirmDelete === r.id ? 'Click again to delete' : `Delete room ${r.number} — only possible if it has never been used`}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors duration-[120ms] disabled:opacity-50 ${
                    confirmDelete === r.id ? 'bg-danger text-white' : 'text-danger hover:bg-danger-tint'
                  }`}
                >
                  {checkingId === r.id ? 'Checking…' : confirmDelete === r.id ? 'Confirm' : 'Delete'}
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function StaffTab() {
  const { user } = useAuth();
  const { team, isMaster } = useProfile();
  const { ctx, teamId, staff, reportError } = useHotel();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    return onSnapshot(
      query(collection(db, 'users'), where('teamId', '==', teamId)),
      (snap) => setMembers(snap.docs.map((d) => ({ ...(d.data() as Omit<UserProfile, 'uid'>), uid: d.id }))),
      (e) => console.error('Team members subscription failed:', e)
    );
  }, [teamId]);

  if (!ctx) return null;
  const byUid = new Map(staff.map((s) => [s.uid, s]));
  const rows = [...members].sort((a, b) => profileName(a).localeCompare(profileName(b)));

  return (
    <div className="space-y-5">
      {team?.referralCode && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Team code</p>
            <p className="text-xs text-neutral-500">New staff sign in with Google and enter this code. They start as a housekeeper; change their role below.</p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(team.referralCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 font-mono text-lg tracking-[0.3em] text-invictus-crimson-bright"
          >
            {team.referralCode} {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </section>
      )}

      <ul className="space-y-1.5">
        {rows.map((m) => {
          const s = byUid.get(m.uid);
          const commander = isCommander(m);
          const self = m.uid === user?.uid;
          // You can't demote yourself (and lock yourself out); a commander is
          // always a manager by virtue of their estates rank.
          const locked = commander || (self && !isMaster);
          const role: HotelRole = commander ? 'manager' : s?.role ?? 'housekeeper';
          const active = s?.active ?? false;
          return (
            <li key={m.uid} className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3">
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                <p className="truncate text-sm font-semibold">
                  {profileName(m)} {self && <span className="text-xs font-normal text-neutral-500">(you)</span>}
                </p>
                <p className="truncate text-[11px] text-neutral-500">{m.email}</p>
              </div>
              {!s && !commander && <Pill className="border-amber-400/40 text-amber-300">No role yet</Pill>}
              {s && !active && <Pill className="border-neutral-400/30 text-neutral-500">Inactive</Pill>}
              {locked ? (
                <span className="text-xs text-neutral-400">{ROLE_LABELS[role]}{commander ? ' (team commander)' : ''}</span>
              ) : (
                <>
                  <div className="min-w-[10rem] flex-1 sm:w-40 sm:flex-none">
                    <InvictusSelect
                      compact
                      value={s ? role : ''}
                      onChange={(v) => v && queued(setStaffRole(ctx, { uid: m.uid, name: profileName(m) }, v as HotelRole, true, !s), reportError)}
                      options={[...(s ? [] : [{ value: '', label: 'Give a role…' }]), ...HOTEL_ROLES.map((r) => ({ value: r.value, label: r.label }))]}
                    />
                  </div>
                  {s && (
                    <button onClick={() => queued(setStaffRole(ctx, { uid: m.uid, name: profileName(m) }, role, !active, false), reportError)} className={ghostButton}>
                      {active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-neutral-500">
        {HOTEL_ROLES.map((r) => `${r.label}: ${r.blurb}`).join(' ')} Deactivated staff keep their history but lose access to the hub.
      </p>
    </div>
  );
}

function ChecklistsTab() {
  const { ctx, checklists, reportError } = useHotel();
  const [type, setType] = useState<CleanType>('departure');
  const [items, setItems] = useState<ChecklistItem[]>(checklists[type]);
  const [newItem, setNewItem] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => setItems(checklists[type]), [type, checklists]);
  if (!ctx) return null;
  const dirty = JSON.stringify(items) !== JSON.stringify(checklists[type]);
  const save = () => {
    queued(saveTemplate(ctx, type, items.filter((i) => i.label.trim())), reportError);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const move = (i: number, d: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-1">
        {CLEAN_TYPES.map((c) => (
          <button key={c.value} onClick={() => setType(c.value)} className={`flex-1 rounded py-2 text-xs font-semibold ${type === c.value ? 'bg-invictus-crimson-bright/20 text-neutral-100' : 'text-neutral-500'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="w-6 text-right font-mono text-xs text-neutral-500">{i + 1}</span>
            <input value={item.label} onChange={(e) => setItems((p) => p.map((x) => (x.id === item.id ? { ...x, label: e.target.value } : x)))} className={inputClass} />
            <button onClick={() => move(i, -1)} className="px-1 text-neutral-500" aria-label="Move up">↑</button>
            <button onClick={() => move(i, 1)} className="px-1 text-neutral-500" aria-label="Move down">↓</button>
            <button onClick={() => setItems((p) => p.filter((x) => x.id !== item.id))} className="text-neutral-500 hover:text-alert" aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newItem.trim()) {
              setItems((p) => [...p, { id: `${type}-${Date.now().toString(36)}`, label: newItem.trim() }]);
              setNewItem('');
            }
          }}
          placeholder="Add an item and press Enter"
          className={inputClass}
        />
      </div>
      <button onClick={save} disabled={!dirty} className={`${primaryButton} w-full py-3`}>
        {saved ? <Check className="h-4 w-4" /> : null} {saved ? 'Saved' : 'Save checklist'}
      </button>
      <p className="text-[11px] text-neutral-500">Changes apply to rooms started from now on; ticks already made stay with their room.</p>
    </div>
  );
}

function TimesTab() {
  const { ctx, settings, reportError } = useHotel();
  const [minutes, setMinutes] = useState(settings.minutes);
  const [cap, setCap] = useState(settings.shiftCapacityMinutes);
  useEffect(() => {
    setMinutes(settings.minutes);
    setCap(settings.shiftCapacityMinutes);
  }, [settings.minutes, settings.shiftCapacityMinutes]);
  if (!ctx) return null;
  const save = () =>
    queued(
      saveSettings(ctx, { minutes, shiftCapacityMinutes: cap }, `Times: dep ${minutes.departure}, stay ${minutes.stayover}, deep ${minutes.deep}, shift ${cap}`),
      reportError
    );
  return (
    <div className="max-w-md space-y-4">
      {CLEAN_TYPES.map((c) => (
        <div key={c.value} className="flex items-center gap-3">
          <Label className="mb-0 w-32">{c.label}</Label>
          <input type="number" min={1} value={minutes[c.value]} onChange={(e) => setMinutes({ ...minutes, [c.value]: Number(e.target.value) })} className={`${inputClass} w-24`} />
          <span className="text-xs text-neutral-500">minutes</span>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Label className="mb-0 w-32">Shift capacity</Label>
        <input type="number" min={30} value={cap} onChange={(e) => setCap(Number(e.target.value))} className={`${inputClass} w-24`} />
        <span className="text-xs text-neutral-500">minutes per person</span>
      </div>
      <p className="text-[11px] text-neutral-500">Used by the workload panel on Assign, which warns when someone&apos;s rooms add up to more than a shift.</p>
      <button onClick={save} className={`${primaryButton} w-full py-3`}>Save times</button>
    </div>
  );
}

function FaultsTab() {
  const { ctx, settings, reportError } = useHotel();
  const [cats, setCats] = useState(settings.faultCategories);
  const [next, setNext] = useState('');
  useEffect(() => setCats(settings.faultCategories), [settings.faultCategories]);
  if (!ctx) return null;
  const save = (list: string[]) => {
    setCats(list);
    queued(saveSettings(ctx, { faultCategories: list }, `Fault categories: ${list.join(', ')}`), reportError);
  };
  return (
    <div className="max-w-md space-y-3">
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <span key={c} className="flex items-center gap-1.5 rounded-full border border-neutral-400/30 bg-invictus-base/60 px-3 py-1 text-sm">
            {c}
            <button onClick={() => cats.length > 1 && save(cats.filter((x) => x !== c))} className="text-neutral-500 hover:text-alert" aria-label={`Remove ${c}`}>
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="New category" className={inputClass} />
        <button
          onClick={() => {
            const v = next.trim();
            if (v && !cats.some((c) => c.toLowerCase() === v.toLowerCase())) save([...cats, v]);
            setNext('');
          }}
          className={ghostButton}
        >
          Add
        </button>
      </div>
      <p className="text-[11px] text-neutral-500">Existing faults keep the category they were reported with.</p>
    </div>
  );
}

function SettingsPage() {
  const [tab, setTab] = useState<Tab>('rooms');
  const tabs = useMemo(
    () =>
      [
        { value: 'rooms', label: 'Rooms', icon: BedDouble },
        { value: 'staff', label: 'Staff', icon: Users },
        { value: 'checklists', label: 'Checklists', icon: ClipboardList },
        { value: 'times', label: 'Times', icon: Timer },
        { value: 'faults', label: 'Fault types', icon: Wrench },
      ] as const,
    []
  );
  return (
    <div className="mx-auto max-w-[1080px] px-9 py-[30px] max-md:px-4 max-md:py-5">
      <PageHeader icon={Settings} title="Settings" subtitle="Rooms, staff, checklists, time estimates and fault categories" />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-md border border-neutral-400/20 bg-invictus-base/40 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-xs font-semibold ${tab === t.value ? 'bg-invictus-crimson-bright/20 text-neutral-100' : 'text-neutral-500'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'checklists' && <ChecklistsTab />}
      {tab === 'times' && <TimesTab />}
      {tab === 'faults' && <FaultsTab />}
    </div>
  );
}

export default function HotelSettingsPage() {
  return (
    <RoleGate allow={['manager']}>
      <SettingsPage />
    </RoleGate>
  );
}

'use client';

// Assignments — pick an item of work (starting with inspections), a person
// and a date or repeating schedule, and send it. The assignee accepts or
// declines; accepting puts a matching entry straight on their personal
// Calendar (see src/lib/calendarEvents.ts), recurrence included, and links
// back to Inspections so they can actually run it when it's due. Anyone on
// the team can assign — see src/lib/assignments.ts and the firestore.rules
// assignments block for the enforced version of who sees what.

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where, arrayUnion } from 'firebase/firestore';
import {
  CalendarClock,
  Check,
  ClipboardCheck,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { InvictusSelect } from '@/components/InvictusSelect';
import { featureEnabled, profileName, type UserProfile } from '@/lib/teams';
import { ASSIGNMENT_STATUS_META, assignmentLink, type Assignment } from '@/lib/assignments';
import type { InspectionTemplate } from '@/lib/inspections';
import type { CalendarEvent, RecurrenceFreq } from '@/lib/calendarEvents';

const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

function AssignmentsPageInner() {
  const presetItem = useSearchParams().get('item');
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'assignments');

  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [roster, setRoster] = useState<UserProfile[]>([]);
  const [sent, setSent] = useState<Assignment[]>([]);
  const [received, setReceived] = useState<Assignment[]>([]);

  // ---- Form ----
  const [showForm, setShowForm] = useState(Boolean(presetItem));
  const [itemId, setItemId] = useState(presetItem ?? '');
  const [assigneeUid, setAssigneeUid] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('');
  const [freq, setFreq] = useState<RecurrenceFreq | 'none'>('none');
  const [until, setUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRetractId, setConfirmRetractId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !teamId) {
      setTemplates([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'inspectionTemplates'), where('teamId', '==', teamId)),
      (snap) => setTemplates(snap.docs.map((d) => ({ ...(d.data() as Omit<InspectionTemplate, 'id'>), id: d.id }))),
      (e) => console.error('Inspection templates subscription failed:', e)
    );
  }, [user, teamId]);

  useEffect(() => {
    if (!user || !teamId) {
      setRoster([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'users'), where('teamId', '==', teamId)),
      (snap) => setRoster(snap.docs.map((d) => ({ ...(d.data() as Omit<UserProfile, 'uid'>), uid: d.id }))),
      (e) => console.error('Roster subscription failed:', e)
    );
  }, [user, teamId]);

  useEffect(() => {
    if (!user) {
      setSent([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'assignments'), where('assignedByUid', '==', user.uid)),
      (snap) => setSent(snap.docs.map((d) => ({ ...(d.data() as Omit<Assignment, 'id'>), id: d.id }))),
      (e) => console.error('Sent assignments subscription failed:', e)
    );
  }, [user]);

  useEffect(() => {
    if (!user) {
      setReceived([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'assignments'), where('assigneeUid', '==', user.uid)),
      (snap) => setReceived(snap.docs.map((d) => ({ ...(d.data() as Omit<Assignment, 'id'>), id: d.id }))),
      (e) => console.error('Received assignments subscription failed:', e)
    );
  }, [user]);

  const resetForm = () => {
    setItemId('');
    setAssigneeUid('');
    setDate(todayStr());
    setTime('');
    setFreq('none');
    setUntil('');
    setNotes('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !teamId) {
      setFormError('You need to be in a team to assign anything.');
      return;
    }
    const template = templates.find((t) => t.id === itemId);
    const assignee = roster.find((u) => u.uid === assigneeUid);
    if (!template) {
      setFormError('Pick an inspection.');
      return;
    }
    if (!assignee) {
      setFormError('Pick who this goes to.');
      return;
    }
    if (!date) {
      setFormError('Pick a date.');
      return;
    }
    if (freq !== 'none' && !until) {
      setFormError('Pick an end date for the repeat.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const id = genId('asg');
      const a: Record<string, unknown> = {
        id,
        teamId,
        itemType: 'inspection',
        itemId: template.id,
        itemName: template.name,
        date,
        status: 'pending',
        createdAt: Date.now(),
        assignedByUid: user.uid,
        assignedByName: profileName(profile) || user.email || 'Unknown',
        assigneeUid: assignee.uid,
        assigneeName: profileName(assignee),
      };
      if (time) a.time = time;
      if (notes.trim()) a.notes = notes.trim();
      if (freq !== 'none') a.recurrence = { freq, until };
      await setDoc(doc(db, 'assignments', id), a);
      resetForm();
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create assignment:', err);
      setFormError("Couldn't send that — publish the latest Firestore rules (the assignments block) if this keeps happening.");
    } finally {
      setSaving(false);
    }
  };

  const accept = async (a: Assignment) => {
    if (!user) return;
    setBusyId(a.id);
    setActionError(null);
    try {
      const link = assignmentLink(a);
      const event: CalendarEvent = {
        id: `assign-${a.id}`,
        title: a.itemName,
        date: a.date,
        time: a.time,
        priority: 'Medium',
        notes: a.notes || `Assigned by ${a.assignedByName}`,
        recurrence: a.recurrence,
        link,
      };
      // Merge, never a bare overwrite — jarvisState also carries this
      // person's compliance countdown, which a plain setDoc would wipe.
      await setDoc(doc(db, 'jarvisState', user.uid), { events: arrayUnion(event), updatedAt: Date.now() }, { merge: true });
      await updateDoc(doc(db, 'assignments', a.id), { status: 'accepted', respondedAt: Date.now() });
    } catch (err) {
      console.error('Failed to accept assignment:', err);
      setActionError("Couldn't accept that — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (a: Assignment) => {
    setBusyId(a.id);
    setActionError(null);
    try {
      await updateDoc(doc(db, 'assignments', a.id), { status: 'declined', respondedAt: Date.now() });
    } catch (err) {
      console.error('Failed to decline assignment:', err);
      setActionError("Couldn't decline that — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const retract = async (a: Assignment) => {
    setBusyId(a.id);
    setActionError(null);
    try {
      await deleteDoc(doc(db, 'assignments', a.id));
    } catch (err) {
      console.error('Failed to retract assignment:', err);
      setActionError("Couldn't retract that — try again.");
    } finally {
      setBusyId(null);
      setConfirmRetractId(null);
    }
  };

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
        <p className="max-w-md text-sm text-neutral-500">Assignments isn&apos;t enabled for your team.</p>
      </div>
    );
  }

  if (!user) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Sign in to assign or respond to assignments.</p>
      </div>
    );
  }

  const pendingReceived = received.filter((a) => a.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  const respondedReceived = received.filter((a) => a.status !== 'pending').sort((a, b) => b.createdAt - a.createdAt);
  const sortedSent = [...sent].sort((a, b) => b.createdAt - a.createdAt);

  const rowMeta = (a: Assignment) => ASSIGNMENT_STATUS_META[a.status];

  return chrome(
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-100 sm:text-3xl">
            <Users className="h-6 w-6 text-invictus-crimson-bright" />
            Assignments
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Send an inspection to someone, one-off or repeating. Once they accept, it lands on their Calendar.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Close' : 'New Assignment'}
        </button>
      </div>

      {actionError && <p className="mb-4 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-xs text-alert">{actionError}</p>}

      {showForm && (
        <form onSubmit={submit} className="mb-8 space-y-4 border border-invictus-crimson-bright/30 bg-invictus-surface/60 p-5 shadow-glow-subtle">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Inspection</label>
              <InvictusSelect
                value={itemId}
                onChange={setItemId}
                options={[{ value: '', label: templates.length ? 'Choose one' : 'No inspections yet' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Assign to</label>
              <InvictusSelect
                value={assigneeUid}
                onChange={setAssigneeUid}
                options={[
                  { value: '', label: 'Choose someone' },
                  ...roster.filter((u) => !u.blocked && u.uid !== user.uid).map((u) => ({ value: u.uid, label: profileName(u) })),
                ]}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Time (optional)</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
                <Repeat className="h-3 w-3" /> Repeats
              </label>
              <InvictusSelect
                value={freq}
                onChange={(v) => setFreq(v as RecurrenceFreq | 'none')}
                options={[
                  { value: 'none', label: 'Does not repeat' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'fortnightly', label: 'Fortnightly' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
            </div>
            {freq !== 'none' && (
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Repeat until</label>
                <input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} className={inputClass} required />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
          </div>
          {formError && <p className="text-xs text-alert">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Sending…' : 'Send Assignment'}
          </button>
        </form>
      )}

      {pendingReceived.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <ClipboardCheck className="h-3.5 w-3.5" /> Awaiting your response ({pendingReceived.length})
          </h2>
          <div className="space-y-2">
            {pendingReceived.map((a) => {
              const busy = busyId === a.id;
              return (
                <div key={a.id} className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-100">{a.itemName}</p>
                      <p className="text-[11px] text-neutral-500">
                        {a.date}
                        {a.time ? ` · ${a.time}` : ''}
                        {a.recurrence ? ` · repeats ${a.recurrence.freq} until ${a.recurrence.until}` : ''} · from {a.assignedByName}
                      </p>
                      {a.notes && <p className="mt-1 text-xs text-neutral-400">{a.notes}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />}
                      <button
                        onClick={() => accept(a)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => decline(a)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-md border border-alert/40 bg-alert/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-alert transition-colors hover:bg-alert/20 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Decline
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
          <Users className="h-3.5 w-3.5" /> Sent by you ({sortedSent.length})
        </h2>
        <div className="space-y-1.5">
          {sortedSent.length === 0 && <p className="py-4 text-center text-xs text-neutral-600">Nothing sent yet.</p>}
          {sortedSent.map((a) => {
            const meta = rowMeta(a);
            const busy = busyId === a.id;
            const confirming = confirmRetractId === a.id;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-100">{a.itemName}</p>
                  <p className="truncate text-[11px] text-neutral-500">
                    {a.date}
                    {a.recurrence ? ` · repeats ${a.recurrence.freq}` : ''} · to {a.assigneeName}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${meta.accent}`}>{meta.label}</span>
                {a.status === 'pending' &&
                  (confirming ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => retract(a)}
                        disabled={busy}
                        className="rounded-md border border-alert/50 bg-alert/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-alert disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmRetractId(null)} className="text-[10px] text-neutral-500 hover:text-neutral-300">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRetractId(a.id)}
                      title="Retract this assignment"
                      className="shrink-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-400 transition-colors hover:border-alert/40 hover:text-alert"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      {respondedReceived.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <CalendarClock className="h-3.5 w-3.5" /> Sent to you ({respondedReceived.length})
          </h2>
          <div className="space-y-1.5">
            {respondedReceived.map((a) => {
              const meta = rowMeta(a);
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-100">{a.itemName}</p>
                    <p className="truncate text-[11px] text-neutral-500">
                      {a.date}
                      {a.recurrence ? ` · repeats ${a.recurrence.freq}` : ''} · from {a.assignedByName}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${meta.accent}`}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssignmentsPageInner />
    </Suspense>
  );
}

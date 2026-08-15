'use client';

// Incident / Near-Miss Reports — a restricted-visibility safety log,
// deliberately separate from the general Reports page. A filed report is
// locked to the master admin, whoever it gets assigned to, and (if not
// filed anonymously) the person who filed it — nobody else, not even a
// commander, sees it. Only master assigns a report or changes its status;
// see src/lib/incidents.ts and the firestore.rules incidentReports block
// for the full visibility model, enforced server-side.

import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  AlertTriangle,
  Plus,
  X,
  Loader2,
  Check,
  MapPin,
  CalendarDays,
  Clock,
  ImagePlus,
  Lock,
  EyeOff,
  UserCog,
  ShieldAlert,
  HeartPulse,
  Wrench,
  Leaf,
  HelpCircle,
  Users,
} from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { InvictusSelect } from '@/components/InvictusSelect';
import { SiteMapPicker } from '@/components/SiteMapPicker';
import { featureEnabled, profileName } from '@/lib/teams';
import {
  BODY_PARTS,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  INJURY_TYPES,
  canSeeIncident,
  incidentStatusMeta,
  incidentTypeLabel,
  type IncidentAttachment,
  type IncidentReport,
  type IncidentStatus,
  type IncidentType,
} from '@/lib/incidents';

const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

const TYPE_ICONS: Record<IncidentType, typeof AlertTriangle> = {
  nearMiss: AlertTriangle,
  injury: HeartPulse,
  propertyDamage: Wrench,
  environmental: Leaf,
  security: ShieldAlert,
  other: HelpCircle,
};

interface RosterEntry {
  uid: string;
  name: string;
  teamId?: string | null;
}

export default function IncidentsPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'incidents');

  // ---- Filing form ----
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<IncidentType>('nearMiss');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('');
  const [location, setLocation] = useState<string | null>(null);
  const [injuryType, setInjuryType] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [involvedPersons, setInvolvedPersons] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [immediateAction, setImmediateAction] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justFiled, setJustFiled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- Data ----
  const [assignedToMe, setAssignedToMe] = useState<IncidentReport[]>([]);
  const [myReports, setMyReports] = useState<IncidentReport[]>([]);
  const [allReports, setAllReports] = useState<IncidentReport[]>([]); // master only
  const [roster, setRoster] = useState<RosterEntry[]>([]); // master only, for assignment
  const [selected, setSelected] = useState<IncidentReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    if (!user) {
      setAssignedToMe([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'incidentReports'), where('assignedUid', '==', user.uid)),
      (snap) => setAssignedToMe(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<IncidentReport, 'id'>) }))),
      (error) => console.error('Assigned incident reports subscription failed:', error)
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMyReports([]);
      return;
    }
    // Mirrors the rule exactly (createdBy + anonymous==false) so the query
    // is provably scoped — see the firestore.rules incidentReports comment.
    const unsub = onSnapshot(
      query(collection(db, 'incidentReports'), where('createdBy', '==', user.uid), where('anonymous', '==', false)),
      (snap) => setMyReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<IncidentReport, 'id'>) }))),
      (error) => console.error('My incident reports subscription failed:', error)
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user || !isMaster) {
      setAllReports([]);
      setRoster([]);
      return;
    }
    const unsubAll = onSnapshot(
      collection(db, 'incidentReports'),
      (snap) => setAllReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<IncidentReport, 'id'>) }))),
      (error) => console.error('All incident reports subscription failed:', error)
    );
    const unsubRoster = onSnapshot(
      collection(db, 'users'),
      (snap) =>
        setRoster(
          snap.docs.map((d) => {
            const data = d.data() as { name?: string; displayName?: string; teamId?: string | null };
            return { uid: d.id, name: data.displayName?.trim() || data.name || 'Unknown', teamId: data.teamId ?? null };
          })
        ),
      (error) => console.error('Roster subscription failed:', error)
    );
    return () => {
      unsubAll();
      unsubRoster();
    };
  }, [user, isMaster]);

  useEffect(() => {
    setNotesDraft(selected?.investigationNotes ?? '');
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setType('nearMiss');
    setTitle('');
    setDescription('');
    setDate(todayStr());
    setTime('');
    setLocation(null);
    setInjuryType('');
    setBodyPart('');
    setInvolvedPersons('');
    setWitnesses('');
    setImmediateAction('');
    setAnonymous(false);
    setFiles([]);
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    setFiles((prev) => [...prev, ...chosen].slice(0, 6));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !teamId) {
      setFormError('You must belong to a team to file a report.');
      return;
    }
    if (!title.trim() || !description.trim() || !date) return;
    setSaving(true);
    setFormError(null);
    try {
      const id = genId('inc');
      const attachments: IncidentAttachment[] = [];
      for (const file of files) {
        const path = `incidentReports/${id}/${Date.now()}-${file.name}`;
        const r = storageRef(storage, path);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        attachments.push({ url, path, name: file.name, uploadedAt: Date.now() });
      }
      const report: Record<string, unknown> = {
        id,
        teamId,
        type,
        title: title.trim(),
        description: description.trim(),
        date,
        status: 'submitted',
        anonymous,
        createdAt: Date.now(),
      };
      if (time) report.time = time;
      if (location) report.location = location;
      if (type === 'injury') {
        if (injuryType) report.injuryType = injuryType;
        if (bodyPart) report.bodyPart = bodyPart;
      }
      if (involvedPersons.trim()) report.involvedPersons = involvedPersons.trim();
      if (witnesses.trim()) report.witnesses = witnesses.trim();
      if (immediateAction.trim()) report.immediateActionTaken = immediateAction.trim();
      if (attachments.length) report.attachments = attachments;
      if (!anonymous) {
        report.createdBy = user.uid;
        report.createdByName = profileName(profile) || user.email || 'Unknown';
      }
      await setDoc(doc(db, 'incidentReports', id), report);
      resetForm();
      setShowForm(false);
      setJustFiled(true);
      setTimeout(() => setJustFiled(false), 6000);
    } catch (e) {
      console.error('Failed to file incident report:', e);
      setFormError("Couldn't file the report — publish the latest Firestore rules (the incidentReports block) if this keeps happening.");
    } finally {
      setSaving(false);
    }
  };

  const assignTo = async (report: IncidentReport, uid: string, name: string) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'incidentReports', report.id), {
        assignedUid: uid,
        assignedName: name,
        assignedAt: Date.now(),
        // Assigning it implies someone's now looking at it.
        status: report.status === 'submitted' ? 'investigating' : report.status,
      });
    } catch (e) {
      console.error('Failed to assign report:', e);
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (report: IncidentReport) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'incidentReports', report.id), { assignedUid: null, assignedName: null, assignedAt: null });
    } catch (e) {
      console.error('Failed to unassign report:', e);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (report: IncidentReport, status: IncidentStatus) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'incidentReports', report.id), { status });
    } catch (e) {
      console.error('Failed to update status:', e);
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async (report: IncidentReport) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'incidentReports', report.id), { investigationNotes: notesDraft });
    } catch (e) {
      console.error('Failed to save investigation notes:', e);
    } finally {
      setBusy(false);
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
        <p className="max-w-md text-sm text-neutral-500">Incident Reports isn&apos;t enabled for your team.</p>
      </div>
    );
  }

  if (!user) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Sign in to file or view incident reports.</p>
      </div>
    );
  }

  const sortedAll = [...allReports].sort((a, b) => b.createdAt - a.createdAt);
  const sortedAssigned = [...assignedToMe].sort((a, b) => b.createdAt - a.createdAt);
  const sortedMine = [...myReports].sort((a, b) => b.createdAt - a.createdAt);

  const rowFor = (r: IncidentReport, opts?: { showAssignee?: boolean }) => {
    const Icon = TYPE_ICONS[r.type];
    const sm = incidentStatusMeta(r.status);
    return (
      <button
        key={r.id}
        onClick={() => setSelected(r)}
        className="flex w-full items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 text-left shadow-glow-subtle transition-colors hover:border-invictus-crimson-bright/40"
      >
        <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-neutral-100">{r.title}</p>
          <p className="truncate text-[11px] text-neutral-500">
            {incidentTypeLabel(r.type)} · {r.date}
            {r.location ? ` · ${r.location}` : ''}
            {r.anonymous ? ' · Anonymous' : r.createdByName ? ` · ${r.createdByName}` : ''}
            {opts?.showAssignee && r.assignedName ? ` · Assigned: ${r.assignedName}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${sm.accent}`}>{sm.label}</span>
      </button>
    );
  };

  return chrome(
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-100 sm:text-3xl">
            <AlertTriangle className="h-6 w-6 text-invictus-crimson-bright" />
            Incident Reports
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Report a near miss, injury or other incident. Only the master admin and whoever it&apos;s assigned to can see it.
          </p>
        </div>
        <button
          onClick={() => (showForm ? setShowForm(false) : setShowForm(true))}
          className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Close' : 'Report an Incident'}
        </button>
      </div>

      {justFiled && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
          <Check className="h-3.5 w-3.5" /> Filed. {anonymous ? 'Submitted anonymously.' : 'You can track its status below.'}
        </p>
      )}

      {/* Filing form */}
      {showForm && (
        <form onSubmit={submit} className="mb-8 space-y-4 border border-invictus-crimson-bright/30 bg-invictus-surface/60 p-5 shadow-glow-subtle">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Type</label>
              <InvictusSelect value={type} onChange={(v) => setType(v as IncidentType)} options={INCIDENT_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">What happened (short title)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Trailing cable outside Green Room" className={inputClass} required />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Time (optional)</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What happened, and anything that could help investigate it" className={inputClass} required />
          </div>

          {type === 'injury' && (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Type of injury</label>
                <InvictusSelect value={injuryType} onChange={setInjuryType} options={[{ value: '', label: 'Not specified' }, ...INJURY_TYPES.map((t) => ({ value: t, label: t }))]} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Part of the body</label>
                <InvictusSelect value={bodyPart} onChange={setBodyPart} options={[{ value: '', label: 'Not specified' }, ...BODY_PARTS.map((b) => ({ value: b, label: b }))]} />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
              <MapPin className="h-3 w-3" /> Location — tap the map
            </label>
            <SiteMapPicker value={location} onChange={(cell) => setLocation(cell.areaKey)} className="max-w-xl" />
            <p className="mt-1 text-[11px] text-neutral-500">{location ? `Selected: ${location}` : 'No location selected yet (optional).'}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Involved persons (optional)</label>
              <input value={involvedPersons} onChange={(e) => setInvolvedPersons(e.target.value)} placeholder="Names — staff, contractor or public" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Witnesses (optional)</label>
              <input value={witnesses} onChange={(e) => setWitnesses(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Immediate action taken (optional)</label>
            <textarea value={immediateAction} onChange={(e) => setImmediateAction(e.target.value)} rows={2} className={inputClass} />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
              <ImagePlus className="h-3 w-3" /> Photos (optional)
            </label>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-xs text-neutral-300 hover:border-invictus-crimson-bright/40">
              Add photos
            </button>
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-md border border-neutral-400/25 bg-invictus-base/60 px-2 py-1 text-[11px] text-neutral-400">
                    {f.name}
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, fi) => fi !== i))} className="text-neutral-500 hover:text-alert">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-start gap-2.5 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-0.5 h-4 w-4 accent-invictus-crimson-bright" />
            <span className="text-xs text-neutral-400">
              <span className="flex items-center gap-1.5 font-semibold text-neutral-200"><EyeOff className="h-3.5 w-3.5" /> Submit anonymously</span>
              Your name won&apos;t be stored on this report — not even the master admin can see who filed it. You won&apos;t be able to track its status afterwards.
            </span>
          </label>

          {formError && <p className="text-xs text-alert">{formError}</p>}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            {saving ? 'Filing…' : 'File Report'}
          </button>
        </form>
      )}

      {/* Master: every report, across every team */}
      {isMaster && (
        <div className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <UserCog className="h-3.5 w-3.5" /> All reports ({sortedAll.length})
          </h2>
          <div className="space-y-1.5">
            {sortedAll.length === 0 && <p className="py-6 text-center text-xs text-neutral-600">No incident reports filed yet.</p>}
            {sortedAll.map((r) => rowFor(r, { showAssignee: true }))}
          </div>
        </div>
      )}

      {/* Non-master: what's assigned to them */}
      {!isMaster && sortedAssigned.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <Users className="h-3.5 w-3.5" /> Assigned to you
          </h2>
          <div className="space-y-1.5">{sortedAssigned.map((r) => rowFor(r))}</div>
        </div>
      )}

      {/* Non-master: their own named submissions */}
      {!isMaster && sortedMine.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <Lock className="h-3.5 w-3.5" /> Filed by you
          </h2>
          <div className="space-y-1.5">{sortedMine.map((r) => rowFor(r))}</div>
        </div>
      )}

      {!isMaster && sortedAssigned.length === 0 && sortedMine.length === 0 && !showForm && (
        <p className="py-10 text-center text-xs text-neutral-600">
          Nothing to show — reports you file (unless anonymous) or that get assigned to you will appear here.
        </p>
      )}

      {/* Detail modal */}
      {selected && (
        <IncidentDetail
          report={selected}
          isMaster={isMaster}
          isAssignee={selected.assignedUid === user.uid}
          roster={roster.filter((m) => m.teamId === selected.teamId)}
          busy={busy}
          notesDraft={notesDraft}
          onNotesChange={setNotesDraft}
          onClose={() => setSelected(null)}
          onAssign={(uid, name) => assignTo(selected, uid, name)}
          onUnassign={() => unassign(selected)}
          onStatus={(s) => changeStatus(selected, s)}
          onSaveNotes={() => saveNotes(selected)}
        />
      )}
    </div>
  );
}

function IncidentDetail({
  report,
  isMaster,
  isAssignee,
  roster,
  busy,
  notesDraft,
  onNotesChange,
  onClose,
  onAssign,
  onUnassign,
  onStatus,
  onSaveNotes,
}: {
  report: IncidentReport;
  isMaster: boolean;
  isAssignee: boolean;
  roster: RosterEntry[];
  busy: boolean;
  notesDraft: string;
  onNotesChange: (v: string) => void;
  onClose: () => void;
  onAssign: (uid: string, name: string) => void;
  onUnassign: () => void;
  onStatus: (s: IncidentStatus) => void;
  onSaveNotes: () => void;
}) {
  const Icon = TYPE_ICONS[report.type];
  const sm = incidentStatusMeta(report.status);
  // Investigation notes are internal working notes for master/assignee, not
  // shown back to whoever filed the report even if they can see the report
  // itself (a named filer's own "Filed by you" view stops here).
  const canManage = isMaster;
  const canSeeNotes = isMaster || isAssignee;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto border border-invictus-crimson-bright/40 bg-invictus-base/95 p-6 shadow-glow-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 text-neutral-500 transition-colors hover:text-neutral-200" title="Close">
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${sm.accent}`}>
            {sm.label}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-neutral-500">
            <Icon className="h-3.5 w-3.5" /> {incidentTypeLabel(report.type)}
          </span>
        </div>
        <h3 className="mt-2 pr-6 text-lg font-semibold text-neutral-100">{report.title}</h3>

        <div className="mt-3 space-y-2 text-sm text-neutral-300">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-neutral-500" /> {report.date}
            {report.time && (
              <>
                <Clock className="ml-2 h-3.5 w-3.5 text-neutral-500" /> {report.time}
              </>
            )}
          </div>
          {report.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-neutral-500" /> {report.location}
            </div>
          )}
          <div className="flex items-center gap-2 text-neutral-500">
            {report.anonymous ? <EyeOff className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {report.anonymous ? 'Filed anonymously' : `Filed by ${report.createdByName ?? 'Unknown'}`}
          </div>
        </div>

        <p className="mt-3 whitespace-pre-wrap rounded-md border border-neutral-400/20 bg-invictus-base/60 p-3 text-sm text-neutral-200">{report.description}</p>

        {report.type === 'injury' && (report.injuryType || report.bodyPart) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
            {report.injuryType && <span className="rounded-md border border-neutral-400/25 bg-invictus-base/60 px-2 py-1">Injury: {report.injuryType}</span>}
            {report.bodyPart && <span className="rounded-md border border-neutral-400/25 bg-invictus-base/60 px-2 py-1">Body part: {report.bodyPart}</span>}
          </div>
        )}
        {report.involvedPersons && (
          <p className="mt-2 text-xs text-neutral-400"><span className="text-neutral-500">Involved: </span>{report.involvedPersons}</p>
        )}
        {report.witnesses && (
          <p className="mt-1 text-xs text-neutral-400"><span className="text-neutral-500">Witnesses: </span>{report.witnesses}</p>
        )}
        {report.immediateActionTaken && (
          <p className="mt-1 text-xs text-neutral-400"><span className="text-neutral-500">Immediate action: </span>{report.immediateActionTaken}</p>
        )}

        {(report.attachments?.length ?? 0) > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {report.attachments!.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={a.path} href={a.url} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-md border border-neutral-400/25">
                <img src={a.url} alt={a.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </a>
            ))}
          </div>
        )}

        {canManage && (
          <div className="mt-5 space-y-3 border-t border-neutral-400/20 pt-4">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Assigned to</label>
              <div className="flex items-center gap-2">
                <InvictusSelect
                  value={report.assignedUid ?? ''}
                  onChange={(v) => {
                    if (!v) onUnassign();
                    else {
                      const m = roster.find((r) => r.uid === v);
                      if (m) onAssign(m.uid, m.name);
                    }
                  }}
                  options={[{ value: '', label: 'Unassigned' }, ...roster.map((m) => ({ value: m.uid, label: m.name }))]}
                />
                {busy && <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Status</label>
              <div className="flex flex-wrap gap-2">
                {INCIDENT_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => onStatus(s.value)}
                    disabled={busy}
                    className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-all disabled:opacity-50 ${
                      report.status === s.value ? s.accent : 'border-neutral-400/30 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {canSeeNotes && (
          <div className="mt-4 space-y-1.5">
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500">Investigation notes {!canManage && '(read-only)'}</label>
            <textarea
              value={notesDraft}
              onChange={(e) => onNotesChange(e.target.value)}
              readOnly={!canManage}
              rows={3}
              placeholder={canManage ? 'Internal notes — not visible to whoever filed this' : 'No notes yet.'}
              className={inputClass}
            />
            {canManage && (
              <button
                onClick={onSaveNotes}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save notes
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

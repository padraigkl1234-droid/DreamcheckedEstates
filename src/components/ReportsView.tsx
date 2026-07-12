'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  FileText,
  Plus,
  Search,
  X,
  Loader2,
  ImagePlus,
  Trash2,
  Download,
  CalendarDays,
  Clock,
  MapPin,
  LinkIcon,
  Lock,
  Users,
} from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { InvictusSelect } from '@/components/InvictusSelect';
import { isCommander, profileName } from '@/lib/teams';
import {
  REPORT_CATEGORIES,
  REPORT_OUTCOMES,
  REPORT_VISIBILITIES,
  canSeeReport,
  outcomeMeta,
  type Report,
  type ReportAttachment,
  type ReportOutcome,
  type ReportVisibility,
} from '@/lib/reports';

export interface ReportTaskRef {
  id: string;
  name: string;
}

export interface ReportDraft {
  taskId?: string;
  taskName?: string;
  title?: string;
}

const genId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `r_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

export function ReportsView({
  tasks,
  initialDraft,
  onDraftConsumed,
}: {
  tasks: ReportTaskRef[];
  initialDraft?: ReportDraft | null;
  onDraftConsumed?: () => void;
}) {
  const { user } = useAuth();
  const { profile, isMaster } = useProfile();
  const teamId = profile?.teamId ?? null;
  const amCommander = isCommander(profile) || isMaster;

  const [reports, setReports] = useState<Report[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters.
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | ReportOutcome>('all');

  // Form fields.
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('');
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0]);
  const [outcome, setOutcome] = useState<ReportOutcome>('pass');
  const [area, setArea] = useState('');
  const [visibility, setVisibility] = useState<ReportVisibility>('command');
  const [description, setDescription] = useState('');
  const [linkedTaskId, setLinkedTaskId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Live reports for this team. Firestore rules aren't filters: a member can
  // only be *allowed* to query docs the rules guarantee they can read, so we
  // branch — commanders/master read the whole team; everyone else reads
  // team-wide reports plus their own, as two queries, then merge.
  useEffect(() => {
    if (!user || !teamId) {
      setReports([]);
      return;
    }
    const sink = (docs: Report[]) => docs;
    if (amCommander) {
      const q = query(collection(db, 'reports'), where('teamId', '==', teamId));
      return onSnapshot(
        q,
        (snap) => setReports(snap.docs.map((d) => ({ ...(d.data() as Omit<Report, 'id'>), id: d.id }))),
        (e) => console.error('Reports subscription failed:', e)
      );
    }
    // Member / viewer: team-wide + own, merged.
    const map = new Map<string, Report>();
    const emit = () => setReports(sink(Array.from(map.values())));
    const qTeam = query(
      collection(db, 'reports'),
      where('teamId', '==', teamId),
      where('visibility', '==', 'team')
    );
    const qMine = query(collection(db, 'reports'), where('createdBy', '==', user.uid));
    const unsubA = onSnapshot(
      qTeam,
      (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === 'removed') map.delete(c.doc.id);
          else map.set(c.doc.id, { ...(c.doc.data() as Omit<Report, 'id'>), id: c.doc.id });
        });
        emit();
      },
      (e) => console.error('Reports (team) subscription failed:', e)
    );
    const unsubB = onSnapshot(
      qMine,
      (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === 'removed') map.delete(c.doc.id);
          else map.set(c.doc.id, { ...(c.doc.data() as Omit<Report, 'id'>), id: c.doc.id });
        });
        emit();
      },
      (e) => console.error('Reports (mine) subscription failed:', e)
    );
    return () => {
      unsubA();
      unsubB();
    };
  }, [user, teamId, amCommander]);

  // Open the form pre-filled when asked to file against a specific task.
  useEffect(() => {
    if (!initialDraft) return;
    setLinkedTaskId(initialDraft.taskId ?? '');
    setTitle(initialDraft.title ?? '');
    setShowForm(true);
    onDraftConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);

  const resetForm = () => {
    setTitle('');
    setDate(todayStr());
    setTime('');
    setCategory(REPORT_CATEGORIES[0]);
    setOutcome('pass');
    setArea('');
    setVisibility('command');
    setDescription('');
    setLinkedTaskId('');
    setFiles([]);
  };

  const visible = useMemo(
    () =>
      reports
        .filter((r) => canSeeReport(r, profile, isMaster))
        .filter((r) => outcomeFilter === 'all' || r.outcome === outcomeFilter)
        .filter((r) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          return (
            r.title.toLowerCase().includes(q) ||
            (r.description ?? '').toLowerCase().includes(q) ||
            (r.createdByName ?? '').toLowerCase().includes(q)
          );
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [reports, profile, isMaster, outcomeFilter, search]
  );

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    setFiles((prev) => [...prev, ...chosen].slice(0, 8));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !teamId) {
      setError('You must belong to a team to file a report.');
      return;
    }
    if (!title.trim() || !date) return;
    setSaving(true);
    setError(null);
    try {
      const id = genId();
      // Upload any attachments under this report's folder.
      const attachments: ReportAttachment[] = [];
      for (const file of files) {
        const path = `reports/${id}/${Date.now()}-${file.name}`;
        const r = storageRef(storage, path);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        attachments.push({ url, path, name: file.name, uploadedAt: Date.now() });
      }
      const linked = tasks.find((t) => t.id === linkedTaskId);
      const report: Report = {
        id,
        title: title.trim(),
        date,
        ...(time ? { time } : {}),
        description: description.trim(),
        category,
        outcome,
        ...(area.trim() ? { area: area.trim() } : {}),
        visibility,
        taskId: linked?.id ?? null,
        taskName: linked?.name ?? null,
        teamId,
        createdBy: user.uid,
        createdByName: profileName(profile) || user.displayName || user.email || 'Unknown',
        createdAt: Date.now(),
        ...(attachments.length ? { attachments } : {}),
      };
      await setDoc(doc(db, 'reports', id), report);
      // If this backs a task, ping the task owner that a report was filed.
      if (report.taskId) {
        try {
          const token = await user.getIdToken();
          fetch('/api/notify/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ taskId: report.taskId, reportTitle: report.title }),
          }).catch(() => {});
        } catch {
          /* best-effort */
        }
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      console.error('Failed to file report:', err);
      setError('Could not file the report — check your connection and Storage rules.');
    } finally {
      setSaving(false);
    }
  };

  const canDelete = (r: Report) => r.createdBy === user?.uid || amCommander;

  const removeReport = async (r: Report) => {
    if (!canDelete(r)) return;
    try {
      for (const a of r.attachments ?? []) {
        await deleteObject(storageRef(storage, a.path)).catch(() => {});
      }
      await deleteDoc(doc(db, 'reports', r.id));
      setSelected(null);
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  const exportPdf = async (r: Report) => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const crimson: [number, number, number] = [194, 48, 74];
    let y = 48;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...crimson);
    pdf.text('INVICTUS — Report', 40, y);
    y += 24;
    pdf.setFontSize(13);
    pdf.setTextColor(30, 30, 30);
    pdf.text(r.title, 40, y);
    y += 20;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(90, 90, 90);
    const meta = [
      `Date: ${r.date}${r.time ? ` ${r.time}` : ''}`,
      `Category: ${r.category ?? '—'}`,
      `Outcome: ${outcomeMeta(r.outcome).label}`,
      r.area ? `Location: ${r.area}` : '',
      r.taskName ? `Linked task: ${r.taskName}` : '',
      `Filed by: ${r.createdByName}`,
      `Visibility: ${r.visibility === 'team' ? 'Team-wide' : 'Command only'}`,
    ].filter(Boolean);
    meta.forEach((line) => {
      pdf.text(line, 40, y);
      y += 16;
    });
    y += 8;
    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(11);
    pdf.text('Description', 40, y);
    y += 16;
    pdf.setFontSize(10);
    pdf.setTextColor(60, 60, 60);
    const lines = pdf.splitTextToSize(r.description || '—', 515);
    pdf.text(lines, 40, y);
    if (r.attachments?.length) {
      y += lines.length * 14 + 12;
      pdf.setTextColor(90, 90, 90);
      pdf.text(`${r.attachments.length} attachment(s) — view in app.`, 40, y);
    }
    pdf.save(`invictus-report-${r.date}-${r.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pdf`);
  };

  return (
    <div className="space-y-5">
      {/* Header + New Report */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-invictus-crimson-bright" />
          <h2 className="font-display text-lg uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            Reports
          </h2>
          <span className="rounded-full border border-neutral-400/30 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
            {visible.length}
          </span>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Close' : 'New Report'}
        </button>
      </div>

      {/* New Report form */}
      {showForm && (
        <form onSubmit={submit} className="space-y-3 border border-invictus-crimson-bright/30 bg-invictus-surface/60 p-5 shadow-glow-subtle">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Job title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rooftop HVAC inspection" className={inputClass} required />
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
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Category</label>
              <InvictusSelect value={category} onChange={setCategory} options={REPORT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Location / area (optional)</label>
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Scenic Stage" className={inputClass} />
            </div>
          </div>

          {/* Outcome */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Outcome</label>
            <div className="flex flex-wrap gap-2">
              {REPORT_OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-all ${
                    outcome === o.value ? o.accent : 'border-neutral-400/30 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visibility */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Who can see this</label>
            <div className="flex flex-wrap gap-2">
              {REPORT_VISIBILITIES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVisibility(v.value)}
                  title={v.blurb}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-all ${
                    visibility === v.value
                      ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100'
                      : 'border-neutral-400/30 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {v.value === 'command' ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Linked task */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Linked task (optional)</label>
            <InvictusSelect
              value={linkedTaskId}
              onChange={setLinkedTaskId}
              options={[{ value: '', label: 'No task — standalone report' }, ...tasks.map((t) => ({ value: t.id, label: t.name }))]}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What was done, what you found, any follow-up needed…"
              className={`${inputClass} resize-y`}
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Photos / files (optional)</label>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
            >
              <ImagePlus className="h-3.5 w-3.5" /> Add photos
            </button>
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={i} className="flex items-center gap-1.5 rounded border border-neutral-400/25 bg-invictus-base/60 px-2 py-1 text-[11px] text-neutral-300">
                    {f.name}
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-alert">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-alert">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {saving ? 'Filing…' : 'File Report'}
          </button>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="w-52 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-1.5 pl-8 pr-3 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
        </div>
        <div className="flex overflow-hidden rounded-md border border-neutral-400/30">
          {(['all', 'pass', 'followup', 'fail'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setOutcomeFilter(k)}
              className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                outcomeFilter === k ? 'bg-invictus-crimson-bright/20 text-invictus-crimson-bright' : 'bg-invictus-base/60 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {k === 'all' ? 'All' : k === 'followup' ? 'Follow-up' : k}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="py-10 text-center text-xs text-neutral-600">No reports yet. File one to start the log.</p>
        )}
        {visible.map((r) => {
          const om = outcomeMeta(r.outcome);
          return (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="flex w-full items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 text-left shadow-glow-subtle transition-colors hover:border-invictus-crimson-bright/40"
            >
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${om.accent}`}>{om.label}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-100">{r.title}</p>
                <p className="truncate text-[11px] text-neutral-500">
                  {r.date}{r.time ? ` · ${r.time}` : ''} · {r.createdByName}
                  {r.category ? ` · ${r.category}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-neutral-500">
                {r.taskId && <LinkIcon className="h-3.5 w-3.5" />}
                {r.visibility === 'command' ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                {(r.attachments?.length ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px]"><ImagePlus className="h-3 w-3" />{r.attachments!.length}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto border border-invictus-crimson-bright/40 bg-invictus-base/95 p-6 shadow-glow-strong" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="absolute right-3 top-3 text-neutral-500 transition-colors hover:text-neutral-200" title="Close">
              <X className="h-4 w-4" />
            </button>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${outcomeMeta(selected.outcome).accent}`}>
              {outcomeMeta(selected.outcome).label}
            </span>
            <h3 className="mt-2 pr-6 text-lg font-semibold text-neutral-100">{selected.title}</h3>

            <div className="mt-3 space-y-2 text-sm text-neutral-300">
              <div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-neutral-500" /> {selected.date}{selected.time ? <><Clock className="ml-2 h-3.5 w-3.5 text-neutral-500" /> {selected.time}</> : null}</div>
              {selected.area && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-neutral-500" /> {selected.area}</div>}
              {selected.taskName && (
                <div className="flex items-center gap-2 text-invictus-crimson-bright"><LinkIcon className="h-3.5 w-3.5" /> Backs task: {selected.taskName}</div>
              )}
              <div className="flex items-center gap-2 text-neutral-500">
                {selected.visibility === 'command' ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                {selected.visibility === 'command' ? 'Command only' : 'Team-wide'} · {selected.category ?? '—'}
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap rounded-md border border-neutral-400/20 bg-invictus-base/60 p-3 text-sm text-neutral-200">
              {selected.description || 'No description.'}
            </p>

            {(selected.attachments?.length ?? 0) > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {selected.attachments!.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={a.path} href={a.url} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-md border border-neutral-400/25">
                    <img src={a.url} alt={a.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  </a>
                ))}
              </div>
            )}

            <p className="mt-3 text-[11px] text-neutral-500">Filed by {selected.createdByName} · {new Date(selected.createdAt).toLocaleString('en-GB')}</p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => exportPdf(selected)}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 py-2 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright transition-colors hover:bg-invictus-crimson-bright/20"
              >
                <Download className="h-3.5 w-3.5" /> Export PDF
              </button>
              {canDelete(selected) && (
                <button
                  onClick={() => removeReport(selected)}
                  className="flex items-center justify-center gap-2 rounded-md border border-alert/40 bg-alert/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-alert transition-colors hover:bg-alert/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

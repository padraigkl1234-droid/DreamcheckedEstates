'use client';

// Inspections — checklists defined once and run against the estate as often as
// needed. Running one files a Report (category "Inspection") carrying the
// per-item results, so an inspection inherits everything reports already do:
// team visibility, the reports log, and PDF export.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, type QuerySnapshot } from 'firebase/firestore';
import { ClipboardCheck, Plus, Trash2, X, Loader2, ChevronDown, Play, Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { featureEnabled, isCommander, profileName } from '@/lib/teams';
import {
  INSPECTION_OUTCOMES,
  INSPECTION_OUTCOME_STYLES,
  STARTER_TEMPLATES,
  countByOutcome,
  overallOutcome,
  summarise,
  type InspectionOutcome,
  type InspectionResult,
  type InspectionTemplate,
} from '@/lib/inspections';
import type { Report, ReportVisibility } from '@/lib/reports';

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

const genId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const byNewest = (a: Report, b: Report) => (b.createdAt ?? 0) - (a.createdAt ?? 0);

export default function InspectionsPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'inspections');
  const amCommander = isCommander(profile) || isMaster;

  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [recent, setRecent] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Builder state.
  const [showBuilder, setShowBuilder] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // The run-an-inspection sheet.
  const [running, setRunning] = useState<InspectionTemplate | null>(null);

  useEffect(() => {
    if (!user || !teamId) {
      setTemplates([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'inspectionTemplates'), where('teamId', '==', teamId)),
      (snap) =>
        setTemplates(
          snap.docs
            .map((d) => ({ ...(d.data() as Omit<InspectionTemplate, 'id'>), id: d.id }))
            .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        ),
      (e) => {
        console.error('Inspection templates subscription failed:', e);
        setError('Could not load inspections — the database rules may not allow it yet.');
      }
    );
  }, [user, teamId]);

  // The inspections already filed, so the page shows its own history rather
  // than sending people to Reports to find out whether this month's is done.
  // Rules aren't filters, so — as in ReportsView — commanders read the whole
  // team while everyone else reads team-wide plus their own, merged.
  useEffect(() => {
    if (!user || !teamId) {
      setRecent([]);
      return;
    }
    const isInspection = (r: Report) => Boolean(r.inspection);
    if (amCommander) {
      return onSnapshot(
        query(collection(db, 'reports'), where('teamId', '==', teamId), where('category', '==', 'Inspection')),
        (snap) => setRecent(snap.docs.map((d) => ({ ...(d.data() as Omit<Report, 'id'>), id: d.id })).filter(isInspection).sort(byNewest)),
        (e) => console.error('Filed inspections subscription failed:', e)
      );
    }
    const map = new Map<string, Report>();
    const emit = () => setRecent(Array.from(map.values()).filter(isInspection).sort(byNewest));
    const absorb = (snap: QuerySnapshot) => {
      snap.docChanges().forEach((c) => {
        if (c.type === 'removed') map.delete(c.doc.id);
        else map.set(c.doc.id, { ...(c.doc.data() as Omit<Report, 'id'>), id: c.doc.id });
      });
      emit();
    };
    const unsubA = onSnapshot(
      query(
        collection(db, 'reports'),
        where('teamId', '==', teamId),
        where('category', '==', 'Inspection'),
        where('visibility', '==', 'team')
      ),
      absorb,
      (e) => console.error('Filed inspections (team) subscription failed:', e)
    );
    const unsubB = onSnapshot(
      query(collection(db, 'reports'), where('createdBy', '==', user.uid), where('category', '==', 'Inspection')),
      absorb,
      (e) => console.error('Filed inspections (mine) subscription failed:', e)
    );
    return () => {
      unsubA();
      unsubB();
    };
  }, [user, teamId, amCommander]);

  const lastRunByTemplate = useMemo(() => {
    const map = new Map<string, Report>();
    // `recent` is newest-first, so the first hit per template is the latest.
    for (const r of recent) {
      const key = r.inspection?.templateId;
      if (key && !map.has(key)) map.set(key, r);
    }
    return map;
  }, [recent]);

  const resetBuilder = () => {
    setName('');
    setDescription('');
    setItemsText('');
  };

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !teamId) {
      setError('You need to be in a team to create an inspection.');
      return;
    }
    const items = itemsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim()) {
      setError('Give the inspection a name.');
      return;
    }
    if (!items.length) {
      setError('Add at least one thing to check — one per line.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = genId('insp');
      const template: InspectionTemplate = {
        id,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        items,
        teamId,
        createdAt: Date.now(),
        createdBy: user.uid,
      };
      await setDoc(doc(db, 'inspectionTemplates', id), template);
      resetBuilder();
      setShowBuilder(false);
    } catch (err) {
      console.error('Failed to save inspection template:', err);
      setError('Save failed — check your connection and that the database rules allow it.');
    } finally {
      setSaving(false);
    }
  };

  const addStarter = async (starter: (typeof STARTER_TEMPLATES)[number]) => {
    if (!user || !teamId) return;
    const id = genId('insp');
    try {
      await setDoc(doc(db, 'inspectionTemplates', id), {
        id,
        name: starter.name,
        description: starter.description,
        items: starter.items,
        teamId,
        createdAt: Date.now(),
        createdBy: user.uid,
      } satisfies InspectionTemplate);
    } catch (err) {
      console.error('Failed to add starter inspection:', err);
      setError('Save failed — check your connection and that the database rules allow it.');
    }
  };

  const removeTemplate = async (t: InspectionTemplate) => {
    if (confirmDeleteId !== t.id) {
      setConfirmDeleteId(t.id);
      return;
    }
    setConfirmDeleteId(null);
    // Filed reports are left alone — deleting the checklist shouldn't erase
    // the record of the inspections already carried out with it.
    await deleteDoc(doc(db, 'inspectionTemplates', t.id)).catch((err) =>
      console.error('Failed to delete inspection template:', err)
    );
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
        <p className="max-w-md text-sm text-neutral-500">Inspections isn&apos;t enabled for your team.</p>
      </div>
    );
  }

  const unusedStarters = STARTER_TEMPLATES.filter(
    (s) => !templates.some((t) => t.name.trim().toLowerCase() === s.name.trim().toLowerCase())
  );

  return chrome(
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-100 sm:text-3xl">
            <ClipboardCheck className="h-6 w-6 text-invictus-crimson-bright" />
            Inspections
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Run a checklist and it files itself as a report — exportable as a PDF from Reports.
          </p>
        </div>
        {user && (
          <button
            onClick={() => setShowBuilder((s) => !s)}
            className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
          >
            {showBuilder ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showBuilder ? 'Close' : 'New inspection'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-xs text-alert">{error}</p>}

      {showBuilder && (
        <form
          onSubmit={saveTemplate}
          className="mb-8 space-y-3 rounded-2xl border border-invictus-crimson-bright/30 bg-invictus-surface/60 p-5 shadow-glow-subtle"
        >
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fire Door Inspection" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this inspection covers"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">
              Things to check — one per line
            </label>
            <textarea
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              rows={8}
              placeholder={'Door closes fully from any open position\nSelf-closing device works and is undamaged\nSignage present and legible on both sides'}
              className={`${inputClass} resize-y font-mono text-[13px]`}
            />
            <p className="mt-1 text-[11px] text-neutral-600">
              {itemsText.split('\n').filter((s) => s.trim()).length} item(s)
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save inspection'}
          </button>
        </form>
      )}

      {/* Templates */}
      <div className="space-y-2">
        {templates.length === 0 && (
          <p className="py-8 text-center text-xs text-neutral-600">
            No inspections yet. Build one, or start from a ready-made checklist below.
          </p>
        )}
        {templates.map((t) => {
          const isOpen = expanded === t.id;
          const last = lastRunByTemplate.get(t.id);
          return (
            <section key={t.id} className="overflow-hidden rounded-xl border border-neutral-400/20 bg-invictus-surface/60">
              <div className="flex items-center gap-2 p-4">
                <button
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-100">{t.name}</p>
                    <p className="truncate text-[11px] text-neutral-500">
                      {t.items.length} check{t.items.length === 1 ? '' : 's'}
                      {last
                        ? ` · last run ${last.date} — ${last.outcome === 'fail' ? 'failed' : 'passed'}`
                        : ' · never run'}
                    </p>
                  </div>
                </button>
                {user && (
                  <>
                    <button
                      onClick={() => setRunning(t)}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright transition-colors hover:bg-invictus-crimson-bright/20"
                    >
                      <Play className="h-3 w-3" /> Run
                    </button>
                    <button
                      onClick={() => removeTemplate(t)}
                      onMouseLeave={() => setConfirmDeleteId((cur) => (cur === t.id ? null : cur))}
                      title={confirmDeleteId === t.id ? 'Click again to delete' : `Delete ${t.name}`}
                      className={`shrink-0 rounded-md border px-2 py-1.5 transition-colors ${
                        confirmDeleteId === t.id
                          ? 'border-alert/70 bg-alert/20 text-alert'
                          : 'border-neutral-400/20 bg-invictus-base text-neutral-500 hover:border-alert/50 hover:text-alert'
                      }`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              {isOpen && (
                <div className="border-t border-neutral-400/15 px-5 py-3">
                  {t.description && <p className="mb-2 text-xs text-neutral-500">{t.description}</p>}
                  <ol className="list-decimal space-y-1 pl-5 text-[13px] text-neutral-300">
                    {t.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Starter checklists */}
      {user && unusedStarters.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <Sparkles className="h-3.5 w-3.5" /> Ready-made
          </p>
          <div className="flex flex-wrap gap-2">
            {unusedStarters.map((s) => (
              <button
                key={s.name}
                onClick={() => addStarter(s)}
                title={s.description}
                className="flex items-center gap-1.5 rounded-md border border-neutral-400/25 bg-invictus-surface/60 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
              >
                <Plus className="h-3 w-3" /> {s.name}
                <span className="text-neutral-600">({s.items.length})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filed inspections */}
      {recent.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-2 text-[10px] uppercase tracking-widest text-neutral-500">Filed inspections</h2>
          <div className="space-y-1.5">
            {recent.slice(0, 12).map((r) => {
              const counts = countByOutcome(r.inspection?.results ?? []);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 px-3 py-2 text-sm"
                >
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
                      r.outcome === 'fail'
                        ? 'border-alert/50 bg-alert/10 text-alert'
                        : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                    }`}
                  >
                    {r.outcome === 'fail' ? 'Fail' : 'Pass'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{r.title}</span>
                  <span className="shrink-0 text-[11px] text-neutral-500">
                    {counts.pass}/{(r.inspection?.results ?? []).length} passed · {r.date}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            Open any of these in Reports to add photos or export it as a PDF.
          </p>
        </div>
      )}

      {running && (
        <RunInspection
          template={running}
          onClose={() => setRunning(null)}
          filedBy={profileName(profile) || user?.displayName || user?.email || 'Unknown'}
          uid={user?.uid ?? ''}
          teamId={teamId ?? ''}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The run sheet: walk the checklist, then file it as a report.
// ---------------------------------------------------------------------------

function RunInspection({
  template,
  onClose,
  filedBy,
  uid,
  teamId,
}: {
  template: InspectionTemplate;
  onClose: () => void;
  filedBy: string;
  uid: string;
  teamId: string;
}) {
  // Everything starts as a pass — an inspection is normally a walk-round where
  // you only stop to record the exceptions.
  const [results, setResults] = useState<InspectionResult[]>(
    template.items.map((item) => ({ item, result: 'pass' as InspectionOutcome }))
  );
  const [date, setDate] = useState(todayStr());
  const [area, setArea] = useState('');
  const [visibility, setVisibility] = useState<ReportVisibility>('team');
  const [extraNotes, setExtraNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const setAt = (i: number, patch: Partial<InspectionResult>) =>
    setResults((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const counts = countByOutcome(results);

  const file = async () => {
    if (!uid || !teamId) {
      setError('You need to be signed in and in a team to file an inspection.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = genId('r');
      const cleaned: InspectionResult[] = results.map((r) => ({
        item: r.item,
        result: r.result,
        ...(r.note?.trim() ? { note: r.note.trim() } : {}),
      }));
      const report: Report = {
        id,
        title: `${template.name} — ${new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
        })}`,
        date,
        description: [summarise(cleaned), extraNotes.trim()].filter(Boolean).join('\n\n'),
        category: 'Inspection',
        outcome: overallOutcome(cleaned),
        ...(area.trim() ? { area: area.trim() } : {}),
        visibility,
        taskId: null,
        taskName: null,
        teamId,
        createdBy: uid,
        createdByName: filedBy,
        createdAt: Date.now(),
        inspection: { templateId: template.id, templateName: template.name, results: cleaned },
      };
      await setDoc(doc(db, 'reports', id), report);
      setDone(true);
    } catch (err) {
      console.error('Failed to file inspection:', err);
      setError('Could not file the inspection — check your connection and the database rules.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto border border-invictus-crimson-bright/40 bg-invictus-base/95 p-6 shadow-glow-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 text-neutral-500 transition-colors hover:text-neutral-200" title="Close">
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <div className="py-8 text-center">
            <h3 className="text-lg font-semibold text-neutral-100">Inspection filed</h3>
            <p className="mt-2 text-sm text-neutral-500">
              It&apos;s in Reports now — open it there to attach photos or export the PDF.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 transition-colors hover:bg-invictus-crimson-bright/20"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 className="pr-6 text-lg font-semibold text-neutral-100">{template.name}</h3>
            {template.description && <p className="mt-1 text-xs text-neutral-500">{template.description}</p>}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Location (optional)</label>
                <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Scenic Stage" className={inputClass} />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {results.map((r, i) => (
                <div key={i} className="rounded-md border border-neutral-400/20 bg-invictus-surface/50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm text-neutral-200">
                      <span className="mr-1.5 font-mono text-[11px] text-neutral-600">{i + 1}.</span>
                      {r.item}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      {INSPECTION_OUTCOMES.map((o) => (
                        <button
                          key={o.value}
                          onClick={() => setAt(i, { result: o.value })}
                          className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest transition-all ${
                            r.result === o.value
                              ? INSPECTION_OUTCOME_STYLES[o.value]
                              : 'border-neutral-400/25 text-neutral-600 hover:text-neutral-300'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* A note is only asked for where it matters — a failure. */}
                  {r.result === 'fail' && (
                    <input
                      value={r.note ?? ''}
                      onChange={(e) => setAt(i, { note: e.target.value })}
                      placeholder="What's wrong with it?"
                      className={`${inputClass} mt-2`}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Extra notes (optional)</label>
              <textarea
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                rows={3}
                placeholder="Anything the checklist doesn't cover…"
                className={`${inputClass} resize-y`}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">Who can see this</span>
              {(['team', 'command'] as ReportVisibility[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-all ${
                    visibility === v
                      ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100'
                      : 'border-neutral-400/30 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {v === 'team' ? 'Team-wide' : 'Command only'}
                </button>
              ))}
            </div>

            {error && <p className="mt-3 text-xs text-alert">{error}</p>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-400/20 pt-4">
              <p className="text-xs text-neutral-500">
                {counts.pass} pass · <span className={counts.fail ? 'text-alert' : ''}>{counts.fail} fail</span> · {counts.na} n/a
              </p>
              <button
                onClick={file}
                disabled={saving}
                className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                {saving ? 'Filing…' : 'File as report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

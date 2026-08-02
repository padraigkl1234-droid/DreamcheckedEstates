'use client';

// Inspections — checklists defined once and run against the estate as often as
// needed. A checklist is a list of questions (pass/fail, choice, text, number,
// date, time, photo), built much like a Microsoft Form. Running one files a
// Report (category "Inspection") carrying every answer, so an inspection
// inherits everything reports already do: team visibility, the reports log,
// attachments and PDF export.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, type QuerySnapshot } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  ClipboardCheck,
  Plus,
  Trash2,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Play,
  Sparkles,
  Copy,
  Pencil,
  ImagePlus,
  MessageSquare,
  Asterisk,
  Tag,
  CalendarClock,
  Users,
} from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { InvictusSelect } from '@/components/InvictusSelect';
import { featureEnabled, isCommander, profileName, type UserProfile } from '@/lib/teams';
import { DAY_LABELS } from '@/lib/automations';
import {
  INSPECTION_OUTCOMES,
  INSPECTION_OUTCOME_STYLES,
  MAX_DAY_OF_MONTH,
  QUESTION_TYPES,
  RECURRENCE_LABELS,
  STARTER_TEMPLATES,
  blankAnswers,
  blankQuestion,
  countByOutcome,
  isUnanswered,
  newQuestionId,
  ordinal,
  overallOutcome,
  recordAnswers,
  scheduleSummary,
  summarise,
  templateQuestions,
  type InspectionAnswer,
  type InspectionOutcome,
  type InspectionPhoto,
  type InspectionQuestion,
  type InspectionQuestionType,
  type InspectionSchedule,
  type InspectionTemplate,
  type RecurrenceFrequency,
} from '@/lib/inspections';
import type { Report, ReportAttachment, ReportVisibility } from '@/lib/reports';

const NEW_GROUP = '__new_group__';
const UNGROUPED = 'Ungrouped';

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const byNewest = (a: Report, b: Report) => (b.createdAt ?? 0) - (a.createdAt ?? 0);

// Publishing the Firestore rules is a manual step in the Firebase Console, so
// say so rather than leaving a bare "something went wrong".
const RULES_HINT =
  "Can't reach inspections — publish the latest Firestore rules (the inspectionTemplates block) in the Firebase Console, then reload.";

export default function InspectionsPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'inspections');
  const amCommander = isCommander(profile) || isMaster;

  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [recent, setRecent] = useState<Report[]>([]);
  const [roster, setRoster] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState<InspectionTemplate | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState<InspectionTemplate | null>(null);
  // Collapsed groups only — new groups (and the first visit) default open.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !teamId) {
      setTemplates([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'inspectionTemplates'), where('teamId', '==', teamId)),
      (snap) => {
        setError(null);
        setTemplates(
          snap.docs
            .map((d) => ({ ...(d.data() as Omit<InspectionTemplate, 'id'>), id: d.id }))
            .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        );
      },
      (e) => {
        console.error('Inspection templates subscription failed:', e);
        setError(RULES_HINT);
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
    const absorb = (snap: QuerySnapshot) => {
      snap.docChanges().forEach((c) => {
        if (c.type === 'removed') map.delete(c.doc.id);
        else map.set(c.doc.id, { ...(c.doc.data() as Omit<Report, 'id'>), id: c.doc.id });
      });
      setRecent(Array.from(map.values()).filter(isInspection).sort(byNewest));
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

  // The team roster, for the assignee picker — who a due inspection raises a
  // task for.
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

  const lastRunByTemplate = useMemo(() => {
    const map = new Map<string, Report>();
    // `recent` is newest-first, so the first hit per template is the latest.
    for (const r of recent) {
      const key = r.inspection?.templateId;
      if (key && !map.has(key)) map.set(key, r);
    }
    return map;
  }, [recent]);

  const openBuilder = (template: InspectionTemplate | null) => {
    setEditing(template);
    setShowBuilder(true);
  };

  const saveTemplate = async (draft: {
    name: string;
    description: string;
    group: string;
    questions: InspectionQuestion[];
    schedule: InspectionSchedule;
    assigneeUids: string[];
    assigneeNames: string[];
  }) => {
    if (!user || !teamId) throw new Error('You need to be in a team to create an inspection.');
    const id = editing?.id ?? genId('insp');
    await setDoc(doc(db, 'inspectionTemplates', id), {
      id,
      name: draft.name,
      ...(draft.description ? { description: draft.description } : {}),
      ...(draft.group ? { group: draft.group } : {}),
      questions: draft.questions,
      schedule: draft.schedule,
      assigneeUids: draft.assigneeUids,
      assigneeNames: draft.assigneeNames,
      teamId,
      createdAt: editing?.createdAt ?? Date.now(),
      createdBy: editing?.createdBy ?? user.uid,
    } satisfies InspectionTemplate);
    setShowBuilder(false);
    setEditing(null);
  };

  const addStarter = async (starter: (typeof STARTER_TEMPLATES)[number]) => {
    if (!user || !teamId) return;
    const id = genId('insp');
    try {
      await setDoc(doc(db, 'inspectionTemplates', id), {
        id,
        name: starter.name,
        description: starter.description,
        group: starter.group,
        questions: starter.questions.map((q) => ({ ...q, id: newQuestionId() })),
        teamId,
        createdAt: Date.now(),
        createdBy: user.uid,
      } satisfies InspectionTemplate);
    } catch (err) {
      console.error('Failed to add starter inspection:', err);
      setError(RULES_HINT);
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

  // Templates bucketed by group — named groups alphabetically, then anything
  // without one last, so a team can organise its list (e.g. "H&S", "Estates")
  // without being forced to pick a group at all.
  const groups: { name: string; items: InspectionTemplate[] }[] = (() => {
    const map = new Map<string, InspectionTemplate[]>();
    for (const t of templates) {
      const key = t.group?.trim() || UNGROUPED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    const names = Array.from(map.keys())
      .filter((n) => n !== UNGROUPED)
      .sort((a, b) => a.localeCompare(b));
    if (map.has(UNGROUPED)) names.push(UNGROUPED);
    return names.map((name) => ({ name, items: map.get(name)! }));
  })();

  const existingGroups = Array.from(
    new Set(templates.map((t) => t.group?.trim()).filter((g): g is string => Boolean(g)))
  ).sort();

  const toggleGroup = (name: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return chrome(
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-100 sm:text-3xl">
            <ClipboardCheck className="h-6 w-6 text-invictus-crimson-bright" />
            Inspections
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Build a set of questions, run it, and it files itself as a report — exportable as a PDF from Reports.
          </p>
        </div>
        {user && (
          <button
            onClick={() => (showBuilder ? (setShowBuilder(false), setEditing(null)) : openBuilder(null))}
            className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
          >
            {showBuilder ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showBuilder ? 'Close' : 'New inspection'}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">{error}</p>
      )}

      {showBuilder && (
        <TemplateBuilder
          key={editing?.id ?? 'new'}
          template={editing}
          existingGroups={existingGroups}
          roster={roster}
          onCancel={() => {
            setShowBuilder(false);
            setEditing(null);
          }}
          onSave={saveTemplate}
        />
      )}

      {/* Templates, bucketed by group */}
      <div className="space-y-5">
        {templates.length === 0 && !showBuilder && (
          <p className="py-8 text-center text-xs text-neutral-600">
            No inspections yet. Build one, or start from a ready-made checklist below.
          </p>
        )}
        {groups.map((g) => {
          const isGroupOpen = !collapsedGroups.has(g.name);
          return (
            <div key={g.name}>
              <button onClick={() => toggleGroup(g.name)} className="mb-2 flex w-full items-center gap-2 text-left">
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${isGroupOpen ? '' : '-rotate-90'}`} />
                <Tag className="h-3 w-3 shrink-0 text-neutral-600" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{g.name}</span>
                <span className="rounded-full border border-neutral-400/25 px-1.5 py-0.5 text-[9px] text-neutral-500">{g.items.length}</span>
                <span className="h-px flex-1 bg-neutral-400/15" />
              </button>
              {isGroupOpen && (
                <div className="space-y-2">
                  {g.items.map((t) => {
                    const isOpen = expanded === t.id;
                    const last = lastRunByTemplate.get(t.id);
                    const questions = templateQuestions(t);
                    const schedule = scheduleSummary(t.schedule, DAY_LABELS);
                    return (
                      <section key={t.id} className="overflow-hidden rounded-xl border border-neutral-400/20 bg-invictus-surface/60">
                        <div className="flex flex-wrap items-center gap-2 p-4">
                          <button
                            onClick={() => setExpanded(isOpen ? null : t.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            aria-expanded={isOpen}
                          >
                            <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-neutral-100">{t.name}</p>
                              <p className="truncate text-[11px] text-neutral-500">
                                {questions.length} question{questions.length === 1 ? '' : 's'}
                                {last ? ` · last run ${last.date} — ${last.outcome === 'fail' ? 'failed' : 'passed'}` : ' · never run'}
                              </p>
                              {(schedule || !!t.assigneeNames?.length) && (
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-600">
                                  {schedule && (
                                    <span className="flex items-center gap-1">
                                      <CalendarClock className="h-3 w-3" /> {schedule}
                                    </span>
                                  )}
                                  {!!t.assigneeNames?.length && (
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" /> {t.assigneeNames.join(', ')}
                                    </span>
                                  )}
                                </p>
                              )}
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
                                onClick={() => openBuilder(t)}
                                title={`Edit ${t.name}`}
                                className="shrink-0 rounded-md border border-neutral-400/20 bg-invictus-base px-2 py-1.5 text-neutral-500 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
                              >
                                <Pencil className="h-3 w-3" />
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
                            <ol className="space-y-1.5 text-[13px] text-neutral-300">
                              {questions.map((q, i) => (
                                <li key={q.id} className="flex flex-wrap items-baseline gap-2">
                                  <span className="font-mono text-[11px] text-neutral-600">{i + 1}.</span>
                                  <span>{q.label || <span className="italic text-neutral-600">Untitled question</span>}</span>
                                  <span className="rounded-full border border-neutral-400/25 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-neutral-500">
                                    {QUESTION_TYPES.find((x) => x.value === q.type)?.label ?? q.type}
                                  </span>
                                  {q.required && <span className="text-[10px] text-alert">required</span>}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
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
                <span className="text-neutral-600">({s.questions.length})</span>
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
              const counts = countByOutcome(recordAnswers(r.inspection!));
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
                    {counts.graded ? `${counts.pass}/${counts.graded} passed · ` : ''}
                    {r.date}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            Open any of these in Reports to see every answer, or export it as a PDF.
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
// The builder: a question list you can add to, retype, reorder and edit.
// ---------------------------------------------------------------------------

function TemplateBuilder({
  template,
  existingGroups,
  roster,
  onCancel,
  onSave,
}: {
  template: InspectionTemplate | null;
  existingGroups: string[];
  roster: UserProfile[];
  onCancel: () => void;
  onSave: (draft: {
    name: string;
    description: string;
    group: string;
    questions: InspectionQuestion[];
    schedule: InspectionSchedule;
    assigneeUids: string[];
    assigneeNames: string[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [questions, setQuestions] = useState<InspectionQuestion[]>(
    template ? templateQuestions(template).map((q) => ({ ...q })) : [blankQuestion()]
  );
  const [groupChoice, setGroupChoice] = useState(template?.group?.trim() || '');
  const [newGroupName, setNewGroupName] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(template?.schedule?.frequency ?? 'none');
  const [dayOfWeek, setDayOfWeek] = useState(template?.schedule?.dayOfWeek ?? 1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(template?.schedule?.dayOfMonth ?? 1);
  const [assigneeUids, setAssigneeUids] = useState<string[]>(template?.assigneeUids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAssignee = (uid: string) =>
    setAssigneeUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));

  const patch = (id: string, changes: Partial<InspectionQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...changes } : q)));

  const move = (index: number, delta: number) =>
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const duplicate = (index: number) =>
    setQuestions((prev) => {
      const copy = { ...prev[index], id: newQuestionId() };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });

  const remove = (id: string) => setQuestions((prev) => prev.filter((q) => q.id !== id));

  // Switching type carries what still applies and drops what doesn't (a text
  // question has no options; a photo question needs no separate photo toggle).
  const retype = (id: string, type: InspectionQuestionType) =>
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              type,
              options: type === 'choice' ? (q.options?.length ? q.options : ['Option 1', 'Option 2']) : undefined,
              allowPhoto: type === 'photo' ? undefined : q.allowPhoto,
            }
          : q
      )
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = questions
      .map((q) => ({
        ...q,
        label: q.label.trim(),
        ...(q.type === 'choice'
          ? { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }
          : { options: undefined }),
      }))
      .filter((q) => q.label);
    if (!name.trim()) {
      setError('Give the inspection a name.');
      return;
    }
    if (!cleaned.length) {
      setError('Add at least one question.');
      return;
    }
    const badChoice = cleaned.find((q) => q.type === 'choice' && (q.options?.length ?? 0) < 2);
    if (badChoice) {
      setError(`"${badChoice.label}" needs at least two options.`);
      return;
    }
    if (frequency !== 'none' && !assigneeUids.length) {
      setError('Pick at least one person for the schedule to raise a task for, or set it back to Manual only.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Firestore rejects undefined, so strip the optional keys that aren't set.
      const stripped = cleaned.map((q) =>
        Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== false))
      ) as unknown as InspectionQuestion[];
      const group = groupChoice === NEW_GROUP ? newGroupName.trim() : groupChoice;
      const schedule: InspectionSchedule =
        frequency === 'weekly'
          ? { frequency, dayOfWeek }
          : frequency === 'monthly'
            ? { frequency, dayOfMonth }
            : { frequency: 'none' };
      const chosen = roster.filter((u) => assigneeUids.includes(u.uid));
      await onSave({
        name: name.trim(),
        description: description.trim(),
        group,
        questions: stripped,
        schedule,
        assigneeUids: chosen.map((u) => u.uid),
        assigneeNames: chosen.map((u) => profileName(u)),
      });
    } catch (err) {
      console.error('Failed to save inspection template:', err);
      setError(`Save failed — ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mb-8 space-y-4 rounded-2xl border border-invictus-crimson-bright/30 bg-invictus-surface/60 p-5 shadow-glow-subtle"
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
      <div className="sm:w-64">
        <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Group (optional)</label>
        <InvictusSelect
          value={groupChoice}
          onChange={setGroupChoice}
          className="bg-invictus-base/60"
          options={[
            { value: '', label: 'Ungrouped' },
            ...existingGroups.map((g) => ({ value: g, label: g })),
            { value: NEW_GROUP, label: '+ New group…' },
          ]}
        />
        {groupChoice === NEW_GROUP && (
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New group name (e.g. H&S)"
            className={`${inputClass} mt-2`}
          />
        )}
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-neutral-400/20 bg-invictus-base/50 p-4">
            <div className="flex items-start gap-2">
              <span className="mt-2.5 font-mono text-[11px] text-neutral-600">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={q.label}
                  onChange={(e) => patch(q.id, { label: e.target.value })}
                  placeholder="Question"
                  className={`${inputClass} text-[15px]`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-44">
                    <InvictusSelect
                      value={q.type}
                      onChange={(v) => retype(q.id, v as InspectionQuestionType)}
                      compact
                      className="bg-invictus-surface/60"
                      options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                    />
                  </div>
                  <Toggle on={!!q.required} onClick={() => patch(q.id, { required: !q.required })} icon={Asterisk} label="Required" />
                  {q.type !== 'photo' && (
                    <Toggle on={!!q.allowPhoto} onClick={() => patch(q.id, { allowPhoto: !q.allowPhoto })} icon={ImagePlus} label="Photo" />
                  )}
                  <Toggle on={!!q.allowNote} onClick={() => patch(q.id, { allowNote: !q.allowNote })} icon={MessageSquare} label="Note" />
                </div>

                {q.type === 'choice' && (
                  <div className="space-y-1.5 rounded-lg border border-neutral-400/15 bg-invictus-surface/40 p-2.5">
                    {(q.options ?? []).map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full border border-neutral-400/40" />
                        <input
                          value={opt}
                          onChange={(e) =>
                            patch(q.id, { options: (q.options ?? []).map((o, j) => (j === oi ? e.target.value : o)) })
                          }
                          className="min-w-0 flex-1 border-b border-neutral-400/20 bg-transparent px-1 py-1 text-sm text-neutral-200 focus:border-invictus-crimson-bright focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => patch(q.id, { options: (q.options ?? []).filter((_, j) => j !== oi) })}
                          className="text-neutral-600 transition-colors hover:text-alert"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => patch(q.id, { options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`] })}
                      className="flex items-center gap-1 text-[11px] text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
                    >
                      <Plus className="h-3 w-3" /> Add option
                    </button>
                  </div>
                )}

                <input
                  value={q.help ?? ''}
                  onChange={(e) => patch(q.id, { help: e.target.value })}
                  placeholder="Guidance for whoever runs it (optional)"
                  className="w-full border-b border-neutral-400/15 bg-transparent px-1 py-1 text-[11px] text-neutral-400 placeholder:text-neutral-700 focus:border-invictus-crimson-bright/50 focus:outline-none"
                />
              </div>
              {/* 2×2 so the button column never stands taller than the
                  question it belongs to. */}
              <div className="grid shrink-0 grid-cols-2 gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" className={iconBtn}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} title="Move down" className={iconBtn}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => duplicate(i)} title="Duplicate" className={iconBtn}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(q.id)}
                  title="Delete question"
                  className={`${iconBtn} hover:border-alert/50 hover:text-alert`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add a question of any type, straight from the type list. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-neutral-600">Add</span>
        {QUESTION_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            title={t.blurb}
            onClick={() => setQuestions((prev) => [...prev, blankQuestion(t.value)])}
            className="flex items-center gap-1 rounded-md border border-neutral-400/25 bg-invictus-base/60 px-2.5 py-1.5 text-[11px] text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
          >
            <Plus className="h-3 w-3" /> {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-400/20 bg-invictus-base/40 p-4">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
          <CalendarClock className="h-3.5 w-3.5" /> Recurring schedule (optional)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(RECURRENCE_LABELS) as RecurrenceFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                frequency === f
                  ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100'
                  : 'border-neutral-400/25 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {RECURRENCE_LABELS[f]}
            </button>
          ))}
        </div>

        {frequency === 'weekly' && (
          <div className="w-48">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Day</label>
            <InvictusSelect
              value={String(dayOfWeek)}
              onChange={(v) => setDayOfWeek(Number(v))}
              className="bg-invictus-surface/60"
              options={DAY_LABELS.map((label, i) => ({ value: String(i), label }))}
            />
          </div>
        )}
        {frequency === 'monthly' && (
          <div className="w-48">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-neutral-500">Day of month</label>
            <InvictusSelect
              value={String(dayOfMonth)}
              onChange={(v) => setDayOfMonth(Number(v))}
              className="bg-invictus-surface/60"
              // Capped at the 28th so the job never skips a February.
              options={Array.from({ length: MAX_DAY_OF_MONTH }, (_, i) => ({ value: String(i + 1), label: ordinal(i + 1) }))}
            />
          </div>
        )}

        {frequency !== 'none' && (
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
              <Users className="h-3 w-3" /> Goes to — first person owns it, the rest are offered it
            </label>
            <div className="flex flex-wrap gap-1.5">
              {roster
                .filter((u) => !u.blocked)
                .map((u) => {
                  const on = assigneeUids.includes(u.uid);
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => toggleAssignee(u.uid)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        on
                          ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/15 text-invictus-crimson-bright'
                          : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400 hover:text-neutral-200'
                      }`}
                      title={u.email ?? undefined}
                    >
                      {profileName(u)}
                    </button>
                  );
                })}
              {roster.length === 0 && <p className="text-xs text-neutral-600">No people found.</p>}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-alert">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {saving ? 'Saving…' : template ? 'Save changes' : 'Save inspection'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-400/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-neutral-500 transition-colors hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const iconBtn =
  'rounded-md border border-neutral-400/20 bg-invictus-base/60 p-1.5 text-neutral-500 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-30 disabled:hover:border-neutral-400/20 disabled:hover:text-neutral-500';

function Toggle({
  on,
  onClick,
  icon: Icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof ImagePlus;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
        on
          ? 'border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 text-invictus-crimson-bright'
          : 'border-neutral-400/25 text-neutral-600 hover:text-neutral-300'
      }`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The run sheet: answer the questions, then file it as a report.
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
  const questions = useMemo(() => templateQuestions(template), [template]);
  // The report id is fixed up front so photos can be uploaded into its folder
  // as they're taken, before the report itself is written.
  const [reportId] = useState(() => genId('r'));
  const [answers, setAnswers] = useState<InspectionAnswer[]>(() => blankAnswers(questions));
  const [date, setDate] = useState(todayStr());
  const [area, setArea] = useState('');
  const [visibility, setVisibility] = useState<ReportVisibility>('team');
  const [extraNotes, setExtraNotes] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const setAt = (i: number, patch: Partial<InspectionAnswer>) =>
    setAnswers((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const counts = countByOutcome(answers);

  const addPhotos = async (i: number, files: File[]) => {
    if (!files.length) return;
    setUploading(answers[i].questionId);
    setError(null);
    try {
      const added: InspectionPhoto[] = [];
      for (const file of files) {
        const path = `reports/${reportId}/${Date.now()}-${file.name}`;
        const r = storageRef(storage, path);
        await uploadBytes(r, file);
        added.push({ url: await getDownloadURL(r), path, name: file.name });
      }
      setAnswers((prev) => prev.map((a, j) => (j === i ? { ...a, photos: [...(a.photos ?? []), ...added] } : a)));
    } catch (err) {
      console.error('Photo upload failed:', err);
      setError('That photo would not upload — check your connection and the Storage rules.');
    } finally {
      setUploading(null);
    }
  };

  const file = async () => {
    if (!uid || !teamId) {
      setError('You need to be signed in and in a team to file an inspection.');
      return;
    }
    const missing = questions.find((q, i) => q.required && isUnanswered(q, answers[i]));
    if (missing) {
      setError(`"${missing.label}" needs an answer.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Firestore rejects undefined, so only carry the keys that hold a value.
      const cleaned: InspectionAnswer[] = answers.map((a) => ({
        questionId: a.questionId,
        label: a.label,
        type: a.type,
        ...(a.outcome ? { outcome: a.outcome } : {}),
        ...(a.value?.trim() ? { value: a.value.trim() } : {}),
        ...(a.note?.trim() ? { note: a.note.trim() } : {}),
        ...(a.photos?.length ? { photos: a.photos } : {}),
      }));
      // Every photo also joins the report's own attachments, so it shows in the
      // Reports gallery and is cleaned up when the report is deleted.
      const attachments: ReportAttachment[] = cleaned.flatMap((a) =>
        (a.photos ?? []).map((p) => ({ url: p.url, path: p.path, name: p.name, uploadedAt: Date.now() }))
      );
      const report: Report = {
        id: reportId,
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
        ...(attachments.length ? { attachments } : {}),
        inspection: { templateId: template.id, templateName: template.name, answers: cleaned },
      };
      await setDoc(doc(db, 'reports', reportId), report);
      setDone(true);
    } catch (err) {
      console.error('Failed to file inspection:', err);
      setError(`Could not file the inspection — ${(err as Error).message}`);
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
              It&apos;s in Reports now — open it there to see every answer or export the PDF.
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
              {questions.map((q, i) => {
                const a = answers[i];
                // A note is always offered on a failure, whether or not the
                // question asked for one — that's when it matters most.
                const showNote = q.allowNote || a?.outcome === 'fail';
                return (
                  <div key={q.id} className="rounded-md border border-neutral-400/20 bg-invictus-surface/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-neutral-200">
                          <span className="mr-1.5 font-mono text-[11px] text-neutral-600">{i + 1}.</span>
                          {q.label}
                          {q.required && <span className="ml-1 text-alert">*</span>}
                        </p>
                        {q.help && <p className="mt-0.5 pl-5 text-[11px] text-neutral-600">{q.help}</p>}
                      </div>
                      {q.type === 'passFail' && (
                        <div className="flex shrink-0 gap-1">
                          {INSPECTION_OUTCOMES.map((o) => (
                            <button
                              key={o.value}
                              onClick={() => setAt(i, { outcome: o.value as InspectionOutcome })}
                              className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest transition-all ${
                                a?.outcome === o.value
                                  ? INSPECTION_OUTCOME_STYLES[o.value]
                                  : 'border-neutral-400/25 text-neutral-600 hover:text-neutral-300'
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* The answer control for everything that isn't pass/fail. */}
                    {q.type === 'choice' && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(q.options ?? []).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setAt(i, { value: a?.value === opt ? '' : opt })}
                            className={`rounded-md border px-3 py-1.5 text-[11px] transition-colors ${
                              a?.value === opt
                                ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100'
                                : 'border-neutral-400/25 text-neutral-400 hover:text-neutral-200'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                    {q.type === 'text' && (
                      <input value={a?.value ?? ''} onChange={(e) => setAt(i, { value: e.target.value })} className={`${inputClass} mt-2`} />
                    )}
                    {q.type === 'longText' && (
                      <textarea
                        value={a?.value ?? ''}
                        onChange={(e) => setAt(i, { value: e.target.value })}
                        rows={3}
                        className={`${inputClass} mt-2 resize-y`}
                      />
                    )}
                    {(q.type === 'number' || q.type === 'date' || q.type === 'time') && (
                      <input
                        type={q.type === 'number' ? 'number' : q.type}
                        value={a?.value ?? ''}
                        onChange={(e) => setAt(i, { value: e.target.value })}
                        className={`${inputClass} mt-2 sm:w-56`}
                      />
                    )}

                    {(q.type === 'photo' || q.allowPhoto) && (
                      <PhotoPicker
                        photos={a?.photos ?? []}
                        busy={uploading === q.id}
                        onAdd={(files) => addPhotos(i, files)}
                        onRemove={(path) => setAt(i, { photos: (a?.photos ?? []).filter((p) => p.path !== path) })}
                      />
                    )}

                    {showNote && (
                      <input
                        value={a?.note ?? ''}
                        onChange={(e) => setAt(i, { note: e.target.value })}
                        placeholder={a?.outcome === 'fail' ? "What's wrong with it?" : 'Note'}
                        className={`${inputClass} mt-2`}
                      />
                    )}
                  </div>
                );
              })}
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
                {counts.graded > 0 && (
                  <>
                    {counts.pass} pass · <span className={counts.fail ? 'text-alert' : ''}>{counts.fail} fail</span> · {counts.na} n/a
                  </>
                )}
              </p>
              <button
                onClick={file}
                disabled={saving || !!uploading}
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

function PhotoPicker({
  photos,
  busy,
  onAdd,
  onRemove,
}: {
  photos: InspectionPhoto[];
  busy: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (path: string) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="mt-2">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = '';
          onAdd(chosen);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-neutral-400/25 bg-invictus-base/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
          {busy ? 'Uploading…' : 'Add photo'}
        </button>
        {photos.map((p) => (
          <span key={p.path} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.name} className="h-12 w-12 rounded border border-neutral-400/25 object-cover" />
            <button
              type="button"
              onClick={() => onRemove(p.path)}
              title="Remove"
              className="absolute -right-1.5 -top-1.5 rounded-full border border-neutral-400/40 bg-invictus-base p-0.5 text-neutral-400 hover:text-alert"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

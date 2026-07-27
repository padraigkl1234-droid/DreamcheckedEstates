'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Check, Loader2, Play, Plus, Trash2, X, Zap } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { InvictusSelect } from '@/components/InvictusSelect';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { db } from '@/lib/firebase';
import type { Team } from '@/lib/teams';
import {
  AUTOMATION_TYPE_LABELS,
  DAY_LABELS,
  RECIPIENT_LABELS,
  automationDigestEmails,
  type Automation,
  type AutomationRecipients,
} from '@/lib/automations';

export default function AutomationsPage() {
  const { user } = useAuth();
  const { isMaster } = useProfile();

  const [teams, setTeams] = useState<Team[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationBusyId, setAutomationBusyId] = useState<string | null>(null);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [newDay, setNewDay] = useState(5); // Friday
  const [newRecipients, setNewRecipients] = useState<AutomationRecipients>('both');
  const [newTeamId, setNewTeamId] = useState(''); // '' = every team
  const [newDigestEmails, setNewDigestEmails] = useState<string[]>([MASTER_ADMIN_EMAIL]);
  const [newEmailDraft, setNewEmailDraft] = useState('');
  const [rowEmailDraft, setRowEmailDraft] = useState<Record<string, string>>({});

  const addNewDigestEmail = () => {
    const email = newEmailDraft.trim();
    if (!email) return;
    setNewDigestEmails((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setNewEmailDraft('');
  };
  const removeNewDigestEmail = (email: string) => setNewDigestEmails((prev) => prev.filter((e) => e !== email));

  // Automations config (master-only, per the Firestore rule). This is a small
  // scheduled-jobs library — see src/lib/automations.ts and
  // src/lib/automationHandlers for how each automation type actually runs.
  useEffect(() => {
    if (!isMaster) {
      setAutomations([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'automations'), orderBy('createdAt', 'desc')),
      (snap) => setAutomations(snap.docs.map((d) => ({ ...(d.data() as Omit<Automation, 'id'>), id: d.id }))),
      (error) => console.error('Automations subscription failed:', error)
    );
    return unsub;
  }, [isMaster]);

  // Teams list, just for the scope dropdown below.
  useEffect(() => {
    if (!isMaster) {
      setTeams([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'teams'),
      (snap) => setTeams(snap.docs.map((d) => ({ ...(d.data() as Omit<Team, 'id'>), id: d.id }))),
      (error) => console.error('Teams subscription failed:', error)
    );
    return unsub;
  }, [isMaster]);

  const createWeeklyReportAutomation = async () => {
    // Fold in whatever's still sitting in the text box (typed but never
    // committed with Enter/+) so it's never silently dropped.
    const draft = newEmailDraft.trim();
    const emails = draft && !newDigestEmails.includes(draft) ? [...newDigestEmails, draft] : newDigestEmails;
    const team = newTeamId ? teams.find((t) => t.id === newTeamId) : undefined;
    await addDoc(collection(db, 'automations'), {
      name: 'Weekly completed-tasks report',
      type: 'weeklyReport',
      enabled: true,
      dayOfWeek: newDay,
      recipients: newRecipients,
      teamId: newTeamId || null,
      teamName: team?.name ?? null,
      digestEmails: emails.length ? emails : [MASTER_ADMIN_EMAIL],
      createdAt: Date.now(),
    });
    setNewDigestEmails([MASTER_ADMIN_EMAIL]);
    setNewEmailDraft('');
    setNewTeamId('');
  };

  const toggleAutomation = (a: Automation) => updateDoc(doc(db, 'automations', a.id), { enabled: !a.enabled });
  const deleteAutomation = (id: string) => deleteDoc(doc(db, 'automations', id));

  // Both writes also clear the legacy singular `digestEmail` field so an
  // automation created before multi-recipient support migrates cleanly the
  // first time its recipient list is touched.
  const addDigestEmail = (a: Automation, rawEmail: string) => {
    const email = rawEmail.trim();
    if (!email) return;
    const current = automationDigestEmails(a);
    if (current.includes(email)) return;
    return updateDoc(doc(db, 'automations', a.id), { digestEmails: [...current, email], digestEmail: deleteField() });
  };
  const removeDigestEmail = (a: Automation, email: string) => {
    const current = automationDigestEmails(a).filter((e) => e !== email);
    return updateDoc(doc(db, 'automations', a.id), { digestEmails: current, digestEmail: deleteField() });
  };

  const runAutomationNow = async (id: string) => {
    if (!user) return;
    setAutomationBusyId(id);
    setAutomationMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/automations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      setAutomationMessage((data as { detail?: string }).detail || 'Done.');
    } catch (e) {
      setAutomationMessage(`Failed: ${(e as Error).message}`);
    } finally {
      setAutomationBusyId(null);
    }
  };

  if (!isMaster) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3 bg-invictus-base text-neutral-500">
        <p className="text-xs uppercase tracking-widest">Master admin only.</p>
        <Link href="/jarvis-tracker" className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <Link href="/master" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Master Console
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <Zap className="h-8 w-8 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
              Automations
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              {automations.length} configured
            </p>
          </div>
        </div>

        <div className="border border-neutral-400/25 bg-invictus-surface/60 shadow-glow-subtle">
          {automationMessage && <p className="border-b border-neutral-400/15 px-4 py-2 text-xs text-neutral-400">{automationMessage}</p>}

          <div className="divide-y divide-neutral-400/10">
            {automations.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm text-neutral-100">{a.name}</p>
                    <span className="rounded-full border border-neutral-400/25 bg-invictus-base/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-neutral-500">
                      {AUTOMATION_TYPE_LABELS[a.type]}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Runs {DAY_LABELS[a.dayOfWeek]}s (~17:00 UTC) · {a.teamName || 'All teams'} · {RECIPIENT_LABELS[a.recipients]}
                    {a.lastRunAt ? ` · last ran ${new Date(a.lastRunAt).toLocaleString()}` : ' · never run yet'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {automationDigestEmails(a).map((email) => (
                      <span
                        key={email}
                        className="flex items-center gap-1 rounded-full border border-neutral-400/25 bg-invictus-base/60 px-2 py-0.5 text-[10px] text-neutral-300"
                      >
                        {email}
                        <button onClick={() => removeDigestEmail(a, email)} className="text-neutral-500 hover:text-alert" title="Remove this email">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={rowEmailDraft[a.id] ?? ''}
                      onChange={(e) => setRowEmailDraft((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addDigestEmail(a, rowEmailDraft[a.id] ?? '');
                          setRowEmailDraft((prev) => ({ ...prev, [a.id]: '' }));
                        }
                      }}
                      onBlur={() => {
                        if (!(rowEmailDraft[a.id] ?? '').trim()) return;
                        addDigestEmail(a, rowEmailDraft[a.id] ?? '');
                        setRowEmailDraft((prev) => ({ ...prev, [a.id]: '' }));
                      }}
                      placeholder="add email…"
                      className="w-28 rounded-full border border-neutral-400/20 bg-transparent px-2 py-0.5 text-[10px] text-neutral-300 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        addDigestEmail(a, rowEmailDraft[a.id] ?? '');
                        setRowEmailDraft((prev) => ({ ...prev, [a.id]: '' }));
                      }}
                      className="rounded-full border border-neutral-400/25 bg-invictus-base/60 p-1 text-neutral-400 hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
                      title="Add this email"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => runAutomationNow(a.id)}
                    disabled={automationBusyId === a.id}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-40"
                    title="Run this automation now, regardless of schedule"
                  >
                    {automationBusyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Run now
                  </button>
                  <button
                    onClick={() => toggleAutomation(a)}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                      a.enabled
                        ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20'
                        : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {a.enabled ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {a.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => deleteAutomation(a.id)}
                    className="rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-colors hover:bg-alert/20"
                    title="Delete this automation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {automations.length === 0 && <p className="px-4 py-6 text-center text-xs text-neutral-600">No automations configured yet.</p>}
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-neutral-400/15 p-4">
            <div className="w-40">
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Day</label>
              <InvictusSelect
                value={String(newDay)}
                onChange={(v) => setNewDay(Number(v))}
                className="bg-invictus-base/60"
                options={DAY_LABELS.map((label, i) => ({ value: String(i), label }))}
              />
            </div>
            <div className="w-48">
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Team</label>
              <InvictusSelect
                value={newTeamId}
                onChange={setNewTeamId}
                className="bg-invictus-base/60"
                options={[{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
              />
            </div>
            <div className="w-56">
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Recipients</label>
              <InvictusSelect
                value={newRecipients}
                onChange={(v) => setNewRecipients(v as AutomationRecipients)}
                className="bg-invictus-base/60"
                options={Object.entries(RECIPIENT_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <div className="min-w-[16rem] flex-1">
              <label className="mb-1 block text-[9px] uppercase tracking-widest text-neutral-600">Digest emails</label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2 py-1.5">
                {newDigestEmails.map((email) => (
                  <span
                    key={email}
                    className="flex items-center gap-1 rounded-full border border-neutral-400/25 bg-invictus-surface px-2 py-0.5 text-[10px] text-neutral-300"
                  >
                    {email}
                    <button onClick={() => removeNewDigestEmail(email)} className="text-neutral-500 hover:text-alert" title="Remove this email">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  value={newEmailDraft}
                  onChange={(e) => setNewEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addNewDigestEmail();
                    }
                  }}
                  onBlur={addNewDigestEmail}
                  placeholder="add email…"
                  className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                />
                <button
                  onClick={addNewDigestEmail}
                  className="rounded-full border border-neutral-400/25 bg-invictus-surface p-1 text-neutral-400 hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
                  title="Add this email"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
            <button
              onClick={createWeeklyReportAutomation}
              className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
            >
              <Plus className="h-4 w-4" /> Add weekly report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

// Compliance (manager and maintenance). Recurring checks with a frequency,
// assignee and due date — overdue ones first and in red — preloadable with a
// UK hotel starter set. Completing a check records who, when, the result,
// notes and an optional photo (plus readings for water temperatures and the
// auto-listed rooms for the weekly flush), rolls the due date forward, and a
// fail can raise a fault. The log filters by date and check type and exports
// to PDF and CSV.

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, ClipboardCheck, Download, FileText, Loader2, Plus, ShieldCheck, Trash2, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useHotel } from '@/components/hotel/HotelProvider';
import { useComplianceChecks, useComplianceLogs } from '@/components/hotel/hooks';
import { ChipPicker, Empty, Label, PageHeader, Pill, RoleGate, SectionTitle, ghostButton, inputClass, primaryButton } from '@/components/hotel/ui';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { InvictusSelect } from '@/components/InvictusSelect';
import { CHECK_RESULTS, FAULT_PRIORITIES, FREQUENCIES, UK_HOTEL_COMPLIANCE_TEMPLATES, WATER_FLUSH_DAYS } from '@/lib/hotel/constants';
import { addDays, formatDate, formatDateTime, todayStr } from '@/lib/hotel/dates';
import { checkDueState, readingProblems, roomsNeedingFlush, type DueState } from '@/lib/hotel/logic';
import { completeCheck, createChecks, queued, updateCheck, type CheckInput } from '@/lib/hotel/actions';
import { uploadHotelPhoto } from '@/lib/hotel/photos';
import { downloadCsv, exportPdf } from '@/lib/hotel/export';
import type { CheckResult, FaultPriority, HotelComplianceCheck, HotelComplianceLog, HotelPhoto, WaterTempReading } from '@/lib/hotel/types';

const DUE_STYLE: Record<DueState, string> = {
  overdue: 'border-alert/60 bg-alert/10',
  today: 'border-amber-400/50 bg-amber-400/5',
  soon: 'border-neutral-400/25 bg-invictus-surface/50',
  ok: 'border-neutral-400/20 bg-invictus-base/40',
};

function dueLabel(state: DueState, days: number) {
  if (state === 'overdue') return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (state === 'today') return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

const DEFAULT_OUTLETS = ['Kitchen hot tap', 'Room nearest the boiler', 'Furthest room'];

function CompleteSheet({ check, onClose }: { check: HotelComplianceCheck | null; onClose: () => void }) {
  const { ctx, teamId, rooms, settings, reportError } = useHotel();
  const today = todayStr();
  const [result, setResult] = useState<CheckResult | null>(null);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [readings, setReadings] = useState<WaterTempReading[]>(DEFAULT_OUTLETS.map((outlet) => ({ outlet, hot: null, cold: null })));
  const flushList = useMemo(() => roomsNeedingFlush(rooms, today), [rooms, today]);
  const [unflushed, setUnflushed] = useState<Set<string>>(new Set());
  const [raise, setRaise] = useState(true);
  const [faultPriority, setFaultPriority] = useState<FaultPriority>('high');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  if (!check || !ctx || !teamId) return null;
  const problems = check.kind === 'water_temp' ? readingProblems(readings) : [];

  const setReading = (i: number, patch: Partial<WaterTempReading>) =>
    setReadings((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const save = async () => {
    if (!result) return setError('Choose pass, fail or N/A.');
    setSaving(true);
    setError(null);
    try {
      let photo: HotelPhoto | null = null;
      if (file) {
        if (!navigator.onLine) throw new Error('A photo needs a connection — remove it or try again when online.');
        photo = await uploadHotelPhoto(teamId, file, file.name);
      }
      const { commit } = completeCheck(ctx, check, {
        result,
        notes,
        photo,
        readings: check.kind === 'water_temp' ? readings.filter((r) => r.outlet.trim() && (r.hot != null || r.cold != null)) : undefined,
        roomsFlushed: check.kind === 'water_flush' ? flushList.filter((r) => !unflushed.has(r.id)).map((r) => r.number) : undefined,
        fault: result === 'fail' && raise ? { priority: faultPriority, category: settings.faultCategories.includes('Safety') ? 'Safety' : settings.faultCategories[0] ?? 'Other' } : null,
      });
      queued(commit, reportError);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!check} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-neutral-400/20 bg-invictus-surface text-neutral-100 sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl text-neutral-100">{check.name}</SheetTitle>
          <SheetDescription className="text-neutral-500">{check.description}</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {check.kind === 'water_flush' && (
            <section>
              <SectionTitle>Rooms to flush ({flushList.length})</SectionTitle>
              <p className="mb-2 text-[11px] text-neutral-500">Not occupied or cleaned in the last {WATER_FLUSH_DAYS} days. Untick any you couldn&apos;t do.</p>
              {flushList.length === 0 ? (
                <p className="text-xs text-neutral-400">Every room has been used recently — nothing to flush.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {flushList.map((r) => {
                    const on = !unflushed.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => setUnflushed((prev) => { const n = new Set(prev); if (on) n.add(r.id); else n.delete(r.id); return n; })}
                        className={`min-h-[44px] rounded-md border font-mono text-sm ${on ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-neutral-400/25 text-neutral-500 line-through'}`}
                      >
                        {r.number}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {check.kind === 'water_temp' && (
            <section>
              <SectionTitle>Readings (°C)</SectionTitle>
              <div className="space-y-1.5">
                {readings.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_64px_64px_28px] gap-1.5">
                    <input value={r.outlet} onChange={(e) => setReading(i, { outlet: e.target.value })} placeholder="Outlet" className={inputClass} />
                    <input inputMode="decimal" value={r.hot ?? ''} onChange={(e) => setReading(i, { hot: num(e.target.value) })} placeholder="Hot" className={inputClass} />
                    <input inputMode="decimal" value={r.cold ?? ''} onChange={(e) => setReading(i, { cold: num(e.target.value) })} placeholder="Cold" className={inputClass} />
                    <button onClick={() => setReadings((p) => p.filter((_, j) => j !== i))} className="text-neutral-500" aria-label="Remove outlet">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setReadings((p) => [...p, { outlet: '', hot: null, cold: null }])} className={`${ghostButton} mt-2`}>
                <Plus className="h-3.5 w-3.5" /> Outlet
              </button>
              {problems.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-alert">
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
            </section>
          )}

          <section>
            <Label>Result</Label>
            <ChipPicker size="lg" value={result} onChange={setResult} options={CHECK_RESULTS.map((r) => ({ value: r.value, label: r.label, accent: r.accent }))} />
            {problems.length > 0 && result !== 'fail' && <p className="mt-1 text-[11px] text-amber-300">Some readings are out of range — this would normally be a fail.</p>}
          </section>

          {result === 'fail' && (
            <section className="space-y-2 rounded-md border border-alert/40 bg-alert/5 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={raise} onChange={(e) => setRaise(e.target.checked)} className="h-5 w-5 accent-invictus-crimson-bright" />
                Raise a fault for maintenance
              </label>
              {raise && (
                <ChipPicker value={faultPriority} onChange={setFaultPriority} options={FAULT_PRIORITIES.map((p) => ({ value: p.value, label: p.label, accent: p.accent }))} />
              )}
            </section>
          )}

          <section>
            <Label>Notes</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} placeholder="Anything worth recording (call point used, certificate ref…)" />
          </section>

          <section>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            <button onClick={() => photoRef.current?.click()} className={`${ghostButton} w-full py-2.5`}>
              <Camera className="h-4 w-4" /> {file ? file.name : 'Add photo (optional)'}
            </button>
          </section>

          {error && <p className="text-sm text-alert">{error}</p>}
          <button onClick={save} disabled={saving} className={`${primaryButton} w-full py-3`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Record check
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EditSheet({ check, creating, onClose }: { check: HotelComplianceCheck | null; creating: boolean; onClose: () => void }) {
  const { ctx, staff, reportError } = useHotel();
  const [form, setForm] = useState<CheckInput>(() => ({
    name: check?.name ?? '',
    description: check?.description ?? '',
    kind: check?.kind ?? 'standard',
    frequency: check?.frequency ?? 'weekly',
    assigneeUid: check?.assigneeUid ?? null,
    assigneeName: check?.assigneeName ?? null,
    nextDue: check?.nextDue ?? todayStr(),
  }));
  if (!ctx || (!check && !creating)) return null;
  const people = staff.filter((s) => s.active && (s.role === 'maintenance' || s.role === 'manager'));
  const save = () => {
    if (!form.name.trim()) return;
    queued(check ? updateCheck(ctx, check, form) : createChecks(ctx, [form]), reportError);
    onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-neutral-400/20 bg-invictus-surface text-neutral-100 sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl text-neutral-100">{check ? 'Edit check' : 'New check'}</SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <div>
            <Label>Name</Label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <Label>What to check</Label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <InvictusSelect value={form.frequency} onChange={(v) => setForm({ ...form, frequency: v as CheckInput['frequency'] })} options={FREQUENCIES} />
            </div>
            <div>
              <Label>Next due</Label>
              <input type="date" value={form.nextDue} onChange={(e) => setForm({ ...form, nextDue: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <Label>Assigned to</Label>
            <InvictusSelect
              value={form.assigneeUid ?? ''}
              onChange={(v) => setForm({ ...form, assigneeUid: v || null, assigneeName: v ? people.find((p) => p.uid === v)?.name ?? null : null })}
              options={[{ value: '', label: 'Anyone' }, ...people.map((p) => ({ value: p.uid, label: p.name }))]}
            />
          </div>
          <button onClick={save} className={`${primaryButton} w-full py-3`}>Save</button>
          {check && (
            <button
              onClick={() => { queued(updateCheck(ctx, check, { active: false }), reportError); onClose(); }}
              className={`${ghostButton} w-full`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Retire this check (its log is kept)
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChecksTab({ checks }: { checks: HotelComplianceCheck[] }) {
  const { user } = useAuth();
  const { ctx, isManager, reportError } = useHotel();
  const today = todayStr();
  const [completing, setCompleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mineOnly, setMineOnly] = useState(!isManager);

  const active = checks.filter((c) => c.active !== false);
  const visible = active
    .filter((c) => !mineOnly || !c.assigneeUid || c.assigneeUid === user?.uid)
    .map((c) => ({ c, due: checkDueState(c.nextDue, today) }))
    .sort((a, b) => a.due.days - b.due.days || a.c.name.localeCompare(b.c.name));
  const overdue = visible.filter((v) => v.due.state === 'overdue').length;

  const loadTemplate = () => {
    if (!ctx) return;
    queued(
      createChecks(
        ctx,
        UK_HOTEL_COMPLIANCE_TEMPLATES.map((t) => ({ ...t, assigneeUid: null, assigneeName: null, nextDue: today }))
      ),
      reportError
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {overdue > 0 && <Pill className="border-alert/60 bg-alert/15 text-alert">{overdue} overdue</Pill>}
        <button
          onClick={() => setMineOnly((m) => !m)}
          className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${mineOnly ? 'border-invictus-crimson-bright/70 bg-invictus-crimson-bright/20 text-neutral-100' : 'border-neutral-400/25 text-neutral-400'}`}
        >
          <User className="h-3.5 w-3.5" /> Mine &amp; unassigned
        </button>
        {isManager && (
          <button onClick={() => setCreating(true)} className={`${ghostButton} ml-auto`}>
            <Plus className="h-3.5 w-3.5" /> New check
          </button>
        )}
      </div>

      {active.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-400/25 p-6 text-center">
          <p className="mb-3 text-sm text-neutral-400">No compliance checks yet.</p>
          {isManager ? (
            <button onClick={loadTemplate} className={`${primaryButton} mx-auto`}>
              <ShieldCheck className="h-4 w-4" /> Load the UK hotel starter set ({UK_HOTEL_COMPLIANCE_TEMPLATES.length} checks)
            </button>
          ) : (
            <p className="text-xs text-neutral-500">A manager can set them up.</p>
          )}
        </div>
      ) : visible.length === 0 ? (
        <Empty>Nothing assigned to you.</Empty>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ c, due }) => (
            <li key={c.id} className={`flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:gap-3 ${DUE_STYLE[due.state]}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <span className={`shrink-0 text-xs font-semibold sm:hidden ${due.state === 'overdue' ? 'text-alert' : due.state === 'today' ? 'text-amber-300' : 'text-neutral-400'}`}>
                    {dueLabel(due.state, due.days)}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  {FREQUENCIES.find((f) => f.value === c.frequency)?.label} · {c.assigneeName ?? 'Anyone'}
                  {c.lastDoneAt ? ` · last ${formatDateTime(c.lastDoneAt)}${c.lastResult ? ` (${CHECK_RESULTS.find((r) => r.value === c.lastResult)?.label})` : ''}` : ' · never done'}
                </p>
              </div>
              <span className={`hidden text-xs font-semibold sm:block ${due.state === 'overdue' ? 'text-alert' : due.state === 'today' ? 'text-amber-300' : 'text-neutral-400'}`}>
                {dueLabel(due.state, due.days)}
              </span>
              <div className="flex gap-2">
                {isManager && (
                  <button onClick={() => setEditing(c.id)} className={`${ghostButton} flex-1 py-2.5 sm:flex-none sm:py-1.5`}>
                    Edit
                  </button>
                )}
                <button onClick={() => setCompleting(c.id)} className={`${primaryButton} flex-1 py-2.5 sm:flex-none sm:py-2`}>
                  Complete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {completing && <CompleteSheet key={completing} check={active.find((c) => c.id === completing) ?? null} onClose={() => setCompleting(null)} />}
      {(editing || creating) && (
        <EditSheet
          key={editing ?? 'new'}
          check={editing ? active.find((c) => c.id === editing) ?? null : null}
          creating={creating}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function LogTab({ checks, logs }: { checks: HotelComplianceCheck[]; logs: HotelComplianceLog[] }) {
  const { teamName } = useHotel();
  const today = todayStr();
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [checkId, setCheckId] = useState('');

  const rows = logs
    .filter((l) => l.date >= from && l.date <= to && (!checkId || l.checkId === checkId))
    .sort((a, b) => b.at - a.at);
  const checkName = checkId ? checks.find((c) => c.id === checkId)?.name ?? 'Check' : 'All checks';
  const resultLabel = (r: CheckResult) => CHECK_RESULTS.find((x) => x.value === r)?.label ?? r;
  const detail = (l: HotelComplianceLog) =>
    [
      l.notes,
      l.readings?.length ? l.readings.map((r) => `${r.outlet}: ${r.hot ?? '–'}°/${r.cold ?? '–'}°`).join('; ') : '',
      l.roomsFlushed?.length ? `Flushed: ${l.roomsFlushed.join(', ')}` : '',
      l.faultId ? 'Fault raised' : '',
    ]
      .filter(Boolean)
      .join(' · ');

  const csv = () =>
    downloadCsv(`compliance-log-${from}-to-${to}.csv`, [
      ['Date', 'Time', 'Check', 'Frequency', 'Result', 'Done by', 'Notes', 'Readings', 'Rooms flushed', 'Fault raised', 'Photo'],
      ...rows.map((l) => [
        l.date,
        new Date(l.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        l.checkName,
        FREQUENCIES.find((f) => f.value === l.frequency)?.label ?? '',
        resultLabel(l.result),
        l.byName,
        l.notes ?? '',
        l.readings?.map((r) => `${r.outlet}: hot ${r.hot ?? '-'} / cold ${r.cold ?? '-'}`).join('; ') ?? '',
        l.roomsFlushed?.join(' ') ?? '',
        l.faultId ? 'Yes' : '',
        l.photo?.url ?? '',
      ]),
    ]);
  const pdf = () =>
    exportPdf({
      filename: `compliance-log-${from}-to-${to}.pdf`,
      hotel: teamName,
      title: 'Compliance log',
      subtitle: `${checkName} · ${formatDate(from)} to ${formatDate(to)} · ${rows.length} record${rows.length === 1 ? '' : 's'}`,
      sections: [
        {
          head: ['Date', 'Check', 'Result', 'By', 'Notes'],
          body: rows.map((l) => [`${l.date} ${new Date(l.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, l.checkName, resultLabel(l.result), l.byName, detail(l)]),
          alertRows: rows.map((l, i) => (l.result === 'fail' ? i : -1)).filter((i) => i >= 0),
        },
      ],
    });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr_auto_auto]">
        <div>
          <Label>From</Label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <Label>To</Label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>Check</Label>
          <InvictusSelect value={checkId} onChange={setCheckId} options={[{ value: '', label: 'All checks' }, ...checks.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <button onClick={pdf} className={`${ghostButton} self-end py-2.5`}>
          <FileText className="h-3.5 w-3.5" /> PDF
        </button>
        <button onClick={csv} className={`${ghostButton} self-end py-2.5`}>
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty>No checks recorded in this period.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((l) => {
            const r = CHECK_RESULTS.find((x) => x.value === l.result)!;
            return (
              <li key={l.id} className="flex flex-wrap items-start gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 text-sm">
                <span className="w-28 shrink-0 font-mono text-xs text-neutral-500">{formatDateTime(l.at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{l.checkName}</span> <span className="text-neutral-500">— {l.byName}</span>
                  {detail(l) && <span className="block text-xs text-neutral-400">{detail(l)}</span>}
                  {l.faultId && (
                    <Link href={`/hotel/maintenance?fault=${l.faultId}`} className="text-xs text-invictus-crimson-bright underline">
                      View fault
                    </Link>
                  )}
                </span>
                {l.photo && (
                  <a href={l.photo.url} target="_blank" rel="noreferrer" className="text-xs text-invictus-crimson-bright underline">
                    Photo
                  </a>
                )}
                <Pill className={r.accent}>{r.label}</Pill>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Compliance() {
  const { teamId } = useHotel();
  const { data: checks } = useComplianceChecks(teamId);
  const { data: logs } = useComplianceLogs(teamId);
  const [tab, setTab] = useState<'checks' | 'log'>('checks');
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader icon={ShieldCheck} title="Compliance" subtitle="Recurring safety checks and their log" />
      <div className="mb-5 flex gap-1 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-1">
        {(['checks', 'log'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded py-2 text-xs font-semibold uppercase tracking-widest ${tab === t ? 'bg-invictus-crimson-bright/20 text-neutral-100' : 'text-neutral-500'}`}>
            {t === 'checks' ? 'Checks' : 'Log & export'}
          </button>
        ))}
      </div>
      {tab === 'checks' ? <ChecksTab checks={checks} /> : <LogTab checks={checks} logs={logs} />}
    </div>
  );
}

export default function CompliancePage() {
  return (
    <RoleGate allow={['manager', 'maintenance']}>
      <Compliance />
    </RoleGate>
  );
}

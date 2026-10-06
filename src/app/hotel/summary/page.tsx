'use client';

// End-of-day summary (manager). Rooms done / missed / outstanding per person
// and in total, average time per clean type, refused and DND rooms, rooms out
// of order, faults raised and closed, compliance done and overdue — for any
// day — viewable here and exportable as a PDF. The numbers come from
// buildEndOfDaySummary (src/lib/hotel/summary.ts), a pure function a future
// scheduled email can call server-side.

import React, { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useHotel } from '@/components/hotel/HotelProvider';
import { useAllFaults, useAssignmentsForDate, useComplianceChecks, useComplianceLogs } from '@/components/hotel/hooks';
import { Label, PageHeader, Pill, RoleGate, SectionTitle, ghostButton, inputClass } from '@/components/hotel/ui';
import { CHECK_RESULTS, priorityMeta } from '@/lib/hotel/constants';
import { formatDate, formatTime, todayStr } from '@/lib/hotel/dates';
import { buildEndOfDaySummary, faultWhere, summarySections } from '@/lib/hotel/summary';
import { exportPdf } from '@/lib/hotel/export';

function Stat({ label, value, tone = '' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className={`rounded-md border border-neutral-400/20 bg-invictus-surface/50 p-3 ${tone}`}>
      <p className="font-mono text-2xl font-bold leading-none text-neutral-100">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</p>
    </div>
  );
}

function Summary() {
  const { teamId, teamName, rooms } = useHotel();
  const [date, setDate] = useState(todayStr());
  const { data: assignments } = useAssignmentsForDate(teamId, date);
  const { data: faults } = useAllFaults(teamId);
  const { data: checks } = useComplianceChecks(teamId);
  const { data: logs } = useComplianceLogs(teamId);
  const s = useMemo(() => buildEndOfDaySummary({ date, rooms, assignments, faults, checks, logs }), [date, rooms, assignments, faults, checks, logs]);
  const isToday = date === todayStr();

  const pdf = () =>
    exportPdf({
      filename: `end-of-day-${date}.pdf`,
      hotel: teamName,
      title: 'End-of-day summary',
      subtitle: formatDate(date),
      sections: summarySections(s),
    });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader
        icon={FileText}
        title="End of day"
        subtitle={`${formatDate(date)}${isToday ? ` · so far, as of ${formatTime(Date.now())}` : ''}`}
        actions={
          <>
            <div className="w-40">
              <Label>Day</Label>
              <input type="date" value={date} max={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />
            </div>
            <button onClick={pdf} className={`${ghostButton} self-end py-2.5`}>
              <FileText className="h-3.5 w-3.5" /> Export PDF
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Rooms done" value={`${s.totals.done}/${s.totals.planned}`} tone="border-emerald-400/30" />
        <Stat label="Missed (refused / DND)" value={s.totals.missed} tone={s.totals.missed ? 'border-amber-400/40' : ''} />
        <Stat label="Outstanding" value={s.totals.outstanding} tone={s.totals.outstanding ? 'border-alert/40' : ''} />
        <Stat label="Out of order" value={s.outOfOrder.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>By person</SectionTitle>
          <div className="overflow-x-auto rounded-md border border-neutral-400/20">
            <table className="w-full text-sm">
              <thead className="bg-invictus-surface/60 text-[10px] uppercase tracking-widest text-neutral-500">
                <tr>
                  <th className="p-2 text-left">Person</th>
                  <th className="p-2 text-right">Done</th>
                  <th className="p-2 text-right">Missed</th>
                  <th className="p-2 text-right">Left</th>
                  <th className="p-2 text-right">Mins</th>
                </tr>
              </thead>
              <tbody>
                {s.people.map((p) => (
                  <tr key={p.uid ?? 'none'} className="border-t border-neutral-400/15">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2 text-right font-mono">{p.done}/{p.planned}</td>
                    <td className="p-2 text-right font-mono">{p.missed}</td>
                    <td className={`p-2 text-right font-mono ${p.outstanding ? 'text-alert' : ''}`}>{p.outstanding}</td>
                    <td className="p-2 text-right font-mono text-neutral-400">{p.minutes}</td>
                  </tr>
                ))}
                {s.people.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-xs text-neutral-500">Nothing was planned for this day.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionTitle>Average time per clean</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {s.averages.map((a) => (
              <Stat key={a.cleanType} label={`${a.label} (${a.count})`} value={a.avgMinutes === null ? '—' : `${a.avgMinutes}m`} />
            ))}
          </div>
          {s.outOfOrder.length > 0 && <p className="mt-3 text-xs text-neutral-400">Out of order now: {s.outOfOrder.join(', ')}</p>}
        </section>

        <section>
          <SectionTitle>Refused or do not disturb ({s.missedRooms.length})</SectionTitle>
          <ul className="space-y-1 text-sm">
            {s.missedRooms.map((m) => (
              <li key={m.room} className="rounded-md border border-neutral-400/15 bg-invictus-base/40 p-2">
                <span className="font-mono font-bold">{m.room}</span> · {m.outcome} <span className="text-neutral-500">— {m.by}</span>
                {m.note && <span className="block text-xs text-amber-300">“{m.note}”</span>}
              </li>
            ))}
            {s.missedRooms.length === 0 && <li className="text-xs text-neutral-500">None.</li>}
          </ul>
          {s.outstandingRooms.length > 0 && (
            <>
              <SectionTitle>Outstanding ({s.outstandingRooms.length})</SectionTitle>
              <p className="text-xs text-neutral-400">{s.outstandingRooms.map((o) => `${o.room} (${o.by}, ${o.status.toLowerCase()})`).join(' · ')}</p>
            </>
          )}
        </section>

        <section>
          <SectionTitle>Faults: {s.faultsRaised.length} raised, {s.faultsClosed.length} closed</SectionTitle>
          <ul className="space-y-1 text-sm">
            {[...s.faultsRaised.map((f) => ({ f, kind: 'Raised' })), ...s.faultsClosed.map((f) => ({ f, kind: 'Closed' }))].map(({ f, kind }) => (
              <li key={`${kind}-${f.id}`} className="flex items-center gap-2 rounded-md border border-neutral-400/15 bg-invictus-base/40 p-2">
                <Pill className={kind === 'Closed' ? 'border-emerald-400/40 text-emerald-300' : 'border-alert/40 text-alert'}>{kind}</Pill>
                <span className="min-w-0 flex-1 truncate">
                  {faultWhere(f)} — {f.category}
                </span>
                <Pill className={priorityMeta(f.priority).accent}>{priorityMeta(f.priority).label}</Pill>
              </li>
            ))}
            {s.faultsRaised.length + s.faultsClosed.length === 0 && <li className="text-xs text-neutral-500">None.</li>}
          </ul>
        </section>

        <section className="lg:col-span-2">
          <SectionTitle>Compliance: {s.checksDone.length} done, {s.checksOverdue.length} overdue</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {s.checksDone.map((l) => {
              const r = CHECK_RESULTS.find((x) => x.value === l.result)!;
              return (
                <Pill key={l.id} className={r.accent}>
                  {l.checkName}: {r.label}
                </Pill>
              );
            })}
            {s.checksOverdue.map((c) => (
              <Pill key={c.id} className="border-alert/60 bg-alert/15 text-alert">
                Overdue: {c.name}
              </Pill>
            ))}
            {s.checksDone.length + s.checksOverdue.length === 0 && <span className="text-xs text-neutral-500">Nothing done or overdue.</span>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function SummaryPage() {
  return (
    <RoleGate allow={['manager']}>
      <Summary />
    </RoleGate>
  );
}

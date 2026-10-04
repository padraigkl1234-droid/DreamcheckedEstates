// End-of-day summary — a pure function of one day's data, so the same
// numbers can back the in-app page, the PDF and (later) a scheduled email
// from a cron route via the Admin SDK. Nothing here touches Firestore.
//
// Definitions:
//   done        — assignment finished
//   missed      — not serviced because the guest refused or asked not to be disturbed
//   outstanding — planned but not finished (not started, or still in progress)

import { CHECK_RESULTS, CLEAN_TYPES, CLEAN_TYPE_ORDER, cleanTypeLabel, OUTCOME_LABELS, priorityMeta } from '@/lib/hotel/constants';
import type { PdfSection } from '@/lib/hotel/export';
import { dayRange } from '@/lib/hotel/dates';
import type {
  CleanType,
  HotelAssignment,
  HotelComplianceCheck,
  HotelComplianceLog,
  HotelFault,
  HotelRoom,
} from '@/lib/hotel/types';

export interface EodInput {
  date: string;
  rooms: HotelRoom[];
  assignments: HotelAssignment[]; // for `date`
  faults: HotelFault[]; // any; filtered here
  checks: HotelComplianceCheck[];
  logs: HotelComplianceLog[]; // any; filtered here
}

export interface EodCounts {
  planned: number;
  done: number;
  missed: number;
  outstanding: number;
}

export interface EodPerson extends EodCounts {
  uid: string | null;
  name: string;
  minutes: number; // total timed cleaning minutes
}

export interface EodSummary {
  date: string;
  totals: EodCounts;
  people: EodPerson[];
  averages: { cleanType: CleanType; label: string; count: number; avgMinutes: number | null }[];
  missedRooms: { room: string; outcome: string; note: string; by: string }[];
  outstandingRooms: { room: string; cleanType: string; status: string; by: string }[];
  outOfOrder: string[];
  faultsRaised: HotelFault[];
  faultsClosed: HotelFault[];
  checksDone: HotelComplianceLog[];
  checksOverdue: HotelComplianceCheck[];
}

const counts = (list: HotelAssignment[]): EodCounts => ({
  planned: list.length,
  done: list.filter((a) => a.outcome === 'done').length,
  missed: list.filter((a) => a.outcome === 'refused' || a.outcome === 'dnd').length,
  outstanding: list.filter((a) => a.outcome === 'pending' || a.outcome === 'in_progress').length,
});

/** Minutes a finished clean took, or null when it wasn't properly timed. */
export function cleanMinutes(a: HotelAssignment): number | null {
  if (a.outcome !== 'done' || !a.startedAt || !a.finishedAt || a.finishedAt < a.startedAt) return null;
  return (a.finishedAt - a.startedAt) / 60_000;
}

const byRoom = (a: { roomNumber: string }, b: { roomNumber: string }) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });

export function buildEndOfDaySummary(input: EodInput): EodSummary {
  const { date } = input;
  const [start, end] = dayRange(date);
  const onDay = (ms: number | null | undefined) => !!ms && ms >= start && ms < end;
  const list = input.assignments.filter((a) => a.date === date);

  const groups = new Map<string, HotelAssignment[]>();
  for (const a of list) {
    const key = a.assigneeUid ?? '';
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const people: EodPerson[] = [...groups.entries()]
    .map(([uid, mine]) => ({
      uid: uid || null,
      name: uid ? mine[0].assigneeName ?? 'Unknown' : 'Unassigned',
      ...counts(mine),
      minutes: Math.round(mine.reduce((sum, a) => sum + (cleanMinutes(a) ?? 0), 0)),
    }))
    .sort((a, b) => (a.uid === null ? 1 : b.uid === null ? -1 : a.name.localeCompare(b.name)));

  const averages = CLEAN_TYPES.map((c) => {
    const timed = list.filter((a) => a.cleanType === c.value).map(cleanMinutes).filter((m): m is number => m !== null);
    return {
      cleanType: c.value,
      label: c.label,
      count: timed.length,
      avgMinutes: timed.length ? Math.round(timed.reduce((s, m) => s + m, 0) / timed.length) : null,
    };
  });

  return {
    date,
    totals: counts(list),
    people,
    averages,
    missedRooms: list
      .filter((a) => a.outcome === 'refused' || a.outcome === 'dnd')
      .sort(byRoom)
      .map((a) => ({ room: a.roomNumber, outcome: OUTCOME_LABELS[a.outcome], note: a.note ?? '', by: a.assigneeName ?? 'Unassigned' })),
    outstandingRooms: list
      .filter((a) => a.outcome === 'pending' || a.outcome === 'in_progress')
      .sort((a, b) => CLEAN_TYPE_ORDER[a.cleanType] - CLEAN_TYPE_ORDER[b.cleanType] || byRoom(a, b))
      .map((a) => ({ room: a.roomNumber, cleanType: cleanTypeLabel(a.cleanType), status: OUTCOME_LABELS[a.outcome], by: a.assigneeName ?? 'Unassigned' })),
    outOfOrder: input.rooms
      .filter((r) => r.active !== false && r.status === 'out_of_order')
      .map((r) => r.number)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    faultsRaised: input.faults.filter((f) => onDay(f.createdAt)).sort((a, b) => a.createdAt - b.createdAt),
    faultsClosed: input.faults.filter((f) => f.status === 'done' && onDay(f.closedAt)).sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0)),
    checksDone: input.logs.filter((l) => l.date === date).sort((a, b) => a.at - b.at),
    checksOverdue: input.checks.filter((c) => c.active !== false && c.nextDue < date).sort((a, b) => a.nextDue.localeCompare(b.nextDue)),
  };
}

export const faultWhere = (f: { roomNumber: string | null; area: string | null }) => (f.roomNumber ? `Room ${f.roomNumber}` : f.area ?? '—');

/** The PDF layout of a summary — kept separate from the page so a scheduled
 * job can reuse it. */
export function summarySections(s: EodSummary): PdfSection[] {
  return [
    {
      title: 'Rooms',
      lines: [
        `Planned ${s.totals.planned} · done ${s.totals.done} · missed (refused / DND) ${s.totals.missed} · outstanding ${s.totals.outstanding}`,
        `Out of order now: ${s.outOfOrder.length ? s.outOfOrder.join(', ') : 'none'}`,
        `Average time: ${s.averages.map((a) => `${a.label} ${a.avgMinutes === null ? '—' : `${a.avgMinutes}m`} (${a.count})`).join(' · ')}`,
      ],
    },
    {
      title: 'By person',
      head: ['Person', 'Planned', 'Done', 'Missed', 'Outstanding', 'Timed minutes'],
      body: s.people.map((p) => [p.name, p.planned, p.done, p.missed, p.outstanding, p.minutes]),
    },
    {
      title: 'Refused or do not disturb',
      head: ['Room', 'Outcome', 'Note', 'Housekeeper'],
      body: s.missedRooms.map((m) => [m.room, m.outcome, m.note, m.by]),
    },
    {
      title: 'Outstanding',
      head: ['Room', 'Clean', 'Status', 'Housekeeper'],
      body: s.outstandingRooms.map((o) => [o.room, o.cleanType, o.status, o.by]),
    },
    {
      title: `Faults raised (${s.faultsRaised.length}) and closed (${s.faultsClosed.length})`,
      head: ['', 'Where', 'Category', 'Priority', 'Note'],
      body: [
        ...s.faultsRaised.map((f) => ['Raised', faultWhere(f), f.category, priorityMeta(f.priority).label, f.note]),
        ...s.faultsClosed.map((f) => ['Closed', faultWhere(f), f.category, priorityMeta(f.priority).label, f.note]),
      ],
    },
    {
      title: `Compliance: ${s.checksDone.length} done, ${s.checksOverdue.length} overdue`,
      head: ['', 'Check', 'Result / due', 'By'],
      body: [
        ...s.checksDone.map((l) => ['Done', l.checkName, CHECK_RESULTS.find((r) => r.value === l.result)?.label ?? l.result, l.byName]),
        ...s.checksOverdue.map((c) => ['Overdue', c.name, `due ${c.nextDue}`, c.assigneeName ?? 'Anyone']),
      ],
      alertRows: [
        ...s.checksDone.map((l, i) => (l.result === 'fail' ? i : -1)).filter((i) => i >= 0),
        ...s.checksOverdue.map((_, i) => s.checksDone.length + i),
      ],
    },
  ];
}

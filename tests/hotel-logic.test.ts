// Unit tests for the hotel module's pure logic (no emulator needed).

import { describe, expect, it } from 'vitest';
import { advanceByFrequency, addDays, daysBetween } from '@/lib/hotel/dates';
import { checkDueState, readingProblems, roomsNeedingFlush, sortFaultQueue, sortMyTasks } from '@/lib/hotel/logic';
import { buildEndOfDaySummary, cleanMinutes } from '@/lib/hotel/summary';
import type { HotelAssignment, HotelComplianceCheck, HotelComplianceLog, HotelFault, HotelRoom } from '@/lib/hotel/types';

const DAY = '2026-10-04';
const at = (hh: number, mm = 0) => new Date(2026, 9, 4, hh, mm).getTime();

const job = (p: Partial<HotelAssignment>): HotelAssignment => ({
  id: p.roomNumber ?? 'x',
  teamId: 't',
  date: DAY,
  roomId: p.roomNumber ?? 'x',
  roomNumber: '101',
  floor: 1,
  roomType: 'Double',
  cleanType: 'stayover',
  assigneeUid: 'u1',
  assigneeName: 'Hana',
  urgent: false,
  outcome: 'pending',
  checklist: {},
  createdAt: 0,
  updatedAt: 0,
  updatedBy: 'm',
  updatedByName: 'm',
  ...p,
});

const room = (p: Partial<HotelRoom>): HotelRoom => ({
  id: p.number ?? 'r',
  teamId: 't',
  number: '101',
  floor: 1,
  type: 'Double',
  status: 'dirty',
  statusAt: 0,
  active: true,
  createdAt: 0,
  ...p,
});

describe('dates', () => {
  it('rolls due dates forward by frequency, including month ends', () => {
    expect(advanceByFrequency('2026-10-04', 'daily')).toBe('2026-10-05');
    expect(advanceByFrequency('2026-10-04', 'weekly')).toBe('2026-10-11');
    expect(advanceByFrequency('2026-10-04', 'monthly')).toBe('2026-11-04');
    expect(advanceByFrequency('2026-10-04', 'quarterly')).toBe('2027-01-04');
    expect(advanceByFrequency('2026-10-04', 'annual')).toBe('2027-10-04');
  });
  it('counts days across a month boundary', () => {
    expect(daysBetween('2026-09-28', '2026-10-04')).toBe(6);
    expect(addDays('2026-10-04', -7)).toBe('2026-09-27');
  });
});

describe('My tasks order', () => {
  it('puts in-progress first, then urgent, then departures before deep before stayovers, finished last', () => {
    const sorted = sortMyTasks([
      job({ roomNumber: '201', cleanType: 'stayover' }),
      job({ roomNumber: '105', cleanType: 'departure', outcome: 'done' }),
      job({ roomNumber: '110', cleanType: 'departure' }),
      job({ roomNumber: '102', cleanType: 'departure' }),
      job({ roomNumber: '300', cleanType: 'deep' }),
      job({ roomNumber: '205', cleanType: 'stayover', urgent: true }),
      job({ roomNumber: '206', cleanType: 'stayover', outcome: 'in_progress' }),
      job({ roomNumber: '207', cleanType: 'stayover', outcome: 'dnd' }),
    ]).map((a) => a.roomNumber);
    expect(sorted).toEqual(['206', '205', '102', '110', '300', '201', '105', '207']);
  });
});

describe('fault queue order', () => {
  it('sorts by priority, then oldest first', () => {
    const f = (id: string, priority: HotelFault['priority'], createdAt: number) => ({ id, priority, createdAt }) as HotelFault;
    const sorted = sortFaultQueue([f('a', 'low', 1), f('b', 'urgent', 5), f('c', 'high', 3), f('d', 'urgent', 2)]).map((x) => x.id);
    expect(sorted).toEqual(['d', 'b', 'c', 'a']);
  });
});

describe('compliance', () => {
  it('classifies due dates', () => {
    expect(checkDueState('2026-10-01', DAY)).toEqual({ state: 'overdue', days: -3 });
    expect(checkDueState(DAY, DAY).state).toBe('today');
    expect(checkDueState('2026-10-09', DAY).state).toBe('soon');
    expect(checkDueState('2026-11-04', DAY).state).toBe('ok');
  });

  it('lists rooms neither occupied nor cleaned in the last 7 days', () => {
    const rooms = [
      room({ number: 'A', lastOccupiedOn: '2026-10-03' }), // occupied yesterday
      room({ number: 'B', lastOccupiedOn: '2026-09-20', lastCleanedAt: at(9) }), // cleaned today
      room({ number: 'C', lastOccupiedOn: '2026-09-20' }), // idle a fortnight
      room({ number: 'D' }), // never used
      room({ number: 'E', lastOccupiedOn: '2026-09-27' }), // exactly 7 days ago
      room({ number: 'F', lastOccupiedOn: '2026-09-28' }), // 6 days ago
      room({ number: 'G', active: false }), // retired
    ];
    expect(roomsNeedingFlush(rooms, DAY).map((r) => r.number)).toEqual(['C', 'D', 'E']);
  });

  it('flags water temperatures outside the guidance', () => {
    expect(readingProblems([{ outlet: 'Kitchen', hot: 58, cold: 14 }])).toEqual([]);
    expect(readingProblems([{ outlet: 'Room 12', hot: 46, cold: 21 }])).toHaveLength(2);
  });
});

describe('end-of-day summary', () => {
  const assignments = [
    job({ roomNumber: '101', cleanType: 'departure', outcome: 'done', startedAt: at(9), finishedAt: at(9, 30) }),
    job({ roomNumber: '102', cleanType: 'departure', outcome: 'done', startedAt: at(10), finishedAt: at(10, 40) }),
    job({ roomNumber: '103', cleanType: 'stayover', outcome: 'refused', note: 'After 2pm' }),
    job({ roomNumber: '201', cleanType: 'stayover', outcome: 'done', startedAt: at(11), finishedAt: at(11, 15), assigneeUid: 'u2', assigneeName: 'Tom' }),
    job({ roomNumber: '202', cleanType: 'stayover', outcome: 'in_progress', assigneeUid: 'u2', assigneeName: 'Tom' }),
    job({ roomNumber: '203', cleanType: 'deep', outcome: 'pending', assigneeUid: null, assigneeName: null }),
    job({ roomNumber: '999', date: '2026-10-03', outcome: 'done' }), // another day: ignored
  ];
  const faults = [
    { id: 'f1', createdAt: at(8), status: 'open' },
    { id: 'f2', createdAt: at(8) - 86_400_000, status: 'done', closedAt: at(12) },
    { id: 'f3', createdAt: at(8) - 86_400_000, status: 'open' },
  ] as HotelFault[];
  const checks = [
    { id: 'c1', name: 'Fire alarm', nextDue: '2026-10-01', active: true },
    { id: 'c2', name: 'PAT', nextDue: '2027-01-01', active: true },
    { id: 'c3', name: 'Old', nextDue: '2026-01-01', active: false },
  ] as HotelComplianceCheck[];
  const logs = [
    { id: 'l1', date: DAY, at: at(9), result: 'pass' },
    { id: 'l2', date: '2026-10-03', at: at(9) - 86_400_000, result: 'pass' },
  ] as HotelComplianceLog[];
  const rooms = [room({ number: '104', status: 'out_of_order' }), room({ number: '105', status: 'clean' })];
  const s = buildEndOfDaySummary({ date: DAY, rooms, assignments, faults, checks, logs });

  it('totals done, missed and outstanding', () => {
    expect(s.totals).toEqual({ planned: 6, done: 3, missed: 1, outstanding: 2 });
  });

  it('breaks down by person, unassigned last', () => {
    expect(s.people.map((p) => [p.name, p.planned, p.done, p.missed, p.outstanding, p.minutes])).toEqual([
      ['Hana', 3, 2, 1, 0, 70],
      ['Tom', 2, 1, 0, 1, 15],
      ['Unassigned', 1, 0, 0, 1, 0],
    ]);
  });

  it('averages only timed, finished cleans per type', () => {
    expect(s.averages.map((a) => [a.cleanType, a.count, a.avgMinutes])).toEqual([
      ['departure', 2, 35],
      ['stayover', 1, 15],
      ['deep', 0, null],
    ]);
    expect(cleanMinutes(job({ outcome: 'in_progress', startedAt: at(9) }))).toBeNull();
  });

  it('lists missed, outstanding and out-of-order rooms', () => {
    expect(s.missedRooms).toEqual([{ room: '103', outcome: 'Guest refused service', note: 'After 2pm', by: 'Hana' }]);
    expect(s.outstandingRooms.map((o) => o.room)).toEqual(['203', '202']); // deep before stayover
    expect(s.outOfOrder).toEqual(['104']);
  });

  it('counts faults and compliance for the day only', () => {
    expect(s.faultsRaised.map((f) => f.id)).toEqual(['f1']);
    expect(s.faultsClosed.map((f) => f.id)).toEqual(['f2']);
    expect(s.checksDone.map((l) => l.id)).toEqual(['l1']);
    expect(s.checksOverdue.map((c) => c.id)).toEqual(['c1']);
  });
});

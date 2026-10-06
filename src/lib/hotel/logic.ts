// Pure hotel logic (no Firestore), shared by pages and unit-tested in
// tests/hotel-logic.test.ts.

import { CLEAN_TYPE_ORDER, WATER_FLUSH_DAYS, priorityMeta } from '@/lib/hotel/constants';
import { addDays, dateStr, daysBetween } from '@/lib/hotel/dates';
import type { AssignmentOutcome, HotelAssignment, HotelFault, HotelRoom, WaterTempReading } from '@/lib/hotel/types';

export const FINISHED_OUTCOMES: AssignmentOutcome[] = ['done', 'refused', 'dnd'];

/** A housekeeper's work order: whatever's in progress, then urgent rooms,
 * then departures before deep cleans before stayovers; finished last. */
export function sortMyTasks(list: HotelAssignment[]): HotelAssignment[] {
  const rank = (a: HotelAssignment) => (a.outcome === 'in_progress' ? 0 : FINISHED_OUTCOMES.includes(a.outcome) ? 2 : 1);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Number(b.urgent) - Number(a.urgent) ||
      CLEAN_TYPE_ORDER[a.cleanType] - CLEAN_TYPE_ORDER[b.cleanType] ||
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
  );
}

/** The maintenance queue: highest priority first, then oldest first. */
export function sortFaultQueue(list: HotelFault[]): HotelFault[] {
  return [...list].sort((a, b) => priorityMeta(a.priority).rank - priorityMeta(b.priority).rank || a.createdAt - b.createdAt);
}

export type DueState = 'overdue' | 'today' | 'soon' | 'ok';

/** How a compliance check stands against `today`. `days` is days until due
 * (negative when overdue). "Soon" is within a week. */
export function checkDueState(nextDue: string, today: string): { state: DueState; days: number } {
  const days = daysBetween(today, nextDue);
  return { state: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'ok', days };
}

/** Rooms due a Legionella flush: neither occupied nor cleaned within the
 * last `days` days (or never). */
export function roomsNeedingFlush(rooms: HotelRoom[], today: string, days = WATER_FLUSH_DAYS): HotelRoom[] {
  const cutoff = addDays(today, -days);
  return rooms.filter((r) => {
    if (r.active === false) return false;
    const occupied = r.lastOccupiedOn ?? null;
    const cleaned = r.lastCleanedAt ? dateStr(new Date(r.lastCleanedAt)) : null;
    const last = [occupied, cleaned].filter(Boolean).sort().pop() ?? null;
    return !last || last <= cutoff;
  });
}

/** Water temperature readings outside the UK guidance (hot ≥ 50°C, cold < 20°C). */
export function readingProblems(readings: WaterTempReading[]): string[] {
  const out: string[] = [];
  for (const r of readings) {
    if (r.hot != null && r.hot < 50) out.push(`${r.outlet || 'Outlet'}: hot ${r.hot}°C is below 50°C`);
    if (r.cold != null && r.cold >= 20) out.push(`${r.outlet || 'Outlet'}: cold ${r.cold}°C is 20°C or above`);
  }
  return out;
}

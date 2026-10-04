// Pure hotel logic (no Firestore), shared by pages and unit-tested in
// tests/hotel-logic.test.ts.

import { CLEAN_TYPE_ORDER } from '@/lib/hotel/constants';
import type { AssignmentOutcome, HotelAssignment } from '@/lib/hotel/types';

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

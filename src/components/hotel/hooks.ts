'use client';

// Live Firestore subscriptions the hotel pages share. Queries use equality
// filters only (teamId first), so none of them need a composite index.

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { OPEN_FAULT_STATUSES } from '@/lib/hotel/constants';
import type {
  HotelAssignment,
  HotelComplianceCheck,
  HotelComplianceLog,
  HotelFault,
  HotelFaultUpdate,
  HotelRoomEvent,
} from '@/lib/hotel/types';

/** Subscribe to `coll` where teamId == teamId plus any extra equality filters.
 * Pass teamId null (or enabled false) to stay idle. */
export function useTeamQuery<T extends { id: string }>(
  coll: string,
  teamId: string | null,
  extra: [string, '==' | 'in', unknown][] = [],
  enabled = true
): { data: T[]; loading: boolean } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(extra);
  useEffect(() => {
    if (!teamId || !enabled) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const constraints: QueryConstraint[] = [where('teamId', '==', teamId)];
    for (const [field, op, value] of JSON.parse(key) as [string, '==' | 'in', unknown][]) constraints.push(where(field, op, value));
    return onSnapshot(
      query(collection(db, coll), ...constraints),
      (snap) => {
        setData(snap.docs.map((d) => ({ ...(d.data() as Omit<T, 'id'>), id: d.id }) as T));
        setLoading(false);
      },
      (e) => {
        console.error(`${coll} subscription failed:`, e);
        setLoading(false);
      }
    );
  }, [coll, teamId, key, enabled]);
  return { data, loading };
}

export const useAssignmentsForDate = (teamId: string | null, date: string, enabled = true) =>
  useTeamQuery<HotelAssignment>('hotelAssignments', teamId, [['date', '==', date]], enabled);

export const useMyAssignments = (teamId: string | null, date: string, uid: string | null) =>
  useTeamQuery<HotelAssignment>('hotelAssignments', teamId, [['date', '==', date], ['assigneeUid', '==', uid]], !!uid);

export const useOpenFaults = (teamId: string | null, enabled = true) =>
  useTeamQuery<HotelFault>('hotelFaults', teamId, [['status', 'in', OPEN_FAULT_STATUSES]], enabled);

export const useAllFaults = (teamId: string | null, enabled = true) => useTeamQuery<HotelFault>('hotelFaults', teamId, [], enabled);

export const useRoomEvents = (teamId: string | null, roomId: string | null) =>
  useTeamQuery<HotelRoomEvent>('hotelRoomEvents', teamId, [['roomId', '==', roomId]], !!roomId);

export const useFaultUpdates = (teamId: string | null, faultId: string | null) =>
  useTeamQuery<HotelFaultUpdate>('hotelFaultUpdates', teamId, [['faultId', '==', faultId]], !!faultId);

export const useComplianceChecks = (teamId: string | null, enabled = true) =>
  useTeamQuery<HotelComplianceCheck>('hotelComplianceChecks', teamId, [], enabled);

export const useComplianceLogs = (teamId: string | null, enabled = true) =>
  useTeamQuery<HotelComplianceLog>('hotelComplianceLogs', teamId, [], enabled);

export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

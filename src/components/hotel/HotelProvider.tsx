'use client';

// Everything the hotel hub's pages share: who you are in this hotel (your
// hotel role, separate from the estates rank), the staff list, rooms,
// settings and checklist templates — one live subscription each.

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useToast } from '@/hooks/use-toast';
import { isCommander, isHotelTeam, profileName } from '@/lib/teams';
import { CLEAN_TYPES, DEFAULT_CHECKLISTS, DEFAULT_SETTINGS } from '@/lib/hotel/constants';
import { initialiseHotel, queued, staffDocId, type HotelCtx } from '@/lib/hotel/actions';
import { flushPhotoOutbox } from '@/lib/hotel/photos';
import type {
  ChecklistItem,
  CleanType,
  HotelChecklistTemplate,
  HotelRole,
  HotelRoom,
  HotelSettings,
  HotelStaff,
} from '@/lib/hotel/types';

interface HotelContextValue {
  teamId: string | null;
  teamName: string;
  isHotel: boolean;
  /** Your effective hotel role (a team commander or the master counts as a
   * manager), or null when a manager hasn't given you one / you're inactive. */
  role: HotelRole | null;
  isManager: boolean;
  /** Manager or maintenance — the fault queue and compliance. */
  isMaint: boolean;
  me: HotelStaff | null;
  staff: HotelStaff[];
  staffName: (uid: string | null | undefined) => string;
  rooms: HotelRoom[];
  settings: HotelSettings;
  checklists: Record<CleanType, ChecklistItem[]>;
  ctx: HotelCtx | null;
  loading: boolean;
  /** Show a write failure (rules denial etc.) as a toast. */
  reportError: (message: string) => void;
}

const HotelContext = createContext<HotelContextValue | undefined>(undefined);

export function HotelProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, team, isMaster } = useProfile();
  const { toast } = useToast();
  const teamId = profile?.teamId ?? null;
  const isHotel = isHotelTeam(team);
  const overManager = isMaster || isCommander(profile);

  const [me, setMe] = useState<HotelStaff | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [staff, setStaff] = useState<HotelStaff[]>([]);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [templates, setTemplates] = useState<HotelChecklistTemplate[] | null>(null);

  const role: HotelRole | null = overManager ? 'manager' : me?.active ? me.role : null;
  const hasRole = role !== null;

  // Your own staff doc — readable even before you have a role.
  useEffect(() => {
    if (!user || !teamId || !isHotel) {
      setMe(null);
      setMeLoaded(true);
      return;
    }
    setMeLoaded(false);
    return onSnapshot(
      doc(db, 'hotelStaff', staffDocId(teamId, user.uid)),
      (snap) => {
        setMe(snap.exists() ? ({ ...(snap.data() as Omit<HotelStaff, 'id'>), id: snap.id }) : null);
        setMeLoaded(true);
      },
      (e) => {
        console.error('Hotel staff (self) subscription failed:', e);
        setMeLoaded(true);
      }
    );
  }, [user, teamId, isHotel]);

  // Shared hotel data — only once you hold a role (the rules require one).
  useEffect(() => {
    if (!teamId || !isHotel || !hasRole) {
      setStaff([]);
      setRooms([]);
      setSettings(null);
      setTemplates(null);
      setRoomsLoaded(!hasRole);
      setSettingsLoaded(!hasRole);
      return;
    }
    const unsubs = [
      onSnapshot(
        query(collection(db, 'hotelStaff'), where('teamId', '==', teamId)),
        (snap) => setStaff(snap.docs.map((d) => ({ ...(d.data() as Omit<HotelStaff, 'id'>), id: d.id }))),
        (e) => console.error('Hotel staff subscription failed:', e)
      ),
      onSnapshot(
        query(collection(db, 'hotelRooms'), where('teamId', '==', teamId)),
        (snap) => {
          setRooms(snap.docs.map((d) => ({ ...(d.data() as Omit<HotelRoom, 'id'>), id: d.id })));
          setRoomsLoaded(true);
        },
        (e) => {
          console.error('Hotel rooms subscription failed:', e);
          setRoomsLoaded(true);
        }
      ),
      onSnapshot(
        doc(db, 'hotelSettings', teamId),
        (snap) => {
          setSettings(snap.exists() ? (snap.data() as HotelSettings) : null);
          setSettingsLoaded(true);
        },
        (e) => {
          console.error('Hotel settings subscription failed:', e);
          setSettingsLoaded(true);
        }
      ),
      onSnapshot(
        query(collection(db, 'hotelChecklistTemplates'), where('teamId', '==', teamId)),
        (snap) => setTemplates(snap.docs.map((d) => ({ ...(d.data() as Omit<HotelChecklistTemplate, 'id'>), id: d.id }))),
        (e) => console.error('Checklist templates subscription failed:', e)
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [teamId, isHotel, hasRole]);

  const ctx: HotelCtx | null = useMemo(
    () => (user && teamId ? { teamId, actor: { uid: user.uid, name: profileName(profile) } } : null),
    [user, teamId, profile]
  );

  const reportError = useMemo(
    () => (message: string) => toast({ title: "Couldn't save that", description: message, variant: 'destructive' }),
    [toast]
  );

  // A manager's first visit writes the default settings and checklists.
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current || role !== 'manager' || !ctx || !settingsLoaded || templates === null) return;
    const missing = CLEAN_TYPES.map((c) => c.value).filter((t) => !templates.some((x) => x.cleanType === t));
    if (settings && missing.length === 0) return;
    initialised.current = true;
    queued(initialiseHotel(ctx, missing, !settings), reportError);
  }, [role, ctx, settings, settingsLoaded, templates, reportError]);

  // Send any photos left in the offline outbox, now and whenever we reconnect.
  useEffect(() => {
    if (!hasRole) return;
    void flushPhotoOutbox();
    const onOnline = () => void flushPhotoOutbox();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [hasRole]);

  const value: HotelContextValue = useMemo(() => {
    const byUid = new Map(staff.map((s) => [s.uid, s]));
    const checklists = Object.fromEntries(
      CLEAN_TYPES.map((c) => [c.value, templates?.find((t) => t.cleanType === c.value)?.items ?? DEFAULT_CHECKLISTS[c.value]])
    ) as Record<CleanType, ChecklistItem[]>;
    return {
      teamId,
      teamName: team?.name ?? 'Hotel',
      isHotel,
      role,
      isManager: role === 'manager',
      isMaint: role === 'manager' || role === 'maintenance',
      me,
      staff: [...staff].sort((a, b) => a.name.localeCompare(b.name)),
      staffName: (uid) => (uid ? byUid.get(uid)?.name ?? 'Unknown' : 'Unassigned'),
      rooms: [...rooms].sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number, undefined, { numeric: true })),
      settings: { teamId: teamId ?? '', ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      checklists,
      ctx,
      loading: !meLoaded || (hasRole && (!roomsLoaded || !settingsLoaded)),
      reportError,
    };
  }, [teamId, team, isHotel, role, me, staff, rooms, settings, templates, ctx, meLoaded, hasRole, roomsLoaded, settingsLoaded, reportError]);

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
}

export function useHotel() {
  const ctx = useContext(HotelContext);
  if (!ctx) throw new Error('useHotel must be used within a HotelProvider');
  return ctx;
}

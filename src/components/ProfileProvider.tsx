'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import type { Team, UserProfile } from '@/lib/teams';

interface ProfileContextType {
  profile: UserProfile | null;
  team: Team | null;
  loading: boolean; // true until we know the profile (or there's no user)
  isMaster: boolean;
  refresh: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [bump, setBump] = useState(0);
  const bootstrappedFor = useRef<string | null>(null);

  const isMaster = (user?.email ?? '').toLowerCase() === MASTER_ADMIN_EMAIL;

  // Ensure the team framework is set up (Dreamland exists, legacy users
  // migrated) and register this user, once per signed-in session.
  useEffect(() => {
    if (!user) {
      bootstrappedFor.current = null;
      return;
    }
    if (bootstrappedFor.current === user.uid) return;
    bootstrappedFor.current = user.uid;
    (async () => {
      try {
        const token = await user.getIdToken();
        await fetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'bootstrap' }),
        });
      } catch (error) {
        console.error('Team bootstrap failed:', error);
      }
    })();
  }, [user, bump]);

  // Live profile from users/{uid}.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data() as Omit<UserProfile, 'uid'> | undefined;
        setProfile(
          data
            ? { uid: user.uid, ...data }
            : { uid: user.uid, name: user.displayName || user.email || 'Unknown', email: user.email }
        );
        setLoading(false);
      },
      (error) => {
        console.error('Profile subscription failed:', error);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, authLoading, bump]);

  // Live team doc for the user's team.
  useEffect(() => {
    const teamId = profile?.teamId;
    if (!teamId) {
      setTeam(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'teams', teamId),
      (snap) => setTeam(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Team, 'id'>) }) : null),
      (error) => console.error('Team subscription failed:', error)
    );
    return unsub;
  }, [profile?.teamId]);

  return (
    <ProfileContext.Provider
      value={{ profile, team, loading: authLoading || loading, isMaster, refresh: () => setBump((n) => n + 1) }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (ctx === undefined) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}

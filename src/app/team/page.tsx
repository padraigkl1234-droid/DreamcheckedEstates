'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Users, Copy, Check, ShieldOff, User as UserFallback } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { profileName, type UserProfile } from '@/lib/teams';

// The user's own team: its name, referral code (to invite colleagues), and the
// list of members with their roles.
export default function TeamPage() {
  const { user } = useAuth();
  const { profile, team } = useProfile();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => setMembers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) }))),
      (error) => console.error('Team members subscription failed:', error)
    );
    return unsub;
  }, [user]);

  const teamMembers = useMemo(
    () => members.filter((m) => m.teamId === profile?.teamId).sort((a, b) => profileName(a).localeCompare(profileName(b))),
    [members, profile?.teamId]
  );

  const copyCode = () => {
    if (!team?.referralCode) return;
    navigator.clipboard?.writeText(team.referralCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="mb-8 flex items-center gap-3">
          <Users className="h-8 w-8 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
              {team?.name ?? 'Your Team'}
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              {teamMembers.length} member{teamMembers.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Referral code */}
        {team?.referralCode && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-neutral-400/25 bg-invictus-surface/60 p-5 shadow-glow-subtle">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">Team referral code</p>
              <p className="font-mono text-2xl tracking-[0.4em] text-invictus-crimson-bright [text-shadow:var(--glow-text-subtle)]">
                {team.referralCode}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">Share this so colleagues can join your team.</p>
            </div>
            <button
              onClick={copyCode}
              className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {/* Members */}
        <div className="space-y-2">
          {teamMembers.map((m) => (
            <div
              key={m.uid}
              className="flex items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 shadow-glow-subtle"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-invictus-crimson-bright/30 bg-invictus-crimson-bright/10">
                {m.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoURL} alt={profileName(m)} className="h-full w-full object-cover" />
                ) : (
                  <UserFallback className="h-5 w-5 text-invictus-crimson-bright" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm text-neutral-100">{profileName(m)}</p>
                  {m.role === 'admin' && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-amber-300">
                      Admin
                    </span>
                  )}
                  {m.blocked && (
                    <span className="flex items-center gap-1 rounded-full border border-alert/50 bg-alert/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-alert">
                      <ShieldOff className="h-2.5 w-2.5" /> Blocked
                    </span>
                  )}
                  {m.uid === user?.uid && (
                    <span className="rounded-full border border-neutral-400/30 bg-neutral-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                      You
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-neutral-500">
                  {m.teamRole || 'No role set'}
                  {m.email ? ` · ${m.email}` : ''}
                </p>
              </div>
            </div>
          ))}
          {teamMembers.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No team members yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

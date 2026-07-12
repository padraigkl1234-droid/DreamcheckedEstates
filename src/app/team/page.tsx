'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Users, Copy, Check, ShieldOff, User as UserFallback, Star, ShieldCheck, Eye, Loader2 } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { InvictusSelect } from '@/components/InvictusSelect';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import {
  profileName,
  rankOf,
  isCommander,
  canManageRank,
  RANK_LABELS,
  type Rank,
  type UserProfile,
} from '@/lib/teams';

const isMasterEmail = (m: UserProfile) => (m.email ?? '').toLowerCase() === MASTER_ADMIN_EMAIL;

// Chain-of-command tiers, top to bottom, for the Command Structure ladder.
const TIERS: { key: 'master' | Rank; label: string; icon: typeof Star; accent: string }[] = [
  { key: 'master', label: 'Master Command', icon: Star, accent: 'text-amber-300 border-amber-400/40 bg-amber-400/10' },
  { key: 'commander', label: 'Commanders', icon: ShieldCheck, accent: 'text-invictus-crimson-bright border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10' },
  { key: 'member', label: 'Members', icon: Users, accent: 'text-neutral-300 border-neutral-400/30 bg-neutral-400/10' },
  { key: 'viewer', label: 'Viewers', icon: Eye, accent: 'text-sky-300 border-sky-400/40 bg-sky-400/10' },
];

// The user's own team: its name, referral code (to invite colleagues), and the
// chain of command with rank-management controls.
export default function TeamPage() {
  const { user } = useAuth();
  const { profile, team, isMaster } = useProfile();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [copied, setCopied] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Can the current user manage ranks at all? (Master, or a team commander.)
  const canManage = isMaster || isCommander(profile);

  const copyCode = () => {
    if (!team?.referralCode) return;
    navigator.clipboard?.writeText(team.referralCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const changeRank = async (targetUid: string, rank: Rank) => {
    if (!user) return;
    setBusyUid(targetUid);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'setRank', targetUid, rank }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Could not change rank.');
      // The users onSnapshot reflects the change live.
    } catch (e) {
      console.error('setRank failed:', e);
      setError('Could not change rank.');
    } finally {
      setBusyUid(null);
    }
  };

  // Group members into command tiers. The master (by email) always sits at the top.
  const tiered = useMemo(() => {
    const masters = teamMembers.filter(isMasterEmail);
    const rest = teamMembers.filter((m) => !isMasterEmail(m));
    return {
      master: masters,
      commander: rest.filter((m) => rankOf(m) === 'commander'),
      member: rest.filter((m) => rankOf(m) === 'member'),
      viewer: rest.filter((m) => rankOf(m) === 'viewer'),
    } as Record<'master' | Rank, UserProfile[]>;
  }, [teamMembers]);

  // Rank options the current user is allowed to assign to a given target.
  const optionsFor = (m: UserProfile): { value: string; label: string }[] => {
    if (isMasterEmail(m) || m.uid === user?.uid) return []; // never manage master or yourself
    return (['commander', 'member', 'viewer'] as Rank[])
      .filter((r) => canManageRank(profile, m, r, isMaster))
      .map((r) => ({ value: r, label: RANK_LABELS[r] }));
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

        {/* Command Structure ladder */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-[0.25em] text-neutral-300 [text-shadow:var(--glow-text-subtle)]">
            Command Structure
          </h2>
          {canManage && <p className="text-[10px] uppercase tracking-widest text-neutral-600">Manage ranks below</p>}
        </div>
        {error && <p className="mb-3 text-xs text-alert">{error}</p>}

        <div className="space-y-6">
          {TIERS.map((tier) => {
            const group = tiered[tier.key];
            if (!group || group.length === 0) return null;
            const TierIcon = tier.icon;
            return (
              <div key={tier.key}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${tier.accent}`}>
                    <TierIcon className="h-3 w-3" /> {tier.label}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-neutral-400/20 to-transparent" />
                  <span className="text-[10px] text-neutral-600">{group.length}</span>
                </div>
                <div className="space-y-2">
                  {group.map((m) => {
                    const opts = optionsFor(m);
                    return (
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
                        {/* Rank control — only when the current user may manage this person. */}
                        {canManage && opts.length > 0 && (
                          <div className="flex shrink-0 items-center gap-2">
                            {busyUid === m.uid && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500" />}
                            <InvictusSelect
                              compact
                              value={rankOf(m)}
                              onChange={(v) => changeRank(m.uid, v as Rank)}
                              options={opts}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {teamMembers.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No team members yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

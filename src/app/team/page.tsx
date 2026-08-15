'use client';

// Team — the user's own team: name, referral code (to invite colleagues),
// the chain-of-command ladder with rank management, and two safety-role
// badges (Fire Marshal / First Aider) that only a commander or master can
// grant — enforced in firestore.rules, not just hidden in the UI, so a
// member can't self-assign one.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  Users,
  Copy,
  Check,
  ShieldOff,
  User as UserFallback,
  Star,
  ShieldCheck,
  Eye,
  Loader2,
  Flame,
  HeartPulse,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { InvictusSelect } from '@/components/InvictusSelect';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import {
  featureEnabled,
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

const BADGES = [
  { key: 'fireMarshal', label: 'Fire Marshal', icon: Flame },
  { key: 'firstAider', label: 'First Aider', icon: HeartPulse },
] as const;

export default function TeamPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const pageEnabled = isMaster || featureEnabled(team?.features, 'team');
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

  // Can the current user manage ranks and safety badges? (Master, or a team commander.)
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

  const toggleBadge = async (member: UserProfile, key: 'fireMarshal' | 'firstAider') => {
    if (!canManage || busyUid) return;
    setBusyUid(member.uid);
    setError(null);
    try {
      await updateDoc(doc(db, 'users', member.uid), { [key]: !member[key] });
    } catch (e) {
      console.error(`Failed to update ${key}:`, e);
      setError("Couldn't save that — publish the latest Firestore rules (the users fireMarshal/firstAider block) if this keeps happening.");
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

  const chrome = (body: React.ReactNode) => (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex-1 overflow-y-auto bg-invictus-base font-sans text-neutral-100">{body}</main>
    </div>
  );

  if (!profileLoading && !pageEnabled) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Team isn&apos;t enabled for your team.</p>
      </div>
    );
  }

  if (!user) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Sign in to view your team.</p>
      </div>
    );
  }

  return chrome(
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm uppercase tracking-[0.25em] text-neutral-300 [text-shadow:var(--glow-text-subtle)]">
          Command Structure
        </h2>
        {canManage && (
          <p className="text-[10px] uppercase tracking-widest text-neutral-600">
            Manage ranks and safety badges below
          </p>
        )}
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
                  const busy = busyUid === m.uid;
                  return (
                    <div
                      key={m.uid}
                      className="flex flex-col gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3 shadow-glow-subtle sm:flex-row sm:items-center"
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

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {/* Fire Marshal / First Aider — a commander/master sees a toggle
                            for every badge; anyone else only sees the ones actually granted. */}
                        {BADGES.map(({ key, label, icon: Icon }) => {
                          const on = Boolean(m[key]);
                          if (!canManage) {
                            return on ? (
                              <span
                                key={key}
                                className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-amber-300"
                              >
                                <Icon className="h-3 w-3" /> {label}
                              </span>
                            ) : null;
                          }
                          return (
                            <button
                              key={key}
                              onClick={() => toggleBadge(m, key)}
                              disabled={busy}
                              title={on ? `Revoke ${label}` : `Grant ${label}`}
                              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                                on
                                  ? 'border-amber-400/50 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
                                  : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-600 hover:border-amber-400/30 hover:text-amber-400/70'
                              }`}
                            >
                              <Icon className="h-3 w-3" /> {label}
                            </button>
                          );
                        })}
                        {/* Rank control — only when the current user may manage this person. */}
                        {canManage && opts.length > 0 && (
                          <div className="flex shrink-0 items-center gap-2">
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500" />}
                            <InvictusSelect compact value={rankOf(m)} onChange={(v) => changeRank(m.uid, v as Rank)} options={opts} />
                          </div>
                        )}
                      </div>
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
  );
}

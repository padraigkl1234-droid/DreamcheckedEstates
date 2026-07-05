'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Crown, RefreshCw, Plus, Copy, Check, ShieldOff, ShieldCheck, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { InvictusSelect } from '@/components/InvictusSelect';
import { profileName, type Team, type UserProfile } from '@/lib/teams';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';

type Action =
  | { action: 'list' }
  | { action: 'createTeam'; name: string }
  | { action: 'regenCode'; teamId: string }
  | { action: 'moveUser'; targetUid: string; teamId: string }
  | { action: 'block'; targetUid: string }
  | { action: 'unblock'; targetUid: string }
  | { action: 'remove'; targetUid: string; deleteData: boolean };

export default function MasterPage() {
  const { user } = useAuth();
  const { isMaster } = useProfile();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copiedTeam, setCopiedTeam] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const call = useCallback(
    async (payload: Action) => {
      if (!user) return null;
      const token = await user.getIdToken();
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      return data;
    },
    [user]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ action: 'list' });
      if (data) {
        setTeams((data.teams as Team[]) ?? []);
        setUsers((data.users as UserProfile[]) ?? []);
      }
    } catch (e) {
      setMessage(`Failed to load: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (isMaster) refresh();
  }, [isMaster, refresh]);

  const run = async (payload: Action, targetUid?: string) => {
    setBusyUid(targetUid ?? '__global__');
    setMessage(null);
    try {
      await call(payload);
      await refresh();
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`);
    } finally {
      setBusyUid(null);
      setConfirmRemove(null);
    }
  };

  if (!isMaster) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-invictus-base text-neutral-500">
        <p className="text-xs uppercase tracking-widest">Master admin only.</p>
      </div>
    );
  }

  const teamOptions = teams.map((t) => ({ value: t.id, label: t.name }));
  const unassigned = users.filter((u) => !u.teamId);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Crown className="h-8 w-8 text-amber-300 drop-shadow-glow-subtle" />
            <div>
              <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
                Master Console
              </h1>
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
                {teams.length} teams · {users.length} people
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {message && <p className="mb-4 text-xs text-alert">{message}</p>}

        {/* Create team */}
        <div className="mb-8 flex flex-wrap items-center gap-2 border border-neutral-400/25 bg-invictus-surface/60 p-4 shadow-glow-subtle">
          <input
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            placeholder="New team / company name"
            className="min-w-0 flex-1 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <button
            onClick={async () => {
              if (!newTeam.trim()) return;
              await run({ action: 'createTeam', name: newTeam.trim() });
              setNewTeam('');
            }}
            className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20"
          >
            <Plus className="h-4 w-4" /> Create Team
          </button>
        </div>

        {loading && teams.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-invictus-crimson-bright" />
          </div>
        ) : (
          <div className="space-y-6">
            {teams.map((team) => {
              const teamMembers = users.filter((u) => u.teamId === team.id);
              return (
                <section key={team.id} className="border border-neutral-400/25 bg-invictus-surface/40 shadow-glow-subtle">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-400/15 p-4">
                    <div className="flex items-center gap-3">
                      <h2 className="font-display text-lg uppercase tracking-[0.15em] text-neutral-100">{team.name}</h2>
                      <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-200">
                        {teamMembers.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(team.referralCode);
                          setCopiedTeam(team.id);
                          setTimeout(() => setCopiedTeam((c) => (c === team.id ? null : c)), 1500);
                        }}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-2.5 py-1.5 font-mono text-xs tracking-[0.2em] text-invictus-crimson-bright transition-colors hover:border-invictus-crimson-bright/40"
                        title="Copy referral code"
                      >
                        {team.referralCode}
                        {copiedTeam === team.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => run({ action: 'regenCode', teamId: team.id })}
                        className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
                        title="Generate a new referral code"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-neutral-400/10">
                    {teamMembers.map((m) => (
                      <UserRow
                        key={m.uid}
                        m={m}
                        teamOptions={teamOptions}
                        busy={busyUid === m.uid}
                        confirmRemove={confirmRemove === m.uid}
                        onMove={(teamId) => run({ action: 'moveUser', targetUid: m.uid, teamId }, m.uid)}
                        onBlock={() => run({ action: m.blocked ? 'unblock' : 'block', targetUid: m.uid }, m.uid)}
                        onRemoveClick={() => setConfirmRemove(m.uid)}
                        onRemoveConfirm={(deleteData) => run({ action: 'remove', targetUid: m.uid, deleteData }, m.uid)}
                        onCancelRemove={() => setConfirmRemove(null)}
                      />
                    ))}
                    {teamMembers.length === 0 && (
                      <p className="px-4 py-6 text-center text-xs text-neutral-600">No members in this team.</p>
                    )}
                  </div>
                </section>
              );
            })}

            {unassigned.length > 0 && (
              <section className="border border-amber-400/25 bg-amber-400/5 shadow-glow-subtle">
                <div className="border-b border-amber-400/15 p-4">
                  <h2 className="font-display text-lg uppercase tracking-[0.15em] text-amber-200">Unassigned</h2>
                  <p className="text-[11px] text-neutral-500">Signed in but not yet in a team.</p>
                </div>
                <div className="divide-y divide-neutral-400/10">
                  {unassigned.map((m) => (
                    <UserRow
                      key={m.uid}
                      m={m}
                      teamOptions={teamOptions}
                      busy={busyUid === m.uid}
                      confirmRemove={confirmRemove === m.uid}
                      onMove={(teamId) => run({ action: 'moveUser', targetUid: m.uid, teamId }, m.uid)}
                      onBlock={() => run({ action: m.blocked ? 'unblock' : 'block', targetUid: m.uid }, m.uid)}
                      onRemoveClick={() => setConfirmRemove(m.uid)}
                      onRemoveConfirm={(deleteData) => run({ action: 'remove', targetUid: m.uid, deleteData }, m.uid)}
                      onCancelRemove={() => setConfirmRemove(null)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({
  m,
  teamOptions,
  busy,
  confirmRemove,
  onMove,
  onBlock,
  onRemoveClick,
  onRemoveConfirm,
  onCancelRemove,
}: {
  m: UserProfile;
  teamOptions: { value: string; label: string }[];
  busy: boolean;
  confirmRemove: boolean;
  onMove: (teamId: string) => void;
  onBlock: () => void;
  onRemoveClick: () => void;
  onRemoveConfirm: (deleteData: boolean) => void;
  onCancelRemove: () => void;
}) {
  const [deleteData, setDeleteData] = useState(false);
  const isMasterAccount = (m.email ?? '').toLowerCase() === MASTER_ADMIN_EMAIL;
  const smallBtn =
    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-all disabled:opacity-40';

  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm text-neutral-100">{profileName(m)}</p>
          {isMasterAccount && (
            <span className="rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-amber-300">
              Master
            </span>
          )}
          {m.blocked && (
            <span className="rounded-full border border-alert/50 bg-alert/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-alert">
              Blocked
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-neutral-500">
          {m.teamRole || 'No role'}
          {m.email ? ` · ${m.email}` : ''}
        </p>
      </div>

      {!isMasterAccount &&
        (confirmRemove ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-neutral-400">
              <input type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} className="h-3.5 w-3.5 accent-red-600" />
              Also delete data
            </label>
            <button onClick={() => onRemoveConfirm(deleteData)} disabled={busy} className={`${smallBtn} border-alert/50 bg-alert/15 text-alert hover:bg-alert/25`}>
              <Trash2 className="h-3.5 w-3.5" /> Confirm
            </button>
            <button onClick={onCancelRemove} disabled={busy} className={`${smallBtn} border-neutral-400/30 bg-invictus-base/60 text-neutral-300 hover:text-invictus-crimson-bright`}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <InvictusSelect
                value={m.teamId ?? ''}
                onChange={(teamId) => teamId && teamId !== m.teamId && onMove(teamId)}
                title="Move to team"
                className="bg-invictus-base/60"
                options={[{ value: '', label: 'Unassigned' }, ...teamOptions]}
              />
            </div>
            <button
              onClick={onBlock}
              disabled={busy}
              className={`${smallBtn} ${m.blocked ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20' : 'border-alert/40 bg-alert/10 text-alert hover:bg-alert/20'}`}
            >
              {m.blocked ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
              {m.blocked ? 'Unblock' : 'Freeze'}
            </button>
            <button onClick={onRemoveClick} disabled={busy} className={`${smallBtn} border-neutral-400/30 bg-invictus-base/60 text-neutral-300 hover:border-alert/40 hover:text-alert`}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        ))}
    </div>
  );
}

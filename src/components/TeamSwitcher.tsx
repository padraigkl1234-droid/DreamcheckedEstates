'use client';

// Moving between the teams you belong to, from the account menu.
//
// Switching changes exactly one thing: which team your user document points
// at. Team data — board notes, site closures, shows, reports, inspections,
// hotel rooms — is stored against the team and stays there. Your tasks, your
// archive and your compliance are stored against your uid and come with you.
// Nothing is deleted on either side, so hopping back and forth is safe.

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, BedDouble, Check, Loader2 } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';

interface SwitchableTeam {
  id: string;
  name: string;
  module: string | null;
}

export function TeamSwitcher() {
  const { user } = useAuth();
  const { profile, refresh } = useProfile();
  const router = useRouter();
  const [teams, setTeams] = useState<SwitchableTeam[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'myTeams' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTeams((data as { teams?: SwitchableTeam[] }).teams ?? []);
    } catch {
      /* the switcher simply doesn't appear if this fails */
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load, profile?.teamId]);

  const switchTo = async (team: SwitchableTeam) => {
    if (!user || team.id === profile?.teamId) return;
    setBusyId(team.id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'switchTeam', teamId: team.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Could not switch team');
      refresh();
      // A hotel team's home is its own hub, not the estates tracker.
      router.push(team.module === 'hotel' ? '/hotel' : '/jarvis-tracker');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // Nothing to switch between — don't clutter the menu with a list of one.
  if (teams.length < 2) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="flex items-center gap-2 text-[10px] font-normal uppercase tracking-widest text-muted-foreground">
        <ArrowLeftRight className="h-3 w-3" /> Switch team
      </DropdownMenuLabel>
      {teams.map((team) => {
        const current = team.id === profile?.teamId;
        return (
          <DropdownMenuItem
            key={team.id}
            onClick={(e) => {
              e.preventDefault();
              switchTo(team);
            }}
            disabled={current || busyId !== null}
            className="cursor-pointer gap-2"
          >
            {busyId === team.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : current ? (
              <Check className="h-4 w-4 text-primary" />
            ) : team.module === 'hotel' ? (
              <BedDouble className="h-4 w-4" />
            ) : (
              <span className="h-4 w-4" />
            )}
            <span className="truncate">{team.name}</span>
          </DropdownMenuItem>
        );
      })}
      {error && <p className="px-2 py-1 text-[10px] text-destructive">{error}</p>}
    </>
  );
}

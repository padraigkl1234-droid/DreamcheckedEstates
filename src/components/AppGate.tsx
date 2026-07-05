'use client';

import React, { useState } from 'react';
import { LogIn, LogOut, Users, Loader2, ArrowRight } from 'lucide-react';
import { Pinwheel } from '@/components/icons/Pinwheel';
import { BRAND_NAME_DOTTED } from '@/lib/brand';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';

// Gates the whole app: signed-out users see a login/signup screen; signed-in
// users without a team enter a referral code to join theirs; everyone else
// gets the app. The master admin is above teams and never gated on one.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-invictus-base px-4 font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-invictus-crimson-bright/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-invictus-crimson-bright/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 animate-scanlines opacity-[0.05] mix-blend-screen"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 8px)',
        }}
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}

function LoginLanding() {
  const { login, authError } = useAuth();
  return (
    <Shell>
      <div className="relative border border-neutral-400/25 bg-invictus-surface/70 p-8 shadow-glow-strong backdrop-blur-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Pinwheel className="mb-4 h-14 w-14 animate-[spin_6s_linear_infinite] text-invictus-crimson-bright drop-shadow-glow-strong" />
          <h1 className="font-display text-3xl uppercase tracking-[0.3em] text-neutral-100 [text-shadow:var(--glow-text-strong)]">
            {BRAND_NAME_DOTTED}
          </h1>
          <p className="mt-3 text-xs uppercase tracking-[0.25em] text-neutral-500">Estate Operations Platform</p>
        </div>
        <button
          onClick={() => login()}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-3 text-sm font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
        >
          <LogIn className="h-4 w-4" /> Sign in / Sign up with Google
        </button>
        {authError && <p className="mt-4 text-center text-xs text-alert">{authError}</p>}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-neutral-500">
          New here? Sign in with Google, then enter your team&apos;s referral code to join.
        </p>
      </div>
    </Shell>
  );
}

function JoinTeam() {
  const { user, logout } = useAuth();
  const { refresh } = useProfile();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'join', code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Could not join that team');
      refresh(); // pull the updated profile so the gate opens
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="relative border border-neutral-400/25 bg-invictus-surface/70 p-8 shadow-glow-strong backdrop-blur-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Users className="mb-3 h-10 w-10 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <h1 className="font-display text-xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
            Join your team
          </h1>
          <p className="mt-2 text-xs text-neutral-500">
            Welcome{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}. Enter the referral
            code from your team admin to get access.
          </p>
        </div>
        <form onSubmit={join} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="REFERRAL CODE"
            autoFocus
            className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-4 py-3 text-center font-mono text-lg uppercase tracking-[0.4em] text-neutral-100 placeholder:tracking-[0.2em] placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          {error && <p className="text-center text-xs text-alert">{error}</p>}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-3 text-sm font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Join Team
          </button>
        </form>
        <button
          onClick={() => logout()}
          className="mt-6 flex w-full items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
        >
          <LogOut className="h-3.5 w-3.5" /> Signed in as {user?.email} · Sign out
        </button>
      </div>
    </Shell>
  );
}

function GateSpinner() {
  return (
    <Shell>
      <div className="flex flex-col items-center gap-4">
        <Pinwheel className="h-12 w-12 animate-[spin_1.4s_linear_infinite] text-invictus-crimson-bright drop-shadow-glow-subtle" />
        <p className="text-[11px] uppercase tracking-[0.3em] text-neutral-600">Loading</p>
      </div>
    </Shell>
  );
}

export function AppGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, isMaster } = useProfile();

  if (authLoading) return <GateSpinner />;
  if (!user) return <LoginLanding />;
  if (profileLoading) return <GateSpinner />;
  // Master admin is above teams — never gated on team membership.
  if (!isMaster && !profile?.teamId) return <JoinTeam />;
  return <>{children}</>;
}

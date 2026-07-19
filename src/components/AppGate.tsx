'use client';

import React, { useState } from 'react';
import { LogIn, LogOut, Users, Loader2, ArrowRight } from 'lucide-react';
import { Pinwheel } from '@/components/icons/Pinwheel';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useT } from '@/components/LanguageProvider';

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
  const t = useT();
  return (
    <Shell>
      <div className="relative border border-neutral-400/25 bg-invictus-surface/70 p-8 shadow-glow-strong backdrop-blur-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Pinwheel className="mb-4 h-12 w-12 text-neutral-100" />
          <h1 className="text-3xl font-bold tracking-tight text-neutral-100">Invictus</h1>
          <p className="mt-2 text-sm text-neutral-500">{t('gate.tagline')}</p>
        </div>
        <button
          onClick={() => login()}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-3 text-sm font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
        >
          <LogIn className="h-4 w-4" /> {t('gate.signIn')}
        </button>
        {authError && <p className="mt-4 text-center text-xs text-alert">{authError}</p>}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-neutral-500">{t('gate.newHere')}</p>
      </div>
    </Shell>
  );
}

function JoinTeam() {
  const { user, logout } = useAuth();
  const { refresh } = useProfile();
  const t = useT();
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
            {t('join.title')}
          </h1>
          <p className="mt-2 text-xs text-neutral-500">{t('join.subtitle')}</p>
        </div>
        <form onSubmit={join} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('join.codePlaceholder')}
            autoFocus
            className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-4 py-3 text-center font-mono text-lg uppercase tracking-[0.4em] text-neutral-100 placeholder:tracking-[0.2em] placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          {error && <p className="text-center text-xs text-alert">{error}</p>}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-3 text-sm font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {t('join.button')}
          </button>
        </form>
        <button
          onClick={() => logout()}
          className="mt-6 flex w-full items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
        >
          <LogOut className="h-3.5 w-3.5" /> {t('common.signedInAs')} {user?.email} · {t('common.signOut')}
        </button>
      </div>
    </Shell>
  );
}

function GateSpinner() {
  const t = useT();
  return (
    <Shell>
      <div className="flex flex-col items-center gap-4">
        <Pinwheel className="h-12 w-12 animate-[spin_1.4s_linear_infinite] text-invictus-crimson-bright drop-shadow-glow-subtle" />
        <p className="text-[11px] uppercase tracking-[0.3em] text-neutral-600">{t('gate.loading')}</p>
      </div>
    </Shell>
  );
}

function TeamArchived() {
  const { user, logout } = useAuth();
  const t = useT();
  return (
    <Shell>
      <div className="relative border border-neutral-400/25 bg-invictus-surface/70 p-8 text-center shadow-glow-strong backdrop-blur-md">
        <Users className="mx-auto mb-3 h-10 w-10 text-neutral-500" />
        <h1 className="font-display text-xl uppercase tracking-[0.2em] text-neutral-100">{t('archived.title')}</h1>
        <p className="mt-2 text-xs text-neutral-500">{t('archived.body')}</p>
        <button
          onClick={() => logout()}
          className="mt-6 flex w-full items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
        >
          <LogOut className="h-3.5 w-3.5" /> {t('common.signedInAs')} {user?.email} · {t('common.signOut')}
        </button>
      </div>
    </Shell>
  );
}

export function AppGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { profile, team, loading: profileLoading, isMaster } = useProfile();

  if (authLoading) return <GateSpinner />;
  if (!user) return <LoginLanding />;
  if (profileLoading) return <GateSpinner />;
  // Master admin is above teams — never gated on team membership.
  if (!isMaster && !profile?.teamId) return <JoinTeam />;
  if (!isMaster && team?.archived) return <TeamArchived />;
  return <>{children}</>;
}

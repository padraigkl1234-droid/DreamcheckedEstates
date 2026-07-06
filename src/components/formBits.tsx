'use client';

import React from 'react';

/** Shared form primitives used by the onboarding screen and the profile editor. */

export const inputClass =
  'w-full rounded-md border border-white/12 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-sky-400/50 focus:outline-none';

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs tracking-wide transition-all ${
        active
          ? 'border-sky-400/70 bg-sky-400/15 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
          : 'border-white/12 bg-white/[0.02] text-white/55 hover:border-sky-400/30 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-display text-[10px] uppercase tracking-[0.25em] text-white/40">{label}</div>
      {children}
    </div>
  );
}

export const GOALS = ['Build muscle', 'Lose fat', 'Get stronger', 'Improve endurance', 'General fitness'];
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
export const DAYS = [2, 3, 4, 5, 6];
export const EQUIPMENT = ['Full gym', 'Barbell', 'Dumbbells', 'Kettlebells', 'Resistance bands', 'Bodyweight only'];
export const SEXES = ['Male', 'Female', 'Other'];

'use client';

// Small shared building blocks for the hotel hub, in the INVICTUS look.

import React from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useHotel } from '@/components/hotel/HotelProvider';
import type { HotelRole } from '@/lib/hotel/types';

export const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

export const primaryButton =
  'flex items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-50';

export const ghostButton =
  'flex items-center justify-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-neutral-100 disabled:opacity-50';

export function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`mb-1 block text-[10px] uppercase tracking-widest text-neutral-500 ${className}`}>{children}</label>;
}

export function SectionTitle({ icon: Icon, children, right }: { icon?: typeof Lock; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
        {Icon && <Icon className="h-3.5 w-3.5" />} {children}
      </h2>
      {right}
    </div>
  );
}

export function Pill({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${className}`}>
      {children}
    </span>
  );
}

/** A row of large toggle chips — one-handed friendly pickers. */
export function ChipPicker<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; accent?: string }[];
  size?: 'md' | 'lg';
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`rounded-md border font-semibold transition-colors ${size === 'lg' ? 'min-h-[48px] px-4 text-sm' : 'px-3 py-1.5 text-xs'} ${
              on
                ? o.accent ?? 'border-invictus-crimson-bright/70 bg-invictus-crimson-bright/20 text-neutral-100'
                : 'border-neutral-400/25 bg-invictus-base/60 text-neutral-400 hover:text-neutral-200'
            } ${on && o.accent ? 'ring-1 ring-current' : ''}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: typeof Lock;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[38px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink max-md:text-[26px]">
          <Icon className="h-6 w-6 shrink-0 text-invictus-crimson-bright" />
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">{children}</div>;
}

export function Spinner() {
  return (
    <Centered>
      <Loader2 className="h-6 w-6 animate-spin text-invictus-crimson-bright" />
    </Centered>
  );
}

/** Renders children only for the given hotel roles. */
export function RoleGate({ allow, children }: { allow: HotelRole[]; children: React.ReactNode }) {
  const { role, loading } = useHotel();
  if (loading) return <Spinner />;
  if (!role || !allow.includes(role)) {
    return (
      <Centered>
        <p className="flex max-w-sm flex-col items-center gap-2 text-sm text-neutral-500">
          <Lock className="h-6 w-6" />
          This page isn&apos;t part of your role.
        </p>
      </Centered>
    );
  }
  return <>{children}</>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-neutral-400/20 py-8 text-center text-xs text-neutral-600">{children}</p>;
}

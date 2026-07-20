'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// A dropdown styled for the INVICTUS theme — dark surface, crimson accents —
// replacing the browser-native <select> popup (which can't be themed).

export interface InvictusSelectOption {
  value: string;
  label: string;
}

// Radix selects can't carry an empty-string item value, but several forms use
// '' to mean "none" — map it through a sentinel transparently.
const EMPTY_SENTINEL = '__empty__';
const toRadix = (v: string) => (v === '' ? EMPTY_SENTINEL : v);
const fromRadix = (v: string) => (v === EMPTY_SENTINEL ? '' : v);

export function InvictusSelect({
  value,
  onChange,
  options,
  title,
  className = '',
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: InvictusSelectOption[];
  title?: string;
  className?: string;
  compact?: boolean; // smaller paddings/text, colours left to className
}) {
  const base = compact
    ? 'h-auto w-full min-w-0 rounded-md border bg-invictus-raised px-2 py-1 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0'
    : 'h-auto w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-surface/60 px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:ring-1 focus:ring-invictus-crimson-bright/50 focus:ring-offset-0 data-[state=open]:border-invictus-crimson-bright/60';
  return (
    <Select value={toRadix(value)} onValueChange={(v) => onChange(fromRadix(v))}>
      <SelectTrigger title={title} className={`${base} ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border border-invictus-crimson-bright/40 bg-invictus-surface text-neutral-100 shadow-glow-subtle backdrop-blur-md">
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={toRadix(opt.value)}
            className="text-sm text-neutral-200 focus:bg-invictus-crimson-bright/20 focus:text-neutral-50 data-[state=checked]:text-invictus-crimson-bright"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

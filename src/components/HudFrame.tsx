'use client';

import React from 'react';

/**
 * A framed HUD container with animated corner brackets and a title bar,
 * used for the side panels. Purely presentational.
 */
export function HudFrame({
  title,
  side = 'left',
  accent = 'sky',
  onClose,
  children,
}: {
  title: string;
  side?: 'left' | 'right';
  accent?: 'sky' | 'amber';
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const line = accent === 'amber' ? 'border-amber-400/30' : 'border-sky-400/25';
  const glow = accent === 'amber' ? 'text-amber-300' : 'text-sky-300';
  const bracket = accent === 'amber' ? 'border-amber-400/60' : 'border-sky-400/50';

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-md border ${line} bg-black/40 backdrop-blur-md`}
      style={{ boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)' }}
    >
      {/* Corner brackets */}
      <span className={`pointer-events-none absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 ${bracket}`} />
      <span className={`pointer-events-none absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 ${bracket}`} />
      <span className={`pointer-events-none absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 ${bracket}`} />
      <span className={`pointer-events-none absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 ${bracket}`} />

      {/* Title bar */}
      <div className={`flex items-center justify-between border-b ${line} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full ${accent === 'amber' ? 'bg-amber-400' : 'bg-sky-400'}`} />
          <span className={`font-display text-[10px] font-medium uppercase tracking-[0.28em] ${glow}`}>
            {title}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/40 transition-colors hover:text-white/80 lg:hidden"
            aria-label={`Close ${title}`}
          >
            <span className="text-xs">✕</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 text-white/80 [scrollbar-width:thin]">
        {children}
      </div>
    </div>
  );
}

/** A section heading inside a HUD panel. */
export function HudSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 font-display text-[9px] uppercase tracking-[0.25em] text-white/35">{label}</div>
      {children}
    </div>
  );
}

/** A horizontal target/progress bar with a glowing fill. */
export function HudBar({
  label,
  value,
  target,
  unit,
  accent = 'sky',
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  accent?: 'sky' | 'amber' | 'violet' | 'emerald';
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = value > target && target > 0;
  const colors: Record<string, string> = {
    sky: 'from-sky-500 to-cyan-300',
    amber: 'from-amber-500 to-yellow-300',
    violet: 'from-violet-500 to-fuchsia-300',
    emerald: 'from-emerald-500 to-teal-300',
  };
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-white/55">{label}</span>
        <span className="font-display text-[11px] tabular-nums text-white/80">
          {Math.round(value)}
          <span className="text-white/35"> / {target}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${colors[accent]} transition-all duration-700`}
          style={{ width: `${pct}%`, boxShadow: over ? '0 0 8px rgba(251,191,36,0.8)' : '0 0 8px rgba(56,189,248,0.5)' }}
        />
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  return `${weekday} ${d.getDate()} ${month}`;
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-[64px]" />;

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="font-display text-4xl font-normal tabular-nums tracking-[0.08em] text-white sm:text-5xl [text-shadow:0_0_18px_rgba(255,255,255,0.35)]">
        {formatTime(now)}
      </span>
      <span className="font-display text-xs font-normal tracking-[0.3em] text-white/70 sm:text-sm">
        {formatDate(now)}
      </span>
    </div>
  );
}

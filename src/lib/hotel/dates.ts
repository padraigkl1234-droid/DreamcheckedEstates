// Date helpers for the hotel module. Dates are local calendar days as
// YYYY-MM-DD strings (what the hotel means by "today"); instants are ms.

import type { CheckFrequency } from '@/lib/hotel/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(now: Date = new Date()): string {
  return dateStr(now);
}

/** Midnight at the start of a YYYY-MM-DD day, local time. */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** [start, end) of a day in ms, for filtering instants that fall on it. */
export function dayRange(s: string): [number, number] {
  const start = parseDate(s).getTime();
  return [start, parseDate(addDays(s, 1)).getTime()];
}

/** The next due date after a check is done on `from`. */
export function advanceByFrequency(from: string, freq: CheckFrequency): string {
  const d = parseDate(from);
  switch (freq) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'annual':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return dateStr(d);
}

export function formatTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${formatTime(ms)}`;
}

export function formatDate(s: string): string {
  return parseDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "3h", "2d" — age of a fault in the queue. */
export function ageLabel(since: number, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - since) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

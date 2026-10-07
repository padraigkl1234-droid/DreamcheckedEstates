// Areas marked out of use for a day or a stretch of days — the data behind
// the Site Status board (/site-status), which is meant to be thrown up on a
// screen so everyone working on site can see at a glance what's shut.
//
// A closure comes in two shapes.
//
// A ZONE closure names a place by its SITE_ZONES label, the same string a
// task's `area` holds. It needs no separate list of locations, and a label
// drawn on the map in more than one piece (Scenic Railway, Peppermint Bar)
// lights up in all of them — which is what you want: it's one place, however
// many boxes it takes to draw.
//
// A DRAWN closure is a box dragged straight onto the map. Real estate work
// doesn't respect zone boundaries — a scaffold run can take half the food
// court and a slice of the walkway beside it — so the shut area is whatever
// was dragged, and the names of the zones it covers are recorded alongside
// it purely so the closure reads sensibly in a list.

import { SITE_ZONES } from '@/lib/siteMapData';

export interface SiteClosureRect {
  /** Map units, matching the SVG viewBox (MAP_W x MAP_H). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SiteClosure {
  id: string;
  teamId: string;
  /** A SITE_ZONES label — set on zone closures, absent on drawn ones. */
  area?: string;
  /** The dragged box — set on drawn closures, absent on zone ones. */
  rect?: SiteClosureRect;
  /** For a drawn closure, the zones it covers, for display only. */
  label?: string;
  /** Why it's shut, e.g. "Resurfacing — scaffold up". Optional. */
  reason?: string;
  /** First day out of use, inclusive. YYYY-MM-DD. */
  startDate: string;
  /** Last day out of use, inclusive. Absent/null = until someone reopens it. */
  endDate?: string | null;
  createdAt: number;
  /** Who set it. Stored for the rules and for chasing it up; not shown on the board. */
  createdBy: string;
}

/** What to call a closure in a list: the zone it names, or the zones the
 *  drawn box happens to sit over. */
export function closureTitle(c: SiteClosure): string {
  return c.area || c.label || 'Marked area';
}

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `iso` moved by whole days. Anchored at midday UTC so a clock change can't
 *  tip the arithmetic into the day either side. */
export function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Monday 6 October" — the long form the board headline uses. */
export function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "6 Oct" — the short form for date ranges in a list. */
export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Whether a closure covers the given day. String comparison is safe here:
 *  YYYY-MM-DD sorts lexicographically in date order. */
export function closureActiveOn(c: SiteClosure, iso: string): boolean {
  if (iso < c.startDate) return false;
  return !c.endDate || iso <= c.endDate;
}

/** The closures covering a day, in name order. */
export function closuresOn(closures: SiteClosure[], iso: string): SiteClosure[] {
  return closures
    .filter((c) => closureActiveOn(c, iso))
    .sort((a, b) => closureTitle(a).localeCompare(closureTitle(b)));
}

/** Just the named zones shut on a day — what the map colours whole zones by.
 *  Drawn closures are deliberately absent: their box is the highlight, so
 *  filling the zones under it as well would double up. */
export function closedAreasOn(closures: SiteClosure[], iso: string): Set<string> {
  return new Set(
    closuresOn(closures, iso)
      .map((c) => c.area)
      .filter((a): a is string => Boolean(a))
  );
}

/** The drawn boxes shut on a day, with the text to print inside each. */
export function closedRectsOn(
  closures: SiteClosure[],
  iso: string
): { id: string; rect: SiteClosureRect; text: string }[] {
  return closuresOn(closures, iso)
    .filter((c): c is SiteClosure & { rect: SiteClosureRect } => Boolean(c.rect))
    .map((c) => ({ id: c.id, rect: c.rect, text: c.reason?.trim() || closureTitle(c) }));
}

/** The named zones whose centre falls inside a drawn box. Used to give a
 *  dragged closure a readable name — "Food Court, Peppermint Bar" — without
 *  making the box itself snap to anything. */
export function zonesUnderRect(rect: SiteClosureRect): string[] {
  const names: string[] = [];
  for (const z of SITE_ZONES) {
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
      if (!names.includes(z.label)) names.push(z.label);
    }
  }
  return names;
}

/** How long a closure runs, for the list beside the map. */
export function closureWindowLabel(c: SiteClosure, today: string): string {
  if (!c.endDate) {
    return c.startDate > today ? `From ${formatShortDate(c.startDate)} — until reopened` : 'Until reopened';
  }
  if (c.startDate === c.endDate) return formatShortDate(c.startDate);
  return `${formatShortDate(c.startDate)} – ${formatShortDate(c.endDate)}`;
}

/** A closure that has an end date and whose end date has passed. Kept on the
 *  board's Manage list so finished jobs can be tidied away, but never drawn
 *  on the map. */
export function closureIsPast(c: SiteClosure, today: string): boolean {
  return !!c.endDate && c.endDate < today;
}

/** Only commanders and the master admin may close or reopen an area;
 *  everyone in the team can see the board. */
export function canManageClosures(isMaster: boolean, rank: string | undefined): boolean {
  return isMaster || rank === 'commander';
}

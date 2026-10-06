// Areas marked out of use for a day or a stretch of days — the data behind
// the Site Status board (/site-status), which is meant to be thrown up on a
// screen so everyone working on site can see at a glance what's shut.
//
// A closure names a place by its SITE_ZONES label, the same string a task's
// `area` holds. That means it needs no separate list of locations, and it
// also means a label drawn on the map in more than one piece (Scenic
// Railway, Peppermint Bar) lights up in all of them — which is what you
// want: it's one place, however many boxes it takes to draw.

export interface SiteClosure {
  id: string;
  teamId: string;
  /** A SITE_ZONES label. */
  area: string;
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

/** The closures covering a day, soonest-set first. */
export function closuresOn(closures: SiteClosure[], iso: string): SiteClosure[] {
  return closures.filter((c) => closureActiveOn(c, iso)).sort((a, b) => a.area.localeCompare(b.area));
}

/** Just the area labels shut on a day — what the map colours by. */
export function closedAreasOn(closures: SiteClosure[], iso: string): Set<string> {
  return new Set(closuresOn(closures, iso).map((c) => c.area));
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

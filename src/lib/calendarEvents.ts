// The personal Calendar's event shape and recurrence math — shared by the
// Calendar tab (jarvis-tracker) and anything else that puts an entry on
// someone's calendar (currently /assignments, once an assignment is
// accepted). Pure data + math, no React — single source of truth so
// recurrence expansion only ever lives in one place.
//
// A CalendarEvent lives in that user's own jarvisState/{uid}.events array —
// private, per person; see firestore.rules. Recurrence is never re-expanded
// server-side into individual documents: one event with a `recurrence` rule
// is expanded into however many occurrence dates fall in view, entirely
// client-side, whenever the Calendar (or anything reading occurrences) needs
// them — so there's nothing for a cron job to keep re-firing.

export type RecurrenceFreq = 'weekly' | 'fortnightly' | 'monthly';

export interface EventRecurrence {
  freq: RecurrenceFreq;
  until: string; // ISO date, inclusive
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // first occurrence
  time?: string; // optional start time, "HH:MM" 24h
  priority: 'High' | 'Medium' | 'Low';
  notes: string;
  recurrence?: EventRecurrence;
  completedDates?: string[]; // occurrence dates (YYYY-MM-DD) ticked off as done
  // Optional deep link back to whatever raised this entry — e.g. an accepted
  // assignment links back to /inspections so the diary can offer a
  // "Run this inspection" button rather than just sitting there as a reminder.
  link?: { label: string; href: string };
}

// Turn a 24h "HH:MM" string into a friendly "2:30 PM". Returns '' if empty/bad.
export function formatDisplayTime(time: string | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addRecurrenceStep(d: Date, freq: RecurrenceFreq): Date {
  if (freq === 'weekly') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  if (freq === 'fortnightly') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14);
  return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Expands a (possibly recurring) event into every occurrence date that falls within [rangeStart, rangeEnd].
export function getOccurrencesInRange(event: CalendarEvent, rangeStart: string, rangeEnd: string): string[] {
  if (!event.recurrence) {
    return event.date >= rangeStart && event.date <= rangeEnd ? [event.date] : [];
  }
  const occurrences: string[] = [];
  const until = event.recurrence.until && event.recurrence.until < rangeEnd ? event.recurrence.until : rangeEnd;
  const [y, m, d] = event.date.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  while (toDateInputValue(cur) <= until) {
    const curStr = toDateInputValue(cur);
    if (curStr >= rangeStart && curStr >= event.date) occurrences.push(curStr);
    cur = addRecurrenceStep(cur, event.recurrence.freq);
  }
  return occurrences;
}

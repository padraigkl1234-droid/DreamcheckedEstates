// Assigning a piece of work to a specific person — starting with inspections,
// shaped so other item types can join later without a rewrite. A manual,
// explicit counterpart to Task Manager's offer flow: anyone on the team can
// assign an item to anyone else, the assignee accepts or declines, and
// accepting writes a CalendarEvent straight into their own personal Calendar
// (see src/lib/calendarEvents.ts and firestore.rules) — nothing is raised
// automatically or on a cron; a recurring assignment's future occurrences are
// expanded client-side by the Calendar itself from the one accepted event.
//
// Private to the two parties (like a task), not team-wide visible — see the
// assignments block in firestore.rules for the enforced version of this.

import type { EventRecurrence } from '@/lib/calendarEvents';

export type AssignmentItemType = 'inspection';
export type AssignmentStatus = 'pending' | 'accepted' | 'declined';

export interface Assignment {
  id: string;
  teamId: string;
  itemType: AssignmentItemType;
  itemId: string; // e.g. an inspectionTemplates doc id
  itemName: string; // denormalised, so the list renders without a join
  date: string; // YYYY-MM-DD — first/only occurrence
  time?: string;
  recurrence?: EventRecurrence;
  notes?: string;
  assignedByUid: string;
  assignedByName: string;
  assigneeUid: string;
  assigneeName: string;
  status: AssignmentStatus;
  createdAt: number;
  respondedAt?: number | null;
}

export const ASSIGNMENT_STATUS_META: Record<AssignmentStatus, { label: string; accent: string }> = {
  pending: { label: 'Pending', accent: 'text-amber-300 border-amber-400/40 bg-amber-400/10' },
  accepted: { label: 'Accepted', accent: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' },
  declined: { label: 'Declined', accent: 'text-alert border-alert/50 bg-alert/10' },
};

// Where an accepted assignment's Calendar entry should send you to actually
// do the work — only inspections for now, but the switch keeps this honest
// as more item types land.
export function assignmentLink(a: Pick<Assignment, 'itemType'>): { label: string; href: string } {
  switch (a.itemType) {
    case 'inspection':
    default:
      return { label: 'Open Inspections', href: '/inspections' };
  }
}

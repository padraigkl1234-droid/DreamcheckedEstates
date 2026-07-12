// Authored reports: a person writes up a piece of work (optionally backing a
// specific task) and it's logged for the team. Visibility is gated by rank —
// "command" reports are seen only by their author + commanders + master, while
// "team" reports are visible to the whole team.

import { isCommander, type UserProfile } from '@/lib/teams';

export type ReportOutcome = 'pass' | 'fail' | 'followup';
export type ReportVisibility = 'command' | 'team';

export interface ReportAttachment {
  url: string;
  path: string; // storage path, for deletion
  name: string;
  uploadedAt: number;
}

export interface Report {
  id: string;
  title: string; // job title / what the report is about
  date: string; // YYYY-MM-DD — when the work happened
  time?: string; // HH:MM 24h, optional
  description: string;
  category?: string;
  outcome: ReportOutcome;
  area?: string; // site zone / location, optional
  visibility: ReportVisibility;
  taskId?: string | null; // the task this backs up, if any
  taskName?: string | null; // denormalised for display
  teamId: string;
  createdBy: string; // uid
  createdByName: string;
  createdAt: number;
  attachments?: ReportAttachment[];
}

export const REPORT_CATEGORIES = [
  'Maintenance',
  'Inspection',
  'Incident',
  'Compliance',
  'Operations',
  'Health & Safety',
  'Other',
] as const;

export const REPORT_OUTCOMES: { value: ReportOutcome; label: string; accent: string }[] = [
  { value: 'pass', label: 'Pass', accent: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' },
  { value: 'followup', label: 'Needs follow-up', accent: 'text-amber-300 border-amber-400/40 bg-amber-400/10' },
  { value: 'fail', label: 'Fail', accent: 'text-alert border-alert/50 bg-alert/10' },
];

export const REPORT_VISIBILITIES: { value: ReportVisibility; label: string; blurb: string }[] = [
  { value: 'command', label: 'Command only', blurb: 'Author, commanders and master' },
  { value: 'team', label: 'Team-wide', blurb: 'Everyone on the team' },
];

export function outcomeMeta(outcome: ReportOutcome) {
  return REPORT_OUTCOMES.find((o) => o.value === outcome) ?? REPORT_OUTCOMES[0];
}

// Whether `viewer` may see `report`. Rules enforce this server-side too; this
// is the client-side mirror for building queries and defensive filtering.
export function canSeeReport(
  report: Report,
  viewer: Partial<UserProfile> | null | undefined,
  isMaster: boolean
): boolean {
  if (isMaster) return true;
  if (report.teamId !== viewer?.teamId) return false;
  if (report.visibility === 'team') return true;
  if (isCommander(viewer)) return true;
  return report.createdBy === viewer?.uid;
}

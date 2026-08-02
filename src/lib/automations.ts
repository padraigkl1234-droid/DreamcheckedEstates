// Shared types for the automations engine: a small library of jobs
// (Firestore docs under /automations). Two kinds exist:
//   - scheduled (weeklyReport, overdueReport): checked once daily by
//     /api/cron/automations and run when today matches dayOfWeek.
//   - event-triggered (showScheduled): fired immediately by the client action
//     that caused the event (see src/lib/automationHandlers/showScheduled.ts
//     and its caller in jarvis-tracker/page.tsx), never touched by the cron.
// New scheduled types are added by (1) a variant here, (2) a handler under
// src/lib/automationHandlers, and (3) a case in automationHandlers/registry.ts
// — no changes to the cron route or the scheduling UI are needed.

export type AutomationType = 'weeklyReport' | 'overdueReport' | 'inspectionDue' | 'showScheduled';

export type AutomationRecipients = 'perUser' | 'digest' | 'both';

// The automations cron runs once a day (see vercel.json — Vercel's Hobby
// plan only allows daily-or-slower cron schedules), so a fixed time-of-day
// isn't configurable per automation: every scheduled automation is checked
// once daily at whatever time /api/cron/automations fires, and runs when
// today matches its dayOfWeek. Event-triggered types (showScheduled) leave
// dayOfWeek/recipients unset — they always notify every configured email.
export interface Automation {
  id: string;
  name: string;
  type: AutomationType;
  enabled: boolean;
  dayOfWeek?: number | null; // 0 (Sun) – 6 (Sat), evaluated in UTC — weekly types only
  dayOfMonth?: number | null; // 1–28, evaluated in UTC — monthly types only
  recipients?: AutomationRecipients; // weekly types only
  // inspectionDue only: which checklist to raise, and who the task goes to.
  // The first person owns it; the rest are offered it to accept or decline.
  inspectionTemplateId?: string | null;
  inspectionTemplateName?: string | null;
  assigneeUids?: string[];
  assigneeNames?: string[];
  // null/absent = every team (master-wide). Scoping to one team only counts
  // that team's members (or, for showScheduled, only fires for that team's
  // shows). teamName is denormalized purely for display.
  teamId?: string | null;
  teamName?: string | null;
  digestEmails: string[];
  /** @deprecated superseded by digestEmails (single-address docs from before
   * multi-recipient support) — read through automationDigestEmails(), never
   * directly. */
  digestEmail?: string;
  lastRunKey?: string | null;
  lastRunAt?: number | null;
  lastRunDetail?: string | null;
  createdAt?: number;
}

// The one place that knows how to read a digest recipient list off an
// automation doc, including ones created before multi-recipient support.
export function automationDigestEmails(a: Pick<Automation, 'digestEmails' | 'digestEmail'>): string[] {
  if (a.digestEmails?.length) return a.digestEmails;
  return a.digestEmail ? [a.digestEmail] : [];
}

export const AUTOMATION_TYPE_LABELS: Record<AutomationType, string> = {
  weeklyReport: 'Weekly completed-tasks report',
  overdueReport: 'Overdue & remaining tasks report',
  inspectionDue: 'Monthly inspection due',
  showScheduled: 'Show scheduled alert',
};

// Types the master console's "create" form schedules by weekday
// (day/recipients apply). showScheduled is event-triggered instead, and
// inspectionDue is monthly, so neither is here.
export const SCHEDULED_AUTOMATION_TYPES: AutomationType[] = ['weeklyReport', 'overdueReport'];

// Types scheduled by day-of-month rather than weekday. Capped at 28 in the UI
// so a monthly job can't land on a date February hasn't got.
export const MONTHLY_AUTOMATION_TYPES: AutomationType[] = ['inspectionDue'];
export const MAX_DAY_OF_MONTH = 28;

export function isMonthlyAutomation(type: AutomationType): boolean {
  return MONTHLY_AUTOMATION_TYPES.includes(type);
}

/** True when `automation` is due to run on `now` (UTC). */
export function isDueToday(automation: Automation, now: Date): boolean {
  if (automation.type === 'showScheduled') return false; // event-triggered
  if (isMonthlyAutomation(automation.type)) return now.getUTCDate() === (automation.dayOfMonth ?? 1);
  return automation.dayOfWeek === now.getUTCDay();
}

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const RECIPIENT_LABELS: Record<AutomationRecipients, string> = {
  perUser: 'Each person gets their own report',
  digest: 'One digest email only',
  both: 'Both — per-person reports and a digest',
};

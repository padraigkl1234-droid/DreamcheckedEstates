// Shared types for the automations engine: a small library of scheduled
// jobs (Firestore docs under /automations) that a single daily cron
// (/api/cron/automations) checks and runs when due. New automation types are
// added by (1) adding a variant here, (2) a handler under
// src/lib/automationHandlers, and (3) a case in automationHandlers/registry.ts
// — no changes to the cron route or the scheduling UI are needed.

export type AutomationType = 'weeklyReport';

export type AutomationRecipients = 'perUser' | 'digest' | 'both';

// The automations cron runs once a day (see vercel.json — Vercel's Hobby
// plan only allows daily-or-slower cron schedules), so a fixed time-of-day
// isn't configurable per automation: every automation is checked once daily
// at whatever time /api/cron/automations fires, and runs when today matches
// its dayOfWeek.
export interface Automation {
  id: string;
  name: string;
  type: AutomationType;
  enabled: boolean;
  dayOfWeek: number; // 0 (Sun) – 6 (Sat), evaluated in UTC
  recipients: AutomationRecipients;
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
};

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const RECIPIENT_LABELS: Record<AutomationRecipients, string> = {
  perUser: 'Each person gets their own report',
  digest: 'One digest email only',
  both: 'Both — per-person reports and a digest',
};

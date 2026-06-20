// ---------------------------------------------------------------------------
// Shared compliance countdown / RAG (red-amber-green) urgency logic.
// Single source of truth for "how urgent is this compliance item" so the
// dashboard's Compliance Countdown card and the INVICTUS greeting line never
// disagree about which item is most pressing.
// ---------------------------------------------------------------------------

export interface ComplianceItem {
  id: string;
  name: string;
  completed: boolean;
  date: string;
  nextDueDate: string;
  comments: string;
}

export type ComplianceUrgency = 'red' | 'amber' | 'green';

export interface ComplianceCountdown {
  item: ComplianceItem;
  daysUntilDue: number;
  urgency: ComplianceUrgency;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getComplianceCountdown(item: ComplianceItem, now: Date = new Date()): ComplianceCountdown | null {
  if (!item.nextDueDate) return null;
  const due = startOfDay(new Date(item.nextDueDate));
  if (Number.isNaN(due.getTime())) return null;
  const daysUntilDue = Math.round((due.getTime() - startOfDay(now).getTime()) / MS_PER_DAY);
  const urgency: ComplianceUrgency = daysUntilDue <= 7 ? 'red' : daysUntilDue <= 30 ? 'amber' : 'green';
  return { item, daysUntilDue, urgency };
}

// Outstanding (incomplete) items with a valid due date, soonest-due first.
export function getOutstandingCompliances(compliances: ComplianceItem[], now: Date = new Date()): ComplianceCountdown[] {
  return compliances
    .filter((c) => !c.completed)
    .map((c) => getComplianceCountdown(c, now))
    .filter((c): c is ComplianceCountdown => c !== null)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export function getMostUrgentCompliance(compliances: ComplianceItem[], now: Date = new Date()): ComplianceCountdown | null {
  return getOutstandingCompliances(compliances, now)[0] ?? null;
}

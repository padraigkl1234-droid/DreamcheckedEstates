import type { Firestore } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { automationDigestEmails, type Automation } from '@/lib/automations';
import { announcementEmail } from './emailTemplate';

// Event-triggered, not schedule-driven — called directly from the
// show-scheduled API route the instant a show is added, never by the daily
// cron. See src/lib/automations.ts for how these two kinds differ.

export interface ShowScheduledEvent {
  showType: string;
  showDate: string; // YYYY-MM-DD
  showTitle?: string;
  teamId: string;
}

function formatShowDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export async function notifyShowScheduled(db: Firestore, event: ShowScheduledEvent): Promise<{ sent: number }> {
  const snap = await db.collection('automations').where('type', '==', 'showScheduled').where('enabled', '==', true).get();
  const matching = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Automation, 'id'>) }))
    .filter((a) => !a.teamId || a.teamId === event.teamId);

  if (matching.length === 0) return { sent: 0 };

  const heading = event.showTitle ? `${event.showType} — ${event.showTitle}` : event.showType;
  const html = announcementEmail({
    eyebrow: 'Show scheduled',
    heading,
    subheading: formatShowDate(event.showDate),
  });

  let sent = 0;
  for (const automation of matching) {
    const emails = automationDigestEmails(automation).length ? automationDigestEmails(automation) : [MASTER_ADMIN_EMAIL];
    const result = await sendEmail({ to: emails, subject: `Show scheduled: ${heading}`, html });
    const now = Date.now();
    await db
      .collection('automations')
      .doc(automation.id)
      .update({ lastRunAt: now, lastRunDetail: result.ok ? `Notified for "${heading}"` : `Failed: ${result.error}` })
      .catch(() => {});
    if (result.ok) sent++;
  }
  return { sent };
}

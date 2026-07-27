import type { Firestore } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { automationDigestEmails, type Automation } from '@/lib/automations';
import { reportTableEmail, type ReportRow } from './emailTemplate';

const DAY_MS = 24 * 60 * 60 * 1000;

interface TaskDoc {
  name?: string;
  status?: string;
  completedAt?: number;
  category?: string;
  ownerUid?: string;
}

interface UserDoc {
  name?: string;
  displayName?: string;
  email?: string;
  teamId?: string;
}

interface CompletedTask {
  name: string;
  completedAt: number;
  category?: string;
}

export async function runWeeklyReport(db: Firestore, automation: Automation): Promise<{ detail: string }> {
  const since = Date.now() - 7 * DAY_MS;
  const snap = await db.collection('tasks').where('status', '==', 'Completed').get();

  const completedByOwner = new Map<string, CompletedTask[]>();
  snap.forEach((d) => {
    const t = d.data() as TaskDoc;
    if (!t.completedAt || t.completedAt < since || !t.ownerUid || !t.name) return;
    const list = completedByOwner.get(t.ownerUid) ?? [];
    list.push({ name: t.name, completedAt: t.completedAt, category: t.category });
    completedByOwner.set(t.ownerUid, list);
  });

  const usersSnap = await db.collection('users').get();
  const userByUid = new Map(usersSnap.docs.map((d) => [d.id, d.data() as UserDoc]));

  // Scope to one team, if this automation is limited to one — drop any
  // owner who isn't a member of it before anything else runs.
  if (automation.teamId) {
    for (const uid of [...completedByOwner.keys()]) {
      if (userByUid.get(uid)?.teamId !== automation.teamId) completedByOwner.delete(uid);
    }
  }

  if (completedByOwner.size === 0) {
    return {
      detail: automation.teamId
        ? `No tasks completed in the last 7 days for ${automation.teamName || 'this team'} — nothing sent.`
        : 'No tasks completed in the last 7 days — nothing sent.',
    };
  }

  let sentCount = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  if (automation.recipients === 'perUser' || automation.recipients === 'both') {
    for (const [uid, tasks] of completedByOwner) {
      const profile = userByUid.get(uid);
      if (!profile?.email) {
        skipped.push(uid);
        continue;
      }
      const sorted = [...tasks].sort((a, b) => b.completedAt - a.completedAt);
      const rows: ReportRow[] = sorted.map((t) => ({
        name: t.name,
        meta: new Date(t.completedAt).toISOString().slice(0, 10),
        category: t.category || '',
      }));
      const displayName = profile.displayName || profile.name || profile.email;
      const html = reportTableEmail({
        heading: 'Weekly completed tasks',
        subheading: `${displayName} · ${tasks.length} task${tasks.length === 1 ? '' : 's'} completed this week`,
        columnLabel: 'Completed',
        rows,
      });
      const result = await sendEmail({ to: profile.email, subject: 'Your weekly completed tasks', html });
      if (result.ok) sentCount++;
      else errors.push(`${profile.email}: ${result.error}`);
    }
  }

  if (automation.recipients === 'digest' || automation.recipients === 'both') {
    const allRows: ReportRow[] = [];
    for (const [uid, tasks] of completedByOwner) {
      const profile = userByUid.get(uid);
      const ownerName = profile?.displayName || profile?.name || uid;
      for (const t of tasks) {
        allRows.push({
          name: `${t.name} (${ownerName})`,
          meta: new Date(t.completedAt).toISOString().slice(0, 10),
          category: t.category || '',
        });
      }
    }
    allRows.sort((a, b) => (a.meta < b.meta ? 1 : -1));
    const digestEmails = automationDigestEmails(automation).length
      ? automationDigestEmails(automation)
      : [MASTER_ADMIN_EMAIL];
    const html = reportTableEmail({
      heading: automation.teamName ? `Weekly digest — ${automation.teamName}` : 'Weekly team digest',
      subheading: `${allRows.length} task${allRows.length === 1 ? '' : 's'} completed this week across ${completedByOwner.size} people`,
      columnLabel: 'Completed',
      rows: allRows,
    });
    const result = await sendEmail({ to: digestEmails, subject: 'Weekly team digest — completed tasks', html });
    if (result.ok) sentCount++;
    else errors.push(`${digestEmails.join(', ')}: ${result.error}`);
  }

  const parts = [`Sent ${sentCount} email(s)`];
  if (skipped.length) parts.push(`skipped ${skipped.length} (no email on file)`);
  if (errors.length) parts.push(`failed: ${errors.join('; ')}`);
  return { detail: `${parts.join(', ')}.` };
}

import type { Firestore } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { automationDigestEmails, type Automation } from '@/lib/automations';
import { reportTableEmail, type ReportRow } from './emailTemplate';

interface TaskDoc {
  name?: string;
  status?: string;
  dueDate?: string;
  category?: string;
  ownerUid?: string;
}

interface UserDoc {
  name?: string;
  displayName?: string;
  email?: string;
  teamId?: string;
}

interface OpenTask {
  name: string;
  dueDate?: string;
  category?: string;
  overdue: boolean;
}

function toRows(tasks: OpenTask[]): ReportRow[] {
  return [...tasks]
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
    })
    .map((t) => ({
      name: t.name,
      meta: t.dueDate ? (t.overdue ? `Overdue · ${t.dueDate}` : `Due ${t.dueDate}`) : 'No due date',
      category: t.category || '',
      highlight: t.overdue,
    }));
}

export async function runOverdueReport(db: Firestore, automation: Automation): Promise<{ detail: string }> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const snap = await db.collection('tasks').where('status', 'in', ['Not Started', 'In Progress']).get();

  const byOwner = new Map<string, OpenTask[]>();
  snap.forEach((d) => {
    const t = d.data() as TaskDoc;
    if (!t.ownerUid || !t.name) return;
    const overdue = Boolean(t.dueDate) && t.dueDate! < todayStr;
    const list = byOwner.get(t.ownerUid) ?? [];
    list.push({ name: t.name, dueDate: t.dueDate, category: t.category, overdue });
    byOwner.set(t.ownerUid, list);
  });

  const usersSnap = await db.collection('users').get();
  const userByUid = new Map(usersSnap.docs.map((d) => [d.id, d.data() as UserDoc]));

  if (automation.teamId) {
    for (const uid of [...byOwner.keys()]) {
      if (userByUid.get(uid)?.teamId !== automation.teamId) byOwner.delete(uid);
    }
  }

  if (byOwner.size === 0) {
    return {
      detail: automation.teamId
        ? `No open tasks for ${automation.teamName || 'this team'} — nothing sent.`
        : 'No open tasks — nothing sent.',
    };
  }

  let sentCount = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  if (automation.recipients === 'perUser' || automation.recipients === 'both') {
    for (const [uid, tasks] of byOwner) {
      const profile = userByUid.get(uid);
      if (!profile?.email) {
        skipped.push(uid);
        continue;
      }
      const overdueCount = tasks.filter((t) => t.overdue).length;
      const displayName = profile.displayName || profile.name || profile.email;
      const html = reportTableEmail({
        heading: 'Overdue & remaining tasks',
        subheading: `${displayName} · ${tasks.length} open task${tasks.length === 1 ? '' : 's'}${overdueCount ? ` · ${overdueCount} overdue` : ''}`,
        columnLabel: 'Status',
        rows: toRows(tasks),
      });
      const result = await sendEmail({
        to: profile.email,
        subject: overdueCount ? `You have ${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}` : 'Your open tasks',
        html,
      });
      if (result.ok) sentCount++;
      else errors.push(`${profile.email}: ${result.error}`);
    }
  }

  if (automation.recipients === 'digest' || automation.recipients === 'both') {
    const allTasks: OpenTask[] = [];
    let totalOverdue = 0;
    for (const [uid, tasks] of byOwner) {
      const profile = userByUid.get(uid);
      const ownerName = profile?.displayName || profile?.name || uid;
      totalOverdue += tasks.filter((t) => t.overdue).length;
      for (const t of tasks) allTasks.push({ ...t, name: `${t.name} (${ownerName})` });
    }
    const digestEmails = automationDigestEmails(automation).length
      ? automationDigestEmails(automation)
      : [MASTER_ADMIN_EMAIL];
    const html = reportTableEmail({
      heading: automation.teamName ? `Overdue & remaining — ${automation.teamName}` : 'Overdue & remaining tasks',
      subheading: `${allTasks.length} open task${allTasks.length === 1 ? '' : 's'} across ${byOwner.size} people${totalOverdue ? ` · ${totalOverdue} overdue` : ''}`,
      columnLabel: 'Status',
      rows: toRows(allTasks),
    });
    const result = await sendEmail({ to: digestEmails, subject: 'Overdue & remaining tasks digest', html });
    if (result.ok) sentCount++;
    else errors.push(`${digestEmails.join(', ')}: ${result.error}`);
  }

  const parts = [`Sent ${sentCount} email(s)`];
  if (skipped.length) parts.push(`skipped ${skipped.length} (no email on file)`);
  if (errors.length) parts.push(`failed: ${errors.join('; ')}`);
  return { detail: `${parts.join(', ')}.` };
}

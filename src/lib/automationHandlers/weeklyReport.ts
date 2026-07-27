import type { Firestore } from 'firebase-admin/firestore';
import { sendEmail } from '@/lib/email';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { automationDigestEmails, type Automation } from '@/lib/automations';

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

interface ReportRow {
  name: string;
  date: string;
  category: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Invictus-branded HTML email body (a dark header banner + a light table
// card) — table-based layout throughout since that's what renders reliably
// across Gmail/Outlook/etc., unlike flexbox/grid.
function reportHtml({ heading, subheading, rows }: { heading: string; subheading: string; rows: ReportRow[] }): string {
  const rowsHtml = rows
    .map(
      (r, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f7f7f8'};">
        <td style="padding:10px 16px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #ececec;">${escapeHtml(r.name)}</td>
        <td style="padding:10px 16px;font-size:12px;color:#6b6b6b;border-bottom:1px solid #ececec;white-space:nowrap;">${r.date}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #ececec;">
          ${
            r.category
              ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#fdeceb;color:#c0272d;font-weight:600;font-size:10px;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(r.category)}</span>`
              : '<span style="color:#c7c7c7;font-size:12px;">—</span>'
          }
        </td>
      </tr>`
    )
    .join('');

  return `
<div style="background:#eeeeee;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e2e2;">
    <tr>
      <td style="background:#111114;padding:20px 28px;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#dc2626;margin-right:8px;vertical-align:middle;"></span>
        <span style="font-size:13px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#ffffff;vertical-align:middle;">Invictus</span>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px 4px;">
        <h1 style="margin:0;font-size:18px;color:#111114;">${escapeHtml(heading)}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#6b6b6b;">${escapeHtml(subheading)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 0 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th align="left" style="padding:8px 16px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9a;border-bottom:2px solid #ececec;">Task</th>
            <th align="left" style="padding:8px 16px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9a;border-bottom:2px solid #ececec;">Completed</th>
            <th align="left" style="padding:8px 16px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9a;border-bottom:2px solid #ececec;">Group</th>
          </tr>
          ${rowsHtml}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 24px;">
        <p style="margin:0;font-size:11px;color:#a0a0a0;">Sent automatically by Invictus automations.</p>
      </td>
    </tr>
  </table>
</div>`;
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
        date: new Date(t.completedAt).toISOString().slice(0, 10),
        category: t.category || '',
      }));
      const displayName = profile.displayName || profile.name || profile.email;
      const html = reportHtml({
        heading: 'Weekly completed tasks',
        subheading: `${displayName} · ${tasks.length} task${tasks.length === 1 ? '' : 's'} completed this week`,
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
          date: new Date(t.completedAt).toISOString().slice(0, 10),
          category: t.category || '',
        });
      }
    }
    allRows.sort((a, b) => (a.date < b.date ? 1 : -1));
    const digestEmails = automationDigestEmails(automation).length
      ? automationDigestEmails(automation)
      : [MASTER_ADMIN_EMAIL];
    const html = reportHtml({
      heading: automation.teamName ? `Weekly digest — ${automation.teamName}` : 'Weekly team digest',
      subheading: `${allRows.length} task${allRows.length === 1 ? '' : 's'} completed this week across ${completedByOwner.size} people`,
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

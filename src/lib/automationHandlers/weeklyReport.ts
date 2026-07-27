import type { Firestore } from 'firebase-admin/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAdminBucket } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import type { Automation } from '@/lib/automations';

const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_TTL_MS = 30 * DAY_MS;

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
}

interface CompletedTask {
  name: string;
  completedAt: number;
  category?: string;
}

function buildPdf(title: string, rows: { name: string; date: string; category: string }[]): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toISOString().slice(0, 10)}`, 40, 56);
  autoTable(doc, {
    startY: 72,
    head: [['Task', 'Completed', 'Group']],
    body: rows.map((r) => [r.name, r.date, r.category || '—']),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
  });
  return Buffer.from(doc.output('arraybuffer'));
}

async function uploadPdf(path: string, buffer: Buffer): Promise<string> {
  const bucket = getAdminBucket();
  const file = bucket.file(path);
  await file.save(buffer, { contentType: 'application/pdf' });
  const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + LINK_TTL_MS });
  return url;
}

function emailBody(intro: string, url: string): string {
  return `<p>${intro}</p><p><a href="${url}">Download the PDF</a></p><p style="color:#888;font-size:12px">Link valid for 30 days.</p>`;
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

  if (completedByOwner.size === 0) {
    return { detail: 'No tasks completed in the last 7 days — nothing sent.' };
  }

  const usersSnap = await db.collection('users').get();
  const userByUid = new Map(usersSnap.docs.map((d) => [d.id, d.data() as UserDoc]));

  let sentCount = 0;
  const skipped: string[] = [];

  if (automation.recipients === 'perUser' || automation.recipients === 'both') {
    for (const [uid, tasks] of completedByOwner) {
      const profile = userByUid.get(uid);
      if (!profile?.email) {
        skipped.push(uid);
        continue;
      }
      const sorted = [...tasks].sort((a, b) => b.completedAt - a.completedAt);
      const rows = sorted.map((t) => ({
        name: t.name,
        date: new Date(t.completedAt).toISOString().slice(0, 10),
        category: t.category || '',
      }));
      const displayName = profile.displayName || profile.name || profile.email;
      const pdf = buildPdf(`Weekly completed tasks — ${displayName}`, rows);
      const url = await uploadPdf(`automation-reports/${uid}-${Date.now()}.pdf`, pdf);
      const result = await sendEmail({
        to: profile.email,
        subject: 'Your weekly completed tasks',
        html: emailBody(
          `Here's your weekly completed-tasks report — ${tasks.length} task${tasks.length === 1 ? '' : 's'} completed this week.`,
          url
        ),
      });
      if (result.ok) sentCount++;
    }
  }

  if (automation.recipients === 'digest' || automation.recipients === 'both') {
    const allRows: { name: string; date: string; category: string }[] = [];
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
    const pdf = buildPdf('Weekly completed tasks — team digest', allRows);
    const url = await uploadPdf(`automation-reports/digest-${Date.now()}.pdf`, pdf);
    const digestEmail = automation.digestEmail || MASTER_ADMIN_EMAIL;
    const result = await sendEmail({
      to: digestEmail,
      subject: 'Weekly team digest — completed tasks',
      html: emailBody(
        `Team-wide weekly digest — ${allRows.length} task${allRows.length === 1 ? '' : 's'} completed this week across ${completedByOwner.size} people.`,
        url
      ),
    });
    if (result.ok) sentCount++;
  }

  return {
    detail: `Sent ${sentCount} email(s)${skipped.length ? `, skipped ${skipped.length} (no email on file)` : ''}.`,
  };
}

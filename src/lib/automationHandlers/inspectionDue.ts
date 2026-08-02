import type { Firestore } from 'firebase-admin/firestore';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import { pushToTokens } from '@/lib/serverNotify';
import { notifEnabled, type NotifPrefs } from '@/lib/teams';
import type { Automation } from '@/lib/automations';

// Raises the month's inspection as a task. The people picked on the automation
// get it in their list — the first owns it, the rest are offered it to accept
// or decline — and running the checklist in /inspections files the report.
//
// Unlike the report automations this sends no email: the point is a job on
// someone's board, and the app already pushes a notification for that.

interface UserDoc {
  name?: string;
  displayName?: string;
  email?: string;
  teamId?: string;
  fcmTokens?: string[];
  notifPrefs?: NotifPrefs;
}

const nameOf = (u: UserDoc | undefined, fallback: string) => u?.displayName || u?.name || u?.email || fallback;

/** Last day of the month `now` falls in, as YYYY-MM-DD — the inspection's due date. */
function endOfMonth(now: Date): string {
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

export async function runInspectionDue(db: Firestore, automation: Automation): Promise<{ detail: string }> {
  if (!automation.inspectionTemplateId) {
    return { detail: 'No inspection chosen for this automation — nothing raised.' };
  }
  const assigneeUids = automation.assigneeUids ?? [];
  if (!assigneeUids.length) {
    return { detail: 'Nobody assigned to this inspection — nothing raised.' };
  }

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7); // e.g. "2026-08"
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const templateName = automation.inspectionTemplateName || 'Inspection';

  // "Run now" and a retried cron both land here, so refuse to raise the same
  // month's inspection twice.
  const existing = await db
    .collection('tasks')
    .where('inspectionKey', '==', `${automation.inspectionTemplateId}:${monthKey}`)
    .limit(1)
    .get();
  if (!existing.empty) {
    return { detail: `${templateName} for ${monthLabel} was already raised — nothing to do.` };
  }

  const docs = await Promise.all(assigneeUids.map((uid) => db.collection('users').doc(uid).get()));
  const people = docs.map((d) => ({ uid: d.id, data: d.data() as UserDoc | undefined }));
  const [owner, ...offered] = people;

  const ref = db.collection('tasks').doc();
  await ref.set({
    name: `${templateName} — ${monthLabel}`,
    priority: 'Medium',
    dueDate: endOfMonth(now),
    status: 'Not Started',
    notes: [
      `This month's ${templateName} is due.`,
      'Open Inspections, run the checklist and it files itself as a report.',
    ].join('\n\n'),
    category: 'Inspection',
    // Marks the task as automation-raised, and pins it to one month so the
    // same inspection can't be raised twice (see the guard above).
    source: 'inspectionDue',
    inspectionTemplateId: automation.inspectionTemplateId,
    inspectionKey: `${automation.inspectionTemplateId}:${monthKey}`,
    createdAt: Date.now(),
    ownerUid: owner.uid,
    ownerName: nameOf(owner.data, 'Inspections'),
    teamId: automation.teamId ?? owner.data?.teamId ?? null,
    participants: [owner.uid],
    participantNames: { [owner.uid]: nameOf(owner.data, 'Inspections') },
    pendingUids: offered.map((p) => p.uid),
    pendingNames: Object.fromEntries(offered.map((p) => [p.uid, nameOf(p.data, 'Teammate')])),
    archived: false,
  });

  // Best-effort push — the task exists either way.
  let sent = 0;
  for (const p of people) {
    const tokens = p.data?.fcmTokens ?? [];
    if (!tokens.length || !notifEnabled(p.data?.notifPrefs, 'taskAssignments')) continue;
    const result = await pushToTokens(db, getAdminMessaging(), p.uid, tokens, {
      title: 'Inspection due',
      body: `${templateName} — ${monthLabel}`,
      url: '/inspections',
      tag: `task-${ref.id}`,
    });
    sent += result.sent;
  }

  return {
    detail: `Raised "${templateName} — ${monthLabel}" for ${nameOf(owner.data, 'someone')}${
      offered.length ? ` (offered to ${offered.length} other${offered.length === 1 ? '' : 's'})` : ''
    }, ${sent} notification(s) sent.`,
  };
}

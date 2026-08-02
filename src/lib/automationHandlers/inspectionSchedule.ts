import type { Firestore } from 'firebase-admin/firestore';
import { getAdminMessaging } from '@/lib/firebaseAdmin';
import { pushToTokens } from '@/lib/serverNotify';
import { notifEnabled, type NotifPrefs } from '@/lib/teams';
import type { InspectionTemplate } from '@/lib/inspections';

// Raises a recurring inspection as a task when its own schedule (set on the
// template in /inspections, not a separate automation doc) comes due. The
// first person assigned owns the task; the rest are offered it to accept or
// decline. Running the checklist in /inspections files the report — this
// handler only ever puts the job on someone's board.

interface UserDoc {
  name?: string;
  displayName?: string;
  email?: string;
  teamId?: string;
  fcmTokens?: string[];
  notifPrefs?: NotifPrefs;
}

const nameOf = (u: UserDoc | undefined, fallback: string) => u?.displayName || u?.name || u?.email || fallback;

function dueDateFor(template: InspectionTemplate, now: Date): string {
  if (template.schedule?.frequency === 'weekly') {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  // Monthly — due at the end of this month.
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

function periodLabel(template: InspectionTemplate, now: Date): string {
  return template.schedule?.frequency === 'weekly'
    ? `w/c ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    : now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export async function runScheduledInspection(
  db: Firestore,
  template: InspectionTemplate,
  now: Date
): Promise<{ detail: string }> {
  const assigneeUids = template.assigneeUids ?? [];
  if (!assigneeUids.length) {
    return { detail: 'Nobody assigned to this inspection — nothing raised.' };
  }

  const runKey = now.toISOString().slice(0, 10);
  const dueKey = `${template.id}:${runKey}`;

  // "Run now" and a retried cron both land here, so refuse to raise the
  // same day's inspection twice.
  const existing = await db.collection('tasks').where('inspectionDueKey', '==', dueKey).limit(1).get();
  if (!existing.empty) {
    return { detail: 'Already raised today — nothing to do.' };
  }

  const label = periodLabel(template, now);
  const docs = await Promise.all(assigneeUids.map((uid) => db.collection('users').doc(uid).get()));
  const people = docs.map((d) => ({ uid: d.id, data: d.data() as UserDoc | undefined })).filter((p) => p.data);
  if (!people.length) {
    return { detail: 'Assigned people no longer exist — nothing raised.' };
  }
  const [owner, ...offered] = people;

  const ref = db.collection('tasks').doc();
  await ref.set({
    name: `${template.name} — ${label}`,
    priority: 'Medium',
    dueDate: dueDateFor(template, now),
    status: 'Not Started',
    notes: `This inspection is due. Open Inspections, run "${template.name}" and it files itself as a report.`,
    category: 'Inspection',
    // Marks the task as schedule-raised, and pins it to today so the same
    // inspection can't be raised twice (see the guard above).
    source: 'inspectionSchedule',
    inspectionTemplateId: template.id,
    inspectionDueKey: dueKey,
    createdAt: Date.now(),
    ownerUid: owner.uid,
    ownerName: nameOf(owner.data, 'Inspections'),
    teamId: template.teamId,
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
      body: `${template.name} — ${label}`,
      url: '/inspections',
      tag: `task-${ref.id}`,
    });
    sent += result.sent;
  }

  return {
    detail: `Raised "${template.name} — ${label}" for ${nameOf(owner.data, 'someone')}${
      offered.length ? ` (offered to ${offered.length} other${offered.length === 1 ? '' : 's'})` : ''
    }, ${sent} notification(s) sent.`,
  };
}

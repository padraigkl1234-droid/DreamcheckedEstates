import { NextResponse } from 'next/server';
import { getAdminDb, getAdminMessaging } from '@/lib/firebaseAdmin';
import { pushToTokens } from '@/lib/serverNotify';
import { notifEnabled, type NotifPrefs } from '@/lib/teams';
import { getOutstandingCompliances, type ComplianceItem } from '@/lib/complianceCountdown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daily digest cron. Vercel Cron hits this once a day (see vercel.json) with the
// header `Authorization: Bearer ${CRON_SECRET}`. For every user who has a
// registered device we send, respecting their prefs:
//   • an "urgent compliance" push if any of their compliance items are due
//     within 7 days (red), and they've opted into that category; and
//   • a "daily summary" push counting today's/overdue tasks + urgent items,
//     if they've opted into the daily summary.

interface TaskDoc {
  status?: string;
  dueDate?: string;
  participants?: string[];
}

function todayStr(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  // Also accept ?secret= for manual triggering / non-Vercel schedulers.
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') || '';
  if (provided !== secret && querySecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const messaging = getAdminMessaging();
    const now = new Date();
    const today = todayStr(now);

    // Load every user that has at least one device token.
    const usersSnap = await db.collection('users').get();
    const recipients = usersSnap.docs
      .map((d) => ({ uid: d.id, ...(d.data() as { fcmTokens?: string[]; notifPrefs?: NotifPrefs }) }))
      .filter((u) => Array.isArray(u.fcmTokens) && u.fcmTokens.length > 0);

    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, users: 0, sent: 0 });
    }

    // Load all outstanding tasks once, then group due/overdue ones by participant.
    const tasksSnap = await db.collection('tasks').get();
    const dueByUid = new Map<string, number>();
    tasksSnap.forEach((t) => {
      const data = t.data() as TaskDoc;
      if (data.status === 'Completed') return;
      if (!data.dueDate || data.dueDate > today) return; // only due today or overdue
      for (const uid of data.participants ?? []) {
        dueByUid.set(uid, (dueByUid.get(uid) ?? 0) + 1);
      }
    });

    let totalSent = 0;
    let notified = 0;

    for (const user of recipients) {
      const tokens = user.fcmTokens as string[];

      // Urgent compliance: their own compliance items due within 7 days.
      let urgentCount = 0;
      if (notifEnabled(user.notifPrefs, 'urgentCompliance') || notifEnabled(user.notifPrefs, 'dailySummary')) {
        const stateSnap = await db.collection('jarvisState').doc(user.uid).get();
        const compliances = (stateSnap.data()?.compliances as ComplianceItem[] | undefined) ?? [];
        urgentCount = getOutstandingCompliances(compliances, now).filter((c) => c.urgency === 'red').length;
      }
      const dueTasks = dueByUid.get(user.uid) ?? 0;

      // Send a dedicated urgent-compliance alert when opted in and something's red.
      if (urgentCount > 0 && notifEnabled(user.notifPrefs, 'urgentCompliance')) {
        const r = await pushToTokens(db, messaging, user.uid, tokens, {
          title: 'Urgent compliance due',
          body:
            urgentCount === 1
              ? '1 compliance item is due within 7 days.'
              : `${urgentCount} compliance items are due within 7 days.`,
          url: '/jarvis-tracker?page=compliance',
          tag: 'urgent-compliance',
        });
        totalSent += r.sent;
        if (r.sent) notified++;
      }

      // Daily summary: a single roll-up of the day's workload.
      if (notifEnabled(user.notifPrefs, 'dailySummary') && (dueTasks > 0 || urgentCount > 0)) {
        const parts: string[] = [];
        if (dueTasks > 0) parts.push(`${dueTasks} task${dueTasks === 1 ? '' : 's'} due`);
        if (urgentCount > 0) parts.push(`${urgentCount} urgent compliance`);
        const r = await pushToTokens(db, messaging, user.uid, tokens, {
          title: 'Your day at a glance',
          body: parts.join(' · '),
          url: '/jarvis-tracker',
          tag: 'daily-summary',
        });
        totalSent += r.sent;
        if (r.sent) notified++;
      }
    }

    return NextResponse.json({ ok: true, users: recipients.length, notified, sent: totalSent });
  } catch (error) {
    console.error('daily cron error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error)?.message || 'unknown'}` },
      { status: 500 }
    );
  }
}

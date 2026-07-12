import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, getAdminMessaging } from '@/lib/firebaseAdmin';
import { pushToTokens } from '@/lib/serverNotify';
import { notifEnabled, type NotifPrefs } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called when a report is filed against a task, to notify whoever owns that
// task (usually the person who assigned it) that backup has been submitted.
//
// Body: { taskId: string, reportTitle: string }
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let caller;
  try {
    caller = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';
  const reportTitle = typeof body.reportTitle === 'string' ? body.reportTitle.trim() : '';
  if (!taskId) return NextResponse.json({ ok: true, sent: 0, note: 'no task' });

  try {
    const db = getAdminDb();
    const taskSnap = await db.collection('tasks').doc(taskId).get();
    const ownerUid = taskSnap.data()?.ownerUid as string | undefined;
    // Only notify the owner, and never notify the filer about their own task.
    if (!ownerUid || ownerUid === caller.uid) {
      return NextResponse.json({ ok: true, sent: 0, note: 'owner is filer or missing' });
    }
    const ownerSnap = await db.collection('users').doc(ownerUid).get();
    const data = ownerSnap.data() as { fcmTokens?: string[]; notifPrefs?: NotifPrefs } | undefined;
    const tokens = data?.fcmTokens ?? [];
    if (!tokens.length || !notifEnabled(data?.notifPrefs, 'taskAssignments')) {
      return NextResponse.json({ ok: true, sent: 0, note: 'no devices or opted out' });
    }
    const callerName = caller.name || caller.email || 'A teammate';
    const result = await pushToTokens(db, getAdminMessaging(), ownerUid, tokens, {
      title: 'Report filed',
      body: `${callerName} filed a report${reportTitle ? `: "${reportTitle}"` : ''}`,
      url: '/jarvis-tracker?page=reports',
      tag: `report-${taskId}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('notify/report error:', error);
    return NextResponse.json({ error: `Server error: ${(error as Error)?.message || 'unknown'}` }, { status: 500 });
  }
}

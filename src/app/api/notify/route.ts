import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, getAdminMessaging } from '@/lib/firebaseAdmin';
import { pushToTokens } from '@/lib/serverNotify';
import { notifEnabled, type NotifPrefs } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called by the app when a task is assigned/offered to someone, to push them a
// "New task" notification. The caller must be signed in (we verify their ID
// token). We only notify the target if they've opted into task-assignment
// pushes and have at least one registered device.
//
// Body: { targetUid: string, taskName: string, taskId?: string }
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const targetUid = typeof body.targetUid === 'string' ? body.targetUid : '';
  const taskName = typeof body.taskName === 'string' ? body.taskName.trim() : '';
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';
  if (!targetUid || !taskName) {
    return NextResponse.json({ error: 'Missing targetUid or taskName' }, { status: 400 });
  }

  // Don't notify someone for assigning a task to themselves.
  if (targetUid === caller.uid) {
    return NextResponse.json({ ok: true, sent: 0, note: 'self-assignment' });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection('users').doc(targetUid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, sent: 0, note: 'no such user' });
    }
    const data = snap.data() as { fcmTokens?: string[]; notifPrefs?: NotifPrefs } | undefined;
    const tokens = data?.fcmTokens ?? [];
    if (!tokens.length) {
      return NextResponse.json({ ok: true, sent: 0, note: 'no devices' });
    }
    if (!notifEnabled(data?.notifPrefs, 'taskAssignments')) {
      return NextResponse.json({ ok: true, sent: 0, note: 'opted out' });
    }

    const callerName = caller.name || caller.email || 'A teammate';
    const result = await pushToTokens(db, getAdminMessaging(), targetUid, tokens, {
      title: 'New task assigned',
      body: `${callerName} assigned you "${taskName}"`,
      url: '/jarvis-tracker?page=tasks',
      tag: taskId ? `task-${taskId}` : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('notify error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error)?.message || 'unknown'}` },
      { status: 500 }
    );
  }
}

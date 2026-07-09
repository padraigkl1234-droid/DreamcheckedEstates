import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, getAdminMessaging } from '@/lib/firebaseAdmin';
import { pushToTokens } from '@/lib/serverNotify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sends a test push to the *caller's own* devices, so a user can verify the
// whole pipeline (VAPID key, token, service worker, delivery) from Settings
// without needing a second account. Bypasses category prefs on purpose — it's
// an explicit, user-initiated test.
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

  try {
    const db = getAdminDb();
    const snap = await db.collection('users').doc(caller.uid).get();
    const tokens = (snap.data()?.fcmTokens as string[] | undefined) ?? [];
    if (!tokens.length) {
      return NextResponse.json({ ok: false, sent: 0, reason: 'no-devices' });
    }

    const result = await pushToTokens(db, getAdminMessaging(), caller.uid, tokens, {
      title: 'INVICTUS test notification',
      body: "If you can see this, push notifications are working. 🎉",
      url: '/settings',
      tag: 'test-notification',
    });

    return NextResponse.json({ ok: result.sent > 0, ...result });
  } catch (error) {
    console.error('test notify error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error)?.message || 'unknown'}` },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { notifyShowScheduled } from '@/lib/automationHandlers/showScheduled';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called right after a show is added to the Show Board, to fire any
// "showScheduled" automations configured for that show's team (or for every
// team). Best-effort from the caller's side — the show itself is already
// saved regardless of whether this succeeds.
//
// Body: { showType: string, showDate: string, showTitle?: string, teamId: string }
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const showType = typeof body.showType === 'string' ? body.showType : '';
  const showDate = typeof body.showDate === 'string' ? body.showDate : '';
  const showTitle = typeof body.showTitle === 'string' ? body.showTitle : undefined;
  const teamId = typeof body.teamId === 'string' ? body.teamId : '';
  if (!showType || !showDate || !teamId) {
    return NextResponse.json({ ok: true, sent: 0, note: 'missing fields' });
  }

  try {
    const result = await notifyShowScheduled(getAdminDb(), { showType, showDate, showTitle, teamId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('show-scheduled notify error:', error);
    return NextResponse.json({ error: `Server error: ${(error as Error)?.message || 'unknown'}` }, { status: 500 });
  }
}

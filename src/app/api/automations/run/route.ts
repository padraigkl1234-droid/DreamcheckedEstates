import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { MASTER_ADMIN_EMAIL } from '@/lib/admin';
import { runAutomation } from '@/lib/automationHandlers/registry';
import type { Automation } from '@/lib/automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lets the master console trigger an automation immediately (for testing),
// independent of its schedule. Master-only, verified server-side.
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
  if ((caller.email ?? '').toLowerCase() !== MASTER_ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection('automations').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const automation = { id: snap.id, ...snap.data() } as Automation;

  try {
    const result = await runAutomation(db, automation);
    await ref.update({ lastRunKey: `manual-${Date.now()}`, lastRunAt: Date.now(), lastRunDetail: result.detail });
    return NextResponse.json({ ok: true, detail: result.detail });
  } catch (error) {
    console.error(`manual run of automation ${id} failed:`, error);
    return NextResponse.json({ error: `Server error: ${(error as Error)?.message || 'unknown'}` }, { status: 500 });
  }
}

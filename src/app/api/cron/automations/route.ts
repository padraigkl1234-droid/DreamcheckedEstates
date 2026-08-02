import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { runAutomation } from '@/lib/automationHandlers/registry';
import { isDueToday, type Automation } from '@/lib/automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daily cron (see vercel.json — Vercel's Hobby plan only allows daily-or-
// slower schedules, so this can't run more often) that checks every enabled
// automation and runs whichever ones are due today. `lastRunKey` (today's
// date) guards against double-sending if the cron is retried the same day.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') || '';
  if (provided !== secret && querySecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  const now = new Date();
  const runKey = now.toISOString().slice(0, 10); // e.g. "2026-07-27"

  const snap = await db.collection('automations').where('enabled', '==', true).get();
  const results: Record<string, string> = {};

  for (const doc of snap.docs) {
    const automation = { id: doc.id, ...doc.data() } as Automation;
    // isDueToday knows each type's schedule — weekday, day-of-month, or
    // event-triggered (never due here).
    if (!isDueToday(automation, now)) continue;
    if (automation.lastRunKey === runKey) continue;
    try {
      const result = await runAutomation(db, automation);
      await doc.ref.update({ lastRunKey: runKey, lastRunAt: Date.now(), lastRunDetail: result.detail });
      results[doc.id] = result.detail;
    } catch (error) {
      const detail = `error: ${(error as Error).message}`;
      results[doc.id] = detail;
      await doc.ref.update({ lastRunKey: runKey, lastRunAt: Date.now(), lastRunDetail: detail }).catch(() => {});
      console.error(`automation ${doc.id} failed:`, error);
    }
  }

  return NextResponse.json({ ok: true, checked: snap.size, results });
}

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { runAutomation } from '@/lib/automationHandlers/registry';
import { runScheduledInspection } from '@/lib/automationHandlers/inspectionSchedule';
import type { Automation } from '@/lib/automations';
import { isTemplateDueToday, type InspectionTemplate } from '@/lib/inspections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daily cron (see vercel.json — Vercel's Hobby plan only allows daily-or-
// slower schedules, so this can't run more often). Two independent jobs share
// this one trigger:
//   - automations: checks every enabled automation doc and runs whichever are
//     due today (weekday match).
//   - inspection schedules: checks every inspection template's own recurring
//     schedule (see /inspections) and raises a task when one's due.
// Both guard against a retried cron the same day via `lastRunKey`.
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
  const dayOfWeek = now.getUTCDay();
  const runKey = now.toISOString().slice(0, 10); // e.g. "2026-07-27"

  const snap = await db.collection('automations').where('enabled', '==', true).get();
  const results: Record<string, string> = {};

  for (const doc of snap.docs) {
    const automation = { id: doc.id, ...doc.data() } as Automation;
    if (automation.type === 'showScheduled') continue; // event-triggered, not schedule-driven
    if (automation.dayOfWeek !== dayOfWeek) continue;
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

  const templatesSnap = await db.collection('inspectionTemplates').get();
  const inspectionResults: Record<string, string> = {};

  for (const doc of templatesSnap.docs) {
    const template = { id: doc.id, ...doc.data() } as InspectionTemplate;
    if (!isTemplateDueToday(template.schedule, now)) continue;
    if (template.lastRunKey === runKey) continue;
    try {
      const result = await runScheduledInspection(db, template, now);
      await doc.ref.update({ lastRunKey: runKey, lastRunAt: Date.now(), lastRunDetail: result.detail });
      inspectionResults[doc.id] = result.detail;
    } catch (error) {
      const detail = `error: ${(error as Error).message}`;
      inspectionResults[doc.id] = detail;
      await doc.ref.update({ lastRunKey: runKey, lastRunAt: Date.now(), lastRunDetail: detail }).catch(() => {});
      console.error(`inspection schedule ${doc.id} failed:`, error);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: snap.size,
    results,
    inspectionsChecked: templatesSnap.size,
    inspectionResults,
  });
}

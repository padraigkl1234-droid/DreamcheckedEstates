import type { Firestore } from 'firebase-admin/firestore';
import type { Automation } from '@/lib/automations';
import { runWeeklyReport } from './weeklyReport';
import { runOverdueReport } from './overdueReport';
import { runInspectionDue } from './inspectionDue';

// Dispatches a due/manually-triggered SCHEDULED automation to its handler.
// Both the daily cron and the master's "Run now" button call this one
// function so there's a single place that knows how to execute each type.
// showScheduled isn't here — it's event-triggered, see showScheduled.ts.
export async function runAutomation(db: Firestore, automation: Automation): Promise<{ detail: string }> {
  switch (automation.type) {
    case 'weeklyReport':
      return runWeeklyReport(db, automation);
    case 'overdueReport':
      return runOverdueReport(db, automation);
    case 'inspectionDue':
      return runInspectionDue(db, automation);
    default:
      throw new Error(`Unknown scheduled automation type: ${automation.type}`);
  }
}

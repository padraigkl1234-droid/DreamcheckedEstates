import type { Firestore } from 'firebase-admin/firestore';
import type { Automation } from '@/lib/automations';
import { runWeeklyReport } from './weeklyReport';

// Dispatches a due/manually-triggered automation to its handler. Both the
// hourly cron and the master's "Run now" button call this one function so
// there's a single place that knows how to execute each automation type.
export async function runAutomation(db: Firestore, automation: Automation): Promise<{ detail: string }> {
  switch (automation.type) {
    case 'weeklyReport':
      return runWeeklyReport(db, automation);
    default:
      throw new Error(`Unknown automation type: ${automation.type}`);
  }
}

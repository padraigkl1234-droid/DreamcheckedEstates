import { logger } from "../lib/logger.js";

/**
 * Delivery channel abstraction. v1 just logs to console. Swap in a
 * Teams/Slack webhook or transactional email provider later by implementing
 * this interface and changing the export below — nothing upstream changes.
 * Never wired to the monitored mailbox itself (read-only mail, separate
 * outbound channel).
 */
export interface Notifier {
  send(title: string, body: string): Promise<void>;
}

const consoleNotifier: Notifier = {
  async send(title, body) {
    console.log(`\n=== ${title} ===\n${body}\n`);
  },
};

export const notifier: Notifier = consoleNotifier;

export async function notifyNewItem(agentName: string, message: string): Promise<void> {
  try {
    await notifier.send(`New item — ${agentName}`, message);
  } catch (err) {
    logger.error("Failed to deliver on-arrival notification", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

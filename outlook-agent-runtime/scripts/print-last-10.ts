import { listRecentMessages } from "../src/graph/client.js";
import { logger } from "../src/lib/logger.js";

/**
 * Read-only proof for step 2a: authenticate against Graph and print the
 * last 10 inbox messages. Makes no write calls of any kind.
 */
async function main() {
  const messages = await listRecentMessages(10);

  logger.info(`Fetched ${messages.length} message(s) from inbox`);

  messages.forEach((msg, i) => {
    const from = msg.from?.emailAddress?.address ?? msg.sender?.emailAddress?.address ?? "unknown";
    console.log(
      `${i + 1}. [${msg.receivedDateTime}] from=${from} attachments=${msg.hasAttachments ?? false}\n   subject: ${msg.subject}\n   preview: ${msg.bodyPreview}`
    );
  });
}

main().catch((err) => {
  logger.error("print-last-10 failed", { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});

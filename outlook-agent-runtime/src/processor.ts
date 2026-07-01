import { fetchInboxDelta, getMessageBody } from "./graph/client.js";
import { extractReadableAttachments } from "./attachments/extract.js";
import { classifyEmail } from "./router/classify.js";
import { agentRegistry } from "./agents/registry.js";
import { insertProcessedEmail, isMessageProcessed, markProcessedStatus } from "./store/processedEmails.js";
import { getDeltaLink, saveDeltaLink } from "./store/syncState.js";
import { notifyNewItem } from "./reporter/notifier.js";
import { getSenderAddress } from "./lib/emailText.js";
import { logger } from "./lib/logger.js";
import type { GraphMessage } from "./graph/types.js";

/**
 * One inbox message end to end: classify, run the matching agent, store,
 * notify. Any failure here is caught and logged against this message only —
 * it must never stop the batch.
 */
async function processMessage(message: GraphMessage): Promise<void> {
  if (!message.id) {
    logger.warn("Skipping message with no id");
    return;
  }

  if (await isMessageProcessed(message.id)) {
    logger.info("Skipping already-processed message", { messageId: message.id });
    return;
  }

  let processedEmailId: string | undefined;
  try {
    const full = await getMessageBody(message.id);
    const merged: GraphMessage = { ...message, body: full.body };

    const routerResult = await classifyEmail(merged);

    processedEmailId = await insertProcessedEmail({
      messageId: message.id,
      internetMessageId: message.internetMessageId,
      receivedAt: message.receivedDateTime ?? new Date().toISOString(),
      subject: message.subject,
      senderEmail: getSenderAddress(merged),
      senderName: merged.from?.emailAddress?.name ?? merged.sender?.emailAddress?.name,
      category: routerResult.category,
      confidence: routerResult.confidence,
      reason: routerResult.reason,
    });

    if (routerResult.category === "other") {
      await markProcessedStatus(processedEmailId, "processed");
      logger.info("Classified as 'other' — logged, no agent run", {
        messageId: message.id,
        reason: routerResult.reason,
      });
      return;
    }

    const agent = agentRegistry[routerResult.category];
    if (!agent) {
      await markProcessedStatus(processedEmailId, "processed");
      logger.warn("No agent registered for category — logged only", { category: routerResult.category });
      return;
    }

    const attachmentBlocks = merged.hasAttachments ? await extractReadableAttachments(message.id) : [];
    const result = await agent.extract(merged, attachmentBlocks);
    await agent.store(processedEmailId, result);
    await markProcessedStatus(processedEmailId, "processed");
    await notifyNewItem(agent.name, agent.buildNotification(result));

    logger.info("Processed email", { messageId: message.id, category: routerResult.category, agent: agent.name });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Failed to process email — skipped, run continues", { messageId: message.id, error: errorMessage });
    if (processedEmailId) {
      await markProcessedStatus(processedEmailId, "failed", errorMessage).catch((markErr) =>
        logger.error("Also failed to mark email as failed", {
          error: markErr instanceof Error ? markErr.message : String(markErr),
        })
      );
    }
  }
}

/** One ingestion pass: delta query for new mail, process each, persist the new delta link. */
export async function pollInbox(): Promise<void> {
  const deltaLink = await getDeltaLink();
  const { messages, nextDeltaLink } = await fetchInboxDelta(deltaLink);

  logger.info(`Delta query returned ${messages.length} message(s)`);

  for (const message of messages) {
    await processMessage(message);
  }

  if (nextDeltaLink) {
    await saveDeltaLink(nextDeltaLink);
  }
}

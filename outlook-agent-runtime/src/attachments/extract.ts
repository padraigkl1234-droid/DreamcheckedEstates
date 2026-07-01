import { listAttachments } from "../graph/client.js";
import type { ContentBlock } from "../lib/claude.js";
import { logger } from "../lib/logger.js";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const PDF_TYPE = "application/pdf";

/**
 * Fetches a message's attachments and converts the ones Claude can read
 * natively (PDF, common image types) into content blocks. Anything else is
 * logged and skipped — the agent still runs on the email text alone.
 */
export async function extractReadableAttachments(messageId: string): Promise<ContentBlock[]> {
  const attachments = await listAttachments(messageId);
  const blocks: ContentBlock[] = [];

  for (const att of attachments) {
    if (!att.contentBytes) {
      logger.warn("Skipping attachment with no inline content", { name: att.name, contentType: att.contentType });
      continue;
    }

    if (att.contentType === PDF_TYPE) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: att.contentBytes },
      });
    } else if (SUPPORTED_IMAGE_TYPES.has(att.contentType)) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: att.contentBytes,
        },
      });
    } else {
      logger.warn("Skipping unsupported attachment type", { name: att.name, contentType: att.contentType });
    }
  }

  return blocks;
}

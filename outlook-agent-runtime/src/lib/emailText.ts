import type { GraphMessage } from "../graph/types.js";
import { htmlToText } from "./htmlToText.js";

export function getMessageText(message: GraphMessage): string {
  if (message.body?.content) {
    return message.body.contentType === "html" ? htmlToText(message.body.content) : message.body.content;
  }
  return message.bodyPreview ?? "";
}

export function getSenderAddress(message: GraphMessage): string {
  return message.from?.emailAddress?.address ?? message.sender?.emailAddress?.address ?? "unknown";
}

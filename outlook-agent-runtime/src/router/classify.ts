import { callClaudeForJson } from "../lib/claude.js";
import { getMessageText, getSenderAddress } from "../lib/emailText.js";
import type { GraphMessage } from "../graph/types.js";
import { routerJsonSchema, routerResultSchema, type RouterResult } from "./schema.js";

const SYSTEM_PROMPT = `You are the routing classifier for an Estates Coordinator's inbox. \
Read the email and classify it into exactly one category:

- invoice_quote: supplier invoices, quotes/estimates, billing, payment requests, PO confirmations.
- physical_task: requests or reports of physical maintenance work — repairs, call-outs, \
inspections, access requests, anything requiring a tradesperson or physical action on-site.
- other: anything that isn't clearly one of the above (general admin, newsletters, internal chat, \
scheduling with no physical task attached, etc).

When genuinely unsure, prefer "other" and lower your confidence rather than guessing.
Always call the classify_email tool with your answer — never respond in plain text.`;

export async function classifyEmail(message: GraphMessage): Promise<RouterResult> {
  const userText = [
    `From: ${getSenderAddress(message)}`,
    `Subject: ${message.subject ?? ""}`,
    `Received: ${message.receivedDateTime ?? ""}`,
    `Has attachments: ${message.hasAttachments ?? false}`,
    "",
    "Body:",
    getMessageText(message),
  ].join("\n");

  return callClaudeForJson({
    systemPrompt: SYSTEM_PROMPT,
    userText,
    toolName: "classify_email",
    toolDescription: "Classify an inbox email into invoice_quote, physical_task, or other.",
    jsonSchema: routerJsonSchema,
    zodSchema: routerResultSchema,
  });
}

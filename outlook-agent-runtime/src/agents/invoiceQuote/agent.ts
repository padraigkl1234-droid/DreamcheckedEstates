import { callClaudeForJson, type ContentBlock } from "../../lib/claude.js";
import { getMessageText, getSenderAddress } from "../../lib/emailText.js";
import type { GraphMessage } from "../../graph/types.js";
import type { Agent } from "../types.js";
import { saveInvoiceQuote } from "../../store/invoiceQuotes.js";
import { INVOICE_QUOTE_SYSTEM_PROMPT } from "./prompt.js";
import { invoiceQuoteJsonSchema, invoiceQuoteResultSchema, type InvoiceQuoteResult } from "./schema.js";

async function extract(message: GraphMessage, attachmentBlocks: ContentBlock[]): Promise<InvoiceQuoteResult> {
  const userText = [
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
    `From: ${getSenderAddress(message)}`,
    `Subject: ${message.subject ?? ""}`,
    `Received: ${message.receivedDateTime ?? ""}`,
    "",
    "Email body:",
    getMessageText(message),
  ].join("\n");

  return callClaudeForJson({
    systemPrompt: INVOICE_QUOTE_SYSTEM_PROMPT,
    userText,
    documents: attachmentBlocks,
    toolName: "extract_invoice_quote",
    toolDescription: "Extract a structured invoice or quote record from the email and any attachments.",
    jsonSchema: invoiceQuoteJsonSchema,
    zodSchema: invoiceQuoteResultSchema,
  });
}

function buildNotification(result: InvoiceQuoteResult): string {
  const amount =
    result.gross_amount != null ? `${result.currency ?? ""} ${result.gross_amount}`.trim() : "amount unknown";
  const flags = [result.flags.overdue && "OVERDUE", result.flags.missing_po && "MISSING PO"]
    .filter(Boolean)
    .join(", ");
  return (
    `New ${result.doc_type}: ${result.supplier_name} — ${amount}` +
    (result.reference ? ` (ref ${result.reference})` : "") +
    (flags ? ` [${flags}]` : "")
  );
}

export const invoiceQuoteAgent: Agent<InvoiceQuoteResult> = {
  category: "invoice_quote",
  name: "Invoice & Quote Agent",
  extract,
  store: saveInvoiceQuote,
  buildNotification,
};

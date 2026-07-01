import { supabase } from "./supabaseClient.js";
import type { InvoiceQuoteResult } from "../agents/invoiceQuote/schema.js";

export async function saveInvoiceQuote(processedEmailId: string, result: InvoiceQuoteResult): Promise<void> {
  const { error } = await supabase.from("invoice_quotes").insert({
    processed_email_id: processedEmailId,
    doc_type: result.doc_type,
    supplier_name: result.supplier_name,
    reference: result.reference,
    issue_date: result.issue_date,
    due_date: result.due_date,
    currency: result.currency,
    net_amount: result.net_amount,
    vat_amount: result.vat_amount,
    gross_amount: result.gross_amount,
    line_items: result.line_items,
    is_overdue: result.flags.overdue,
    missing_po: result.flags.missing_po,
    raw_extraction: result,
  });

  if (error) {
    throw new Error(`Failed to save invoice/quote record: ${error.message}`);
  }
}

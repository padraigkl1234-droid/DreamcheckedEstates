import { supabase } from "../store/supabaseClient.js";
import { getLastDigestCreatedAt, insertDigest } from "../store/digests.js";
import { notifier } from "./notifier.js";
import { logger } from "../lib/logger.js";

interface InvoiceRow {
  supplier_name: string | null;
  gross_amount: number | null;
  is_overdue: boolean;
  missing_po: boolean;
}

interface TaskRow {
  summary: string | null;
  priority: string;
}

/**
 * Covers everything since the previous digest (or the start of today if
 * none has run yet), so it stays correct however often the scheduler
 * actually fires the daily digest check.
 */
export async function compileAndSendDigest(): Promise<void> {
  const lastDigestAt = await getLastDigestCreatedAt();
  const windowStart = lastDigestAt ?? new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
  const digestDate = new Date().toISOString().slice(0, 10);

  const [invoicesRes, tasksRes] = await Promise.all([
    supabase
      .from("invoice_quotes")
      .select("supplier_name, gross_amount, is_overdue, missing_po")
      .gte("created_at", windowStart),
    supabase.from("tasks").select("summary, priority").gte("created_at", windowStart),
  ]);

  if (invoicesRes.error) {
    throw new Error(`Digest: failed to load invoice_quotes: ${invoicesRes.error.message}`);
  }
  if (tasksRes.error) {
    throw new Error(`Digest: failed to load tasks: ${tasksRes.error.message}`);
  }

  const invoiceRows = (invoicesRes.data ?? []) as InvoiceRow[];
  const taskRows = (tasksRes.data ?? []) as TaskRow[];

  const invoiceTotal = invoiceRows.reduce((sum, r) => sum + (r.gross_amount ?? 0), 0);

  const bySupplier: Record<string, { count: number; total: number }> = {};
  for (const row of invoiceRows) {
    const key = row.supplier_name ?? "Unknown supplier";
    bySupplier[key] ??= { count: 0, total: 0 };
    bySupplier[key].count += 1;
    bySupplier[key].total += row.gross_amount ?? 0;
  }

  const actionItems = [
    ...invoiceRows.filter((r) => r.is_overdue).map((r) => `Overdue invoice: ${r.supplier_name ?? "Unknown"}`),
    ...invoiceRows.filter((r) => r.missing_po).map((r) => `Missing PO: ${r.supplier_name ?? "Unknown"}`),
    ...taskRows
      .filter((t) => t.priority === "urgent" || t.priority === "high")
      .map((t) => `${t.priority.toUpperCase()} priority task: ${t.summary ?? ""}`),
  ];

  const payload = {
    date: digestDate,
    window_start: windowStart,
    invoices: { count: invoiceRows.length, total_value: invoiceTotal, by_supplier: bySupplier },
    tasks: { count: taskRows.length },
    action_items: actionItems,
  };

  try {
    await insertDigest({
      digestDate,
      invoiceCount: invoiceRows.length,
      invoiceTotalValue: invoiceTotal,
      invoiceBySupplier: bySupplier,
      taskCount: taskRows.length,
      actionItems,
      payload,
    });
  } catch (err) {
    // A duplicate digest_date (e.g. re-run after restart) shouldn't stop delivery.
    logger.warn("Failed to store digest row, still delivering it", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const lines = [
    `Invoices/quotes: ${invoiceRows.length}, total value ${invoiceTotal.toFixed(2)}`,
    ...Object.entries(bySupplier).map(([supplier, s]) => `  - ${supplier}: ${s.count} doc(s), ${s.total.toFixed(2)}`),
    `Tasks: ${taskRows.length}`,
    actionItems.length > 0 ? `Action needed:\n  - ${actionItems.join("\n  - ")}` : "No outstanding action items.",
  ];

  await notifier.send(`End-of-day digest — ${digestDate}`, lines.join("\n"));
  logger.info("Digest compiled and delivered", {
    digestDate,
    invoiceCount: invoiceRows.length,
    taskCount: taskRows.length,
  });
}

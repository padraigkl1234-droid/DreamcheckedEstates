import { supabase } from "./supabaseClient.js";

export async function getLastDigestCreatedAt(): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("digests")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load last digest: ${error.message}`);
  }
  return data?.created_at as string | undefined;
}

export interface DigestInsert {
  digestDate: string;
  invoiceCount: number;
  invoiceTotalValue: number;
  invoiceBySupplier: Record<string, { count: number; total: number }>;
  taskCount: number;
  actionItems: string[];
  payload: Record<string, unknown>;
}

export async function insertDigest(input: DigestInsert): Promise<void> {
  const { error } = await supabase.from("digests").insert({
    digest_date: input.digestDate,
    invoice_count: input.invoiceCount,
    invoice_total_value: input.invoiceTotalValue,
    invoice_by_supplier: input.invoiceBySupplier,
    task_count: input.taskCount,
    action_items: input.actionItems,
    payload: input.payload,
  });

  if (error) {
    throw new Error(`Failed to store digest: ${error.message}`);
  }
}

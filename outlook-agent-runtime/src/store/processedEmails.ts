import { supabase } from "./supabaseClient.js";
import type { Category } from "../router/schema.js";

export interface NewProcessedEmail {
  messageId: string;
  internetMessageId?: string;
  receivedAt: string;
  subject?: string;
  senderEmail: string;
  senderName?: string;
  category: Category;
  confidence: number;
  reason: string;
}

/** Idempotency check: has this Graph message already been recorded? */
export async function isMessageProcessed(messageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("processed_emails")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check processed_emails: ${error.message}`);
  }
  return data != null;
}

export async function insertProcessedEmail(input: NewProcessedEmail): Promise<string> {
  const { data, error } = await supabase
    .from("processed_emails")
    .insert({
      message_id: input.messageId,
      internet_message_id: input.internetMessageId,
      received_at: input.receivedAt,
      subject: input.subject,
      sender_email: input.senderEmail,
      sender_name: input.senderName,
      category: input.category,
      confidence: input.confidence,
      classification_reason: input.reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert processed_emails row: ${error?.message}`);
  }
  return data.id as string;
}

export async function markProcessedStatus(
  id: string,
  status: "processed" | "failed",
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from("processed_emails")
    .update({ status, error: errorMessage ?? null, processed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update processed_emails status: ${error.message}`);
  }
}

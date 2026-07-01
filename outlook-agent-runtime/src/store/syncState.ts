import { supabase } from "./supabaseClient.js";

const SYNC_STATE_ID = "inbox-delta";

/** Persists the Graph delta link across restarts so only new mail is ever fetched. */
export async function getDeltaLink(): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("sync_state")
    .select("delta_link")
    .eq("id", SYNC_STATE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load sync_state: ${error.message}`);
  }
  return data?.delta_link as string | undefined;
}

export async function saveDeltaLink(deltaLink: string): Promise<void> {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ id: SYNC_STATE_ID, delta_link: deltaLink, updated_at: new Date().toISOString() });

  if (error) {
    throw new Error(`Failed to save sync_state: ${error.message}`);
  }
}

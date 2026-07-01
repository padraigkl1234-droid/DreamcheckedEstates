import { supabase } from "./supabaseClient.js";
import type { TaskRequestResult } from "../agents/taskRequest/schema.js";

export async function saveTask(processedEmailId: string, result: TaskRequestResult): Promise<void> {
  const { error } = await supabase.from("tasks").insert({
    processed_email_id: processedEmailId,
    summary: result.summary,
    steps: result.steps,
    proposed_solution: result.proposed_solution,
    materials: result.requirements.materials,
    tools: result.requirements.tools,
    contractors: result.requirements.contractors,
    access_permits: result.requirements.access_or_permits,
    estimated_effort: result.estimated_effort,
    priority: result.priority,
    safety_flags: result.safety_compliance_flags,
    raw_extraction: result,
  });

  if (error) {
    throw new Error(`Failed to save task record: ${error.message}`);
  }
}

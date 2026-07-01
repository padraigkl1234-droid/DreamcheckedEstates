import { callClaudeForJson, type ContentBlock } from "../../lib/claude.js";
import { getMessageText, getSenderAddress } from "../../lib/emailText.js";
import type { GraphMessage } from "../../graph/types.js";
import type { Agent } from "../types.js";
import { saveTask } from "../../store/tasks.js";
import { TASK_REQUEST_SYSTEM_PROMPT } from "./prompt.js";
import { taskRequestJsonSchema, taskRequestResultSchema, type TaskRequestResult } from "./schema.js";

async function extract(message: GraphMessage, attachmentBlocks: ContentBlock[]): Promise<TaskRequestResult> {
  const userText = [
    `From: ${getSenderAddress(message)}`,
    `Subject: ${message.subject ?? ""}`,
    `Received: ${message.receivedDateTime ?? ""}`,
    "",
    "Email body:",
    getMessageText(message),
  ].join("\n");

  return callClaudeForJson({
    systemPrompt: TASK_REQUEST_SYSTEM_PROMPT,
    userText,
    documents: attachmentBlocks,
    toolName: "extract_task_request",
    toolDescription: "Extract a structured maintenance task/request record from the email and any attachments.",
    jsonSchema: taskRequestJsonSchema,
    zodSchema: taskRequestResultSchema,
  });
}

function buildNotification(result: TaskRequestResult): string {
  const flags = result.safety_compliance_flags.length > 0 ? ` [${result.safety_compliance_flags.join(", ")}]` : "";
  return `New task (${result.priority}): ${result.summary} — est. ${result.estimated_effort}${flags}`;
}

export const taskRequestAgent: Agent<TaskRequestResult> = {
  category: "physical_task",
  name: "Task & Request Agent",
  extract,
  store: saveTask,
  buildNotification,
};

import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { config } from "../config.js";
import { logger } from "./logger.js";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export type ContentBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ImageBlockParam
  | Anthropic.DocumentBlockParam;

export interface StructuredCallOptions<T> {
  systemPrompt: string;
  userText: string;
  /** Pre-built content blocks (e.g. PDF/image attachments) placed before the text block. */
  documents?: ContentBlock[];
  toolName: string;
  toolDescription: string;
  /** JSON Schema describing the tool's input — this is what forces strict shape from Claude. */
  jsonSchema: Record<string, unknown>;
  /** Runtime validator mirroring jsonSchema, used to actually enforce + type the result. */
  zodSchema: ZodType<T>;
  maxRetries?: number;
}

/**
 * Calls Claude with a single forced tool so the response is guaranteed to be
 * a structured object matching jsonSchema, then re-validates with zod and
 * retries once (with the validation error fed back to the model) before
 * giving up. Callers treat a thrown error as "this email failed" and move on.
 */
export async function callClaudeForJson<T>(opts: StructuredCallOptions<T>): Promise<T> {
  const {
    systemPrompt,
    userText,
    documents = [],
    toolName,
    toolDescription,
    jsonSchema,
    zodSchema,
    maxRetries = 1,
  } = opts;

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const textBlock: Anthropic.TextBlockParam = {
      type: "text",
      text: lastError
        ? `${userText}\n\nYour previous response failed schema validation with: ${lastError}\nCall ${toolName} again with corrected JSON that satisfies the schema.`
        : userText,
    };

    const response = await anthropic.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: [...documents, textBlock] }],
      tools: [
        {
          name: toolName,
          description: toolDescription,
          input_schema: jsonSchema as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: toolName },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUse) {
      lastError = "model did not return a tool_use block";
      logger.warn("Claude call returned no tool_use block, retrying", { toolName, attempt });
      continue;
    }

    const parsed = zodSchema.safeParse(toolUse.input);
    if (parsed.success) {
      return parsed.data;
    }

    lastError = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    logger.warn("Claude structured output failed validation, retrying", {
      toolName,
      attempt,
      error: lastError,
    });
  }

  throw new Error(
    `Claude structured call for "${toolName}" failed validation after ${maxRetries + 1} attempt(s): ${lastError}`
  );
}

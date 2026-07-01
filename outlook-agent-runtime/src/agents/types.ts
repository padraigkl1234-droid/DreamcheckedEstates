import type { ContentBlock } from "../lib/claude.js";
import type { GraphMessage } from "../graph/types.js";
import type { Category } from "../router/schema.js";

/**
 * Contract every task-specific agent implements. To add a new agent:
 * write a module satisfying this interface and register it in
 * agents/registry.ts against a router category — nothing else changes.
 */
export interface Agent<TResult = unknown> {
  category: Category;
  name: string;
  /** Calls Claude with the agent's own prompt + schema and returns validated output. */
  extract(message: GraphMessage, attachmentBlocks: ContentBlock[]): Promise<TResult>;
  /** Persists the extracted record, linked to the processed_emails row. */
  store(processedEmailId: string, result: TResult): Promise<void>;
  /** One-shot text for the on-arrival console notification. */
  buildNotification(result: TResult): string;
}

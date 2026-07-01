import type { Category } from "../router/schema.js";
import type { Agent } from "./types.js";
import { invoiceQuoteAgent } from "./invoiceQuote/agent.js";
import { taskRequestAgent } from "./taskRequest/agent.js";

/**
 * Router category -> agent. "other" has no agent by design (logged and
 * ignored). To add agent #3: build agents/<name>/{agent,schema,prompt}.ts,
 * add its category to router/schema.ts's CATEGORIES, and add one line here.
 */
export const agentRegistry: Partial<Record<Category, Agent<any>>> = {
  invoice_quote: invoiceQuoteAgent,
  physical_task: taskRequestAgent,
};

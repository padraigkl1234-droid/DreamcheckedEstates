import { z } from "zod";

export const taskRequestResultSchema = z.object({
  summary: z.string(),
  steps: z.array(z.string()),
  proposed_solution: z.string(),
  requirements: z.object({
    materials: z.array(z.string()),
    tools: z.array(z.string()),
    contractors: z.array(z.string()),
    access_or_permits: z.array(z.string()),
  }),
  estimated_effort: z.string(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  safety_compliance_flags: z.array(z.string()),
});

export type TaskRequestResult = z.infer<typeof taskRequestResultSchema>;

export const taskRequestJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One or two sentence summary of the request." },
    steps: { type: "array", items: { type: "string" }, description: "Ordered steps to resolve the request." },
    proposed_solution: { type: "string" },
    requirements: {
      type: "object",
      properties: {
        materials: { type: "array", items: { type: "string" } },
        tools: { type: "array", items: { type: "string" } },
        contractors: { type: "array", items: { type: "string" }, description: "Trades/specialists needed, if any." },
        access_or_permits: { type: "array", items: { type: "string" } },
      },
      required: ["materials", "tools", "contractors", "access_or_permits"],
      additionalProperties: false,
    },
    estimated_effort: { type: "string", description: "Rough effort estimate, e.g. '2 hours', 'half day'." },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    safety_compliance_flags: {
      type: "array",
      items: { type: "string" },
      description: "Any safety or compliance concerns, e.g. working at height, asbestos, electrical isolation.",
    },
  },
  required: [
    "summary",
    "steps",
    "proposed_solution",
    "requirements",
    "estimated_effort",
    "priority",
    "safety_compliance_flags",
  ],
  additionalProperties: false,
} as const;

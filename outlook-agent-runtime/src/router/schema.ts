import { z } from "zod";

export const CATEGORIES = ["invoice_quote", "physical_task", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const routerResultSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export type RouterResult = z.infer<typeof routerResultSchema>;

export const routerJsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: CATEGORIES as unknown as string[] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", description: "One-line justification for the classification." },
  },
  required: ["category", "confidence", "reason"],
  additionalProperties: false,
} as const;

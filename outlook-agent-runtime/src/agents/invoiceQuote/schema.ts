import { z } from "zod";

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  total: z.number().nullable(),
});

export const invoiceQuoteResultSchema = z.object({
  doc_type: z.enum(["invoice", "quote"]),
  supplier_name: z.string(),
  reference: z.string().nullable(),
  issue_date: z.string().nullable(), // YYYY-MM-DD
  due_date: z.string().nullable(),
  currency: z.string().nullable(),
  net_amount: z.number().nullable(),
  vat_amount: z.number().nullable(),
  gross_amount: z.number().nullable(),
  line_items: z.array(lineItemSchema),
  flags: z.object({
    overdue: z.boolean(),
    missing_po: z.boolean(),
  }),
  notes: z.string().nullable(),
});

export type InvoiceQuoteResult = z.infer<typeof invoiceQuoteResultSchema>;

export const invoiceQuoteJsonSchema = {
  type: "object",
  properties: {
    doc_type: { type: "string", enum: ["invoice", "quote"] },
    supplier_name: { type: "string" },
    reference: { type: ["string", "null"], description: "Invoice/quote number or PO reference." },
    issue_date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD." },
    due_date: { type: ["string", "null"], description: "ISO date YYYY-MM-DD." },
    currency: { type: ["string", "null"], description: "ISO 4217 code, e.g. GBP, EUR." },
    net_amount: { type: ["number", "null"] },
    vat_amount: { type: ["number", "null"] },
    gross_amount: { type: ["number", "null"] },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          total: { type: ["number", "null"] },
        },
        required: ["description", "quantity", "unit_price", "total"],
        additionalProperties: false,
      },
    },
    flags: {
      type: "object",
      properties: {
        overdue: { type: "boolean" },
        missing_po: { type: "boolean" },
      },
      required: ["overdue", "missing_po"],
      additionalProperties: false,
    },
    notes: { type: ["string", "null"] },
  },
  required: [
    "doc_type",
    "supplier_name",
    "reference",
    "issue_date",
    "due_date",
    "currency",
    "net_amount",
    "vat_amount",
    "gross_amount",
    "line_items",
    "flags",
    "notes",
  ],
  additionalProperties: false,
} as const;

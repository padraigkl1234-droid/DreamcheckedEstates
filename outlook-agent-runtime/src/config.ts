import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  MS_TENANT_ID: z.string().min(1, "MS_TENANT_ID is required"),
  MS_CLIENT_ID: z.string().min(1, "MS_CLIENT_ID is required"),
  MS_CLIENT_SECRET: z.string().min(1, "MS_CLIENT_SECRET is required"),
  MS_MAILBOX_UPN: z.string().email("MS_MAILBOX_UPN must be an email address"),

  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-5"),

  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  POLL_INTERVAL_MINUTES: z.coerce.number().positive().default(5),
  DIGEST_TIMEZONE: z.string().default("Europe/Dublin"),
  DIGEST_TIME: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "DIGEST_TIME must be HH:mm")
    .default("18:00"),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config = loadConfig();

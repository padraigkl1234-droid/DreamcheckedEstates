# Outlook Agent Runtime

Monitors an Outlook inbox via Microsoft Graph, classifies each new email with Claude, and routes it
to a task-specific agent that extracts a structured record, stores it in Supabase, and emits a
notification. Runs standalone; designed to slot into another app later behind a clean interface
(`pollInbox()` in `src/processor.ts`, `compileAndSendDigest()` in `src/reporter/digest.ts`).

**Read-only.** Uses Graph application permission `Mail.Read` only — this service never sends,
replies, deletes, moves, or modifies any email.

## Architecture

```
Ingestor (scheduler.ts, graph/)  --delta query-->  new messages
  -> Router (router/classify.ts)  --one Claude call-->  invoice_quote | physical_task | other
       -> Agent (agents/<name>/)  --Claude + strict JSON schema-->  structured record
            -> Store (store/)  --Supabase-->  processed_emails / invoice_quotes / tasks
            -> Reporter (reporter/notifier.ts)  -->  on-arrival notification
  -> Reporter (reporter/digest.ts)  --daily-->  end-of-day digest (console + Supabase)
```

- **Idempotent**: every message is keyed by its Graph `message_id` in `processed_emails`; already-seen
  messages are skipped.
- **Fail-safe**: one bad email is caught, logged, and marked `failed` in `processed_emails` — it never
  stops the run.
- **Delta sync**: the ingestor persists the Graph delta link in `sync_state` so every poll only ever
  fetches new mail, not the whole inbox. Swappable later for Graph change-notification webhooks by
  replacing the poll loop in `scheduler.ts` — nothing downstream changes.

## Setup

### 1. Azure app registration

1. Azure Portal → **App registrations** → your app (or create one).
2. **API permissions** → Add → Microsoft Graph → **Application permissions** → `Mail.Read` → **grant
   admin consent**. This must be an application permission, not delegated — the service runs headless
   with no signed-in user.
3. **Certificates & secrets** → new client secret → copy the value immediately (shown once).
4. **Overview** → copy the **Application (client) ID** and **Directory (tenant) ID**.
5. Note the exact mailbox address to poll — application-permission calls target
   `/users/{UPN}/messages`, not `/me/messages`.

### 2. Supabase

Create a project, then run `src/db/schema.sql` against it (SQL editor, or `psql`/`supabase db push`).
Copy the project URL and **service role** key (this runs server-side only — never expose it client-side).

### 3. Anthropic

Create an API key at console.anthropic.com.

### 4. Environment

```bash
cp .env.example .env
# fill in MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_MAILBOX_UPN,
# ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

| Var | Purpose |
|---|---|
| `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | Graph app-only auth (client credentials) |
| `MS_MAILBOX_UPN` | Mailbox to poll |
| `ANTHROPIC_API_KEY` | Claude API key |
| `CLAUDE_MODEL` | Model id, default `claude-sonnet-5` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Storage |
| `POLL_INTERVAL_MINUTES` | Ingestor poll cadence, default 5 |
| `DIGEST_TIMEZONE` / `DIGEST_TIME` | When the end-of-day digest fires (local HH:mm) |

### 5. Install

```bash
npm install
```

## Running

```bash
# Read-only proof: authenticate and print the last 10 inbox messages. Makes no writes.
npm run print-last-10

# One ingestion pass (classify + run agents + store + notify), without waiting on the scheduler.
npm run run-once

# Start the long-running service (poll loop + daily digest).
npm run dev        # ts-node style, for local iteration
npm run build && npm start   # compiled, for deployment
```

Test in this order (matches how it was built):
1. `npm run print-last-10` — proves Graph auth and mailbox access.
2. Send yourself a test invoice/quote email and a test maintenance-request email, then
   `npm run run-once` — proves classification, extraction, storage, and console notifications.
3. Check the `processed_emails`, `invoice_quotes`, and `tasks` tables in Supabase.
4. Set `DIGEST_TIME` a couple of minutes in the future and run `npm run dev` to see the digest fire.

## Adding a third agent

1. `src/agents/<name>/{agent,schema,prompt}.ts` — schema (zod + matching JSON Schema), a system
   prompt, and an `extract`/`store`/`buildNotification` implementation satisfying the `Agent`
   interface in `src/agents/types.ts`.
2. `src/store/<name>.ts` — a `save<Name>(processedEmailId, result)` function, plus the matching table
   in `src/db/schema.sql`.
3. Add the new category to `CATEGORIES` in `src/router/schema.ts` (this also updates what the router
   can classify into) and update the router's system prompt with a short description of the category.
4. Register it in `src/agents/registry.ts`:
   ```ts
   export const agentRegistry: Partial<Record<Category, Agent<any>>> = {
     invoice_quote: invoiceQuoteAgent,
     physical_task: taskRequestAgent,
     your_category: yourAgent,
   };
   ```

Nothing else changes — the processor, scheduler, and reporter are all category-agnostic.

## Plugging into another app later

- `pollInbox()` (`src/processor.ts`) and `compileAndSendDigest()` (`src/reporter/digest.ts`) are the
  two entrypoints; call them directly instead of running `scheduler.ts` if you want another process to
  own scheduling.
- `src/reporter/notifier.ts` exports a `Notifier` interface (`send(title, body)`); swap the
  console implementation for a Teams/Slack webhook or transactional email provider without touching
  any agent or store code.
- All state lives in Supabase — any other app with the same `SUPABASE_URL`/key can read
  `processed_emails`, `invoice_quotes`, `tasks`, and `digests` directly.

## Known limitations (v1)

- Poll-based ingestion (5–10 min), not real-time. Swappable for Graph change-notification webhooks
  later without touching the router/agents/store.
- Notifications are console-only; digests are also saved to Supabase. Wire a real channel via
  `src/reporter/notifier.ts` when ready.
- Attachment reading covers PDF and common image types (JPEG/PNG/GIF/WebP); other attachment types are
  logged and skipped, and the agent falls back to the email body alone.

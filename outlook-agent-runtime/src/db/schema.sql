-- Outlook Agent Runtime — Supabase/Postgres schema.
-- Run this once against your Supabase project (SQL editor or `supabase db push`).

create table if not exists processed_emails (
  id uuid primary key default gen_random_uuid(),
  message_id text unique not null,          -- Graph message id; idempotency key
  internet_message_id text,
  received_at timestamptz not null,
  subject text,
  sender_email text,
  sender_name text,
  category text check (category in ('invoice_quote', 'physical_task', 'other')),
  confidence numeric,
  classification_reason text,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists invoice_quotes (
  id uuid primary key default gen_random_uuid(),
  processed_email_id uuid not null references processed_emails(id),
  doc_type text check (doc_type in ('invoice', 'quote')),
  supplier_name text,
  reference text,
  issue_date date,
  due_date date,
  currency text,
  net_amount numeric,
  vat_amount numeric,
  gross_amount numeric,
  line_items jsonb,
  is_overdue boolean not null default false,
  missing_po boolean not null default false,
  raw_extraction jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  processed_email_id uuid not null references processed_emails(id),
  summary text,
  steps jsonb,
  proposed_solution text,
  materials jsonb,
  tools jsonb,
  contractors jsonb,
  access_permits jsonb,
  estimated_effort text,
  priority text check (priority in ('low', 'medium', 'high', 'urgent')),
  safety_flags jsonb,
  raw_extraction jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  digest_date date unique not null,
  invoice_count int not null default 0,
  invoice_total_value numeric not null default 0,
  invoice_by_supplier jsonb,
  task_count int not null default 0,
  action_items jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Persists the Microsoft Graph delta link across restarts so the ingestor
-- only ever fetches new mail, never re-scans the whole inbox.
create table if not exists sync_state (
  id text primary key,
  delta_link text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_processed_emails_status on processed_emails(status);
create index if not exists idx_invoice_quotes_created_at on invoice_quotes(created_at);
create index if not exists idx_tasks_created_at on tasks(created_at);

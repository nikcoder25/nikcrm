-- ============================================================
-- Growth Atlas - Netlify DB (Neon Postgres) schema
--
-- You normally do NOT need to run this by hand: the API function
-- (netlify/functions/data.js) creates these tables automatically on first use.
-- It is kept here as a reference and for anyone who wants to seed data.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text default '',
  status text default 'active',           -- lead / upcoming / active / paused / ended / loss
  source text default 'Direct',           -- Direct / Fiverr / Referral / Other
  package text default 'Standard',
  fee numeric default 0,
  team_member text default '',
  start_month text default '',            -- 'YYYY-MM'
  renewal_month text default '',
  risk text default 'low',
  notes text default '',
  created_by text default '',
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  type text default 'other',              -- guest / onpage / backlink / anchor / blog / audit / schema / other
  assignee text default '',
  status text default 'todo',             -- todo / doing / done
  due date,
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  month text not null,                    -- 'YYYY-MM'
  amount numeric default 0,
  status text default 'pending',          -- pending / paid / overdue
  paid_date date,
  created_at timestamptz default now(),
  unique (client_id, month)
);

-- Per-client resources: pasted links and uploaded files. File bytes live in
-- Netlify Blobs; this row holds the metadata and the blob key.
create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  kind text default 'link',               -- 'link' | 'file'
  label text default '',
  url text default '',                     -- external URL for links
  blob_key text default '',                -- Netlify Blobs key for uploaded files
  filename text default '',
  content_type text default '',
  size integer default 0,
  created_by text default '',
  created_at timestamptz default now()
);

-- Deliverables: what we owe each client and its progress.
create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  title text default '',
  type text default 'other',              -- reuses task types (guest / onpage / ...)
  status text default 'planned',          -- planned / in_progress / delivered / blocked
  quantity integer default 1,
  due_date date,
  notes text default '',
  created_at timestamptz default now()
);

-- Keywords: manual keyword-rank tracking per client. On each rank change the
-- API rolls current_rank into previous_rank so movement stays meaningful.
create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  keyword text default '',
  current_rank integer,                    -- lower is better; null = not ranked / untracked
  previous_rank integer,
  target_url text default '',
  checked_at timestamptz,
  notes text default '',
  created_at timestamptz default now()
);

-- Keyword rank history: one row appended each time a keyword's rank changes to a
-- real value (on create and on rank-changing updates). Powers the trend chart.
create table if not exists keyword_history (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid references keywords(id) on delete cascade,
  rank integer,
  recorded_at timestamptz default now()
);

-- Client monthly reports: the free-text "wins" narrative, one per client per
-- month. Rankings/deliverables in the report are assembled live from the tables
-- above; only this narrative is stored.
create table if not exists client_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  period text not null,                    -- 'YYYY-MM'
  summary text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id, period)
);

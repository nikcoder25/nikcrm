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

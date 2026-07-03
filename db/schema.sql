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
  email text default '',                  -- contact email (used to match Gmail messages)
  created_by text default '',
  created_at timestamptz default now()
);

-- Google Search Console link: which property this client maps to, e.g.
-- "sc-domain:example.com" or "https://example.com/". Kept as an ALTER
-- (mirroring netlify/functions/data.js) so existing databases upgrade in place.
alter table clients add column if not exists gsc_property text default '';

-- Per-client reference links (doc file / google sheet / Canva), shown as
-- clickable icons on the Clients table. Kept as ALTERs (mirroring
-- netlify/functions/data.js) so existing databases upgrade in place.
alter table clients add column if not exists doc_file text default '';
alter table clients add column if not exists google_sheet text default '';
alter table clients add column if not exists canva text default '';

-- Per-client project tracking shown on the Clients table: start/end dates
-- (end_date drives the countdown), free-text order details, and blog status
-- (not_started / in_progress / done). Kept as ALTERs so existing databases
-- upgrade in place.
alter table clients add column if not exists start_date date;
alter table clients add column if not exists end_date date;
alter table clients add column if not exists order_details text default '';
alter table clients add column if not exists blog_status text default 'not_started';

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  type text default 'other',              -- guest / onpage / backlink / anchor / blog / audit / schema / other
  assignee text default '',
  status text default 'todo',             -- todo / doing / review / blocked / done
  due date,
  description text default '',            -- free-text brief for whoever picks it up
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

-- Stripe payment links (optional; created from the Revenue tab when
-- STRIPE_SECRET_KEY is set). Kept as ALTERs (mirroring
-- netlify/functions/data.js) so existing databases upgrade in place.
alter table payments add column if not exists stripe_link_url text default '';
alter table payments add column if not exists stripe_link_id text default '';

-- Per-client resources: pasted links and uploaded files. File bytes live in
-- the file_blobs table below; this row holds the metadata and the blob key.
create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  kind text default 'link',               -- 'link' | 'file'
  label text default '',
  url text default '',                     -- external URL for links
  blob_key text default '',                -- file_blobs.key for uploaded files
  filename text default '',
  content_type text default '',
  size integer default 0,
  created_by text default '',
  created_at timestamptz default now()
);

-- Uploaded file bytes, stored in-database so the API runs the same on any
-- host (no blob-storage service). No FK: cleaned up explicitly by the API.
create table if not exists file_blobs (
  key text primary key,
  data bytea not null,
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
  month text default '',                   -- 'YYYY-MM' the deliverable is attributed to (scope matching)
  created_at timestamptz default now()
);

-- Keywords: keyword-rank tracking per client (manual edits + optional scheduled
-- DataForSEO checks). On each rank change the API rolls current_rank into
-- previous_rank so movement stays meaningful.
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

-- Serpfox-style tracking metadata, added after the initial release. Kept as
-- ALTERs (mirroring netlify/functions/data.js) so existing databases upgrade
-- in place with no manual step.
alter table keywords add column if not exists search_engine text default 'www.google.com';
alter table keywords add column if not exists location text default '';         -- e.g. "Washington, United States"
alter table keywords add column if not exists platform text default 'desktop';  -- 'desktop' | 'mobile'
alter table keywords add column if not exists volume integer;                   -- monthly search volume (manual entry)
alter table keywords add column if not exists starred boolean default false;
alter table keywords add column if not exists auto_track boolean default false; -- include in scheduled DataForSEO checks

-- Keyword rank history: one row appended each time a keyword's rank changes to a
-- real value (on create and on rank-changing updates). Powers the trend chart.
create table if not exists keyword_history (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid references keywords(id) on delete cascade,
  rank integer,
  recorded_at timestamptz default now()
);

-- Backlinks: per-client link-building tracker (manual entry).
create table if not exists backlinks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  url text default '',                     -- the page the link lives on
  target_url text default '',              -- the client page it points at
  anchor_text text default '',
  domain_rating integer,                   -- 0–100; null = unknown
  status text default 'live',              -- prospect / outreach / placed / live / lost
  cost numeric default 0,
  notes text default '',
  placed_date date,
  created_by text default '',
  created_at timestamptz default now()
);

-- Orders: standalone order tracker (the Orders tab). Not tied to clients —
-- rows mirror the team's order spreadsheet. The "count down" column shown in
-- the UI is computed from end_date, never stored.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text default 'not_started',       -- not_started / in_progress / finished / delivered
  source text default 'Direct',            -- Direct / Fiverr / Referral / Other (revenue-by-source)
  start_date date,
  end_date date,                           -- due date, or the delivered date once done
  delivery_time text default '',           -- 'HH:MM' (free text, display only)
  person text default '',
  website text default '',
  order_data text default '',              -- what was ordered, e.g. "monthly seo"
  price numeric default 0,                 -- project price; ADMIN-ONLY (never returned to non-admins)
  doc_file text default '',                -- optional reference doc URL
  google_sheet text default '',            -- optional reference sheet URL
  created_by text default '',
  created_at timestamptz default now()
);

-- AI visibility (AEO): whether a client gets cited in AI answers (ChatGPT,
-- Perplexity, Google AI Overviews, Claude, Gemini) for given prompts. Each row
-- is the CURRENT state per prompt+engine; changes to cited/position append a
-- history row (same semantics as keyword ranks and keyword_history).
create table if not exists ai_citations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  prompt text default '',
  engine text default 'chatgpt',           -- chatgpt / perplexity / google_ai / claude / gemini / other
  cited boolean,                           -- null = not checked yet
  position integer,                        -- position within the AI answer's citations
  url text default '',                     -- the client URL the answer cites
  checked_at timestamptz,                  -- when cited/position was last recorded
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists ai_citation_history (
  id uuid primary key default gen_random_uuid(),
  citation_id uuid references ai_citations(id) on delete cascade,
  cited boolean,
  position integer,
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

-- Client retainers: the agreed monthly scope (included quantity per deliverable
-- type). Compared live against delivered deliverables to flag scope creep.
create table if not exists client_retainers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  type text not null,                      -- deliverable type (reuses task types)
  quantity integer default 0,
  created_at timestamptz default now(),
  unique (client_id, type)
);

-- Google Search Console organic performance, filled nightly by the scheduled
-- function (netlify/functions/gsc-sync.mjs) when GSC_SERVICE_ACCOUNT_JSON is
-- set. gsc_daily keeps one row per client per day (rolling window, upserted);
-- gsc_queries keeps the top queries per client per month (replaced on sync).
create table if not exists gsc_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  date date not null,
  clicks integer default 0,
  impressions integer default 0,
  ctr real default 0,
  position real default 0,
  unique (client_id, date)
);

create table if not exists gsc_queries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  month text not null,                     -- 'YYYY-MM'
  query text not null,
  clicks integer default 0,
  impressions integer default 0,
  position real default 0,
  unique (client_id, month, query)
);

-- Per-user accounts (optional — the shared APP_PASSWORD login keeps working
-- regardless). Managed by admins from the Team tab. Passwords are stored as
-- scrypt hashes (hex hash + hex salt), never plaintext, and the hash/salt
-- columns are never returned by any API action.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  role text default 'member',              -- member | admin
  active boolean default true,
  created_at timestamptz default now()
);
-- Google SSO identity ("Sign in with Google" matches an existing account by
-- sub/email and records both here; the sub never changes, emails can).
-- Applied at runtime by google.js's ensureSchema.
alter table if exists users add column if not exists google_sub text default '';
alter table if exists users add column if not exists google_email text default '';

-- Activity log (audit trail): who did what, when. client_id has NO foreign
-- key on purpose — activity must survive client deletion, so the readable
-- name is recorded in entity_label/detail instead.
create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  actor text default '',
  verb text not null,
  entity text not null,
  entity_label text default '',
  client_id uuid,
  detail text default '',
  created_at timestamptz default now()
);

-- Team roster: assignees are real records. clients.team_member and
-- tasks.assignee still store the member NAME; this table populates the
-- assignee dropdowns and the Team page.
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text default '',
  email text default '',
  created_at timestamptz default now()
);

-- Activity log: a lightweight interaction timeline per client (calls, emails,
-- meetings, notes). happened_at is when the interaction occurred; created_at is
-- the row insert time. This is the CRM "touchpoint" history.
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  type text default 'note',                -- note / call / email / meeting
  body text default '',
  author text default '',
  happened_at timestamptz default now(),
  follow_up_date date,                      -- optional "next touch" reminder; null once done
  google_event_id text default '',          -- Google Calendar event id (once pushed)
  gmail_msg_id text default '',             -- source Gmail message id (for imported emails; dedupe)
  created_at timestamptz default now()
);

-- Third-party integrations. One row per provider (currently just 'google'),
-- holding the workspace-level OAuth tokens. Never exposed to the browser.
create table if not exists integrations (
  provider text primary key,               -- 'google'
  access_token text default '',
  refresh_token text default '',
  token_expiry timestamptz,
  scope text default '',
  account_email text default '',           -- the connected Google account
  connected_by text default '',
  updated_at timestamptz default now()
);

-- Short-lived OAuth state nonces: created by the (password-gated) authUrl action
-- and consumed once by the OAuth callback, so only an authenticated admin can
-- have initiated a connect.
create table if not exists oauth_states (
  state text primary key,
  created_by text default '',
  created_at timestamptz default now()
);
-- Which flow a state belongs to ('connect' = legacy workspace connect,
-- 'connect_user' = per-user Gmail/Calendar connect, 'sso' = Sign in with
-- Google), who started it, and which frontend origin the OAuth callback sends
-- the browser back to (validated against ALLOWED_ORIGIN / the API origin).
alter table oauth_states add column if not exists flow text default 'connect';
alter table oauth_states add column if not exists user_id text default '';
alter table oauth_states add column if not exists app_origin text default '';

-- Per-user Gmail/Calendar/Search-Console OAuth tokens (one row per connected
-- user account). Server-side only, never sent to the browser; takes precedence
-- over the workspace-wide `integrations` row. user_id is text (not a FK) on
-- purpose: google.js creates this table and must not depend on creation order
-- with `users`; rows are removed on disconnect and on user deletion.
create table if not exists user_google_tokens (
  user_id text primary key,
  access_token text default '',
  refresh_token text default '',
  token_expiry timestamptz,
  scope text default '',
  account_email text default '',
  updated_at timestamptz default now()
);

-- Additional connected Google accounts per user (multi-account). user_google_tokens
-- above stays the PRIMARY connection (Gmail + default calendar); this table lets a
-- user connect several accounts and import Search Console sites / push calendar
-- events from any of them. Keyed by (user_id, account_email). Applied at runtime by
-- google.js's ensureSchema, which also backfills existing single connections here.
create table if not exists user_google_accounts (
  user_id text not null,
  account_email text not null,
  google_sub text default '',
  access_token text default '',
  refresh_token text default '',
  token_expiry timestamptz,
  scope text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, account_email)
);

-- Search Console sites a user imported into their Websites dashboard.
-- account_email records which connected Google account owns the site (empty on
-- pre-multi-account rows → the user's primary token is used).
create table if not exists user_gsc_sites (
  user_id text not null,
  site_url text not null,
  account_email text default '',
  added_at timestamptz default now(),
  primary key (user_id, site_url)
);

-- Which Search Console site powers a client's "Organic search" panel, and
-- whose per-user OAuth token fetches it. Takes precedence over the
-- service-account path (clients.gsc_property + gsc_daily/gsc_queries). No FK
-- to clients — the table is owned by google.js and must not depend on
-- creation order; data.js removes the row when the client is deleted.
create table if not exists client_gsc_sites (
  client_id uuid primary key,
  site_url text not null,
  user_id text not null,
  updated_at timestamptz default now()
);

-- Per-site Search Analytics cache (JSON payload: daily series + top queries).
-- Bounds Google API calls to at most two per site per TTL, which also keeps
-- any one Cloudflare Worker invocation far below its 50-subrequest limit.
create table if not exists gsc_cache (
  site_url text primary key,
  payload text default '',
  fetched_at timestamptz default now()
);

-- Schema version for data.js's runMigrations: existing databases apply only
-- the deltas since their recorded version (single row, id=1).
create table if not exists schema_meta (
  id integer primary key,
  version integer not null
);

-- Durable login/portal brute-force counters (v2). Per-instance memory is the
-- first line; this row is the authority across Cloudflare's many short-lived
-- Worker instances. Rows expire opportunistically after their window lapses.
create table if not exists login_throttle (
  ip text primary key,
  fails integer default 0,
  reset_at timestamptz default now()
);

-- ============================================================
-- Indexes. Postgres does not auto-index FK columns; without these,
-- per-client lookups and ON DELETE CASCADE degrade linearly with data size.
-- (payments, client_reports, client_retainers, gsc_daily and gsc_queries are
-- covered by their unique constraints, which lead with client_id.)
-- ============================================================
create index if not exists idx_tasks_client on tasks (client_id);
create index if not exists idx_resources_client on resources (client_id);
create index if not exists idx_resources_blob_key on resources (blob_key);
create index if not exists idx_deliverables_client on deliverables (client_id);
create index if not exists idx_keywords_client on keywords (client_id);
create index if not exists idx_keyword_history_kw on keyword_history (keyword_id);
create index if not exists idx_keyword_history_time on keyword_history (recorded_at);
create index if not exists idx_backlinks_client on backlinks (client_id);
create index if not exists idx_ai_citations_client on ai_citations (client_id);
create index if not exists idx_ai_citation_history_cit on ai_citation_history (citation_id);
create index if not exists idx_activity_time on activity (created_at desc);
create index if not exists idx_activities_client on activities (client_id);
create index if not exists idx_activities_time on activities (happened_at);
create index if not exists idx_activities_gmail on activities (gmail_msg_id);

import { timingSafeEqual } from "node:crypto";
import { neon } from "@netlify/neon";
import { newPasswordRecord, verifyPassword, signToken, verifyToken } from "../lib/auth.js";
import { fileStore } from "../lib/files.js";
import { STATUSES, SOURCES, PACKAGES, RISKS, TASK_TYPES, TASK_STATES, PAY_STATES, DELIVERABLE_STATES, BACKLINK_STATES, AI_ENGINES, ACTIVITY_TYPES, typeLabel, activityLabel } from "../../src/lib/constants.js";
import { lastDayOfMonth } from "../../src/lib/format.js";

// Uploaded client files live in the file_blobs table (see lib/files.js) so the
// API is host-portable. The "resources" table holds the metadata + blob key.
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB — keeps the base64 body under the function limit

// Netlify DB (Neon) connection, created lazily. neon() reads NETLIFY_DATABASE_URL
// (set when you provision Netlify DB, or added manually on the site). We only
// build the client inside a data action — after the handler has verified the URL
// is present — so login/auth keeps working even when the database is not set up.
let _sql;
function db() {
  if (!_sql) _sql = neon();
  return _sql;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

// Create the tables on first use so there is no manual SQL step. Cheap: the
// CREATEs are guarded by IF NOT EXISTS and only run once per warm instance.
let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;
  const _t = await sql`select to_regclass('public.clients') as n`; if (_t[0] && _t[0].n) { schemaReady = true; return; }
  await sql`create extension if not exists pgcrypto`;
  await sql`create table if not exists clients (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    niche text default '',
    status text default 'active',
    source text default 'Direct',
    package text default 'Standard',
    fee numeric default 0,
    team_member text default '',
    start_month text default '',
    renewal_month text default '',
    risk text default 'low',
    notes text default '',
    created_by text default '',
    created_at timestamptz default now()
  )`;
  // Google Search Console link: which property this client maps to, e.g.
  // "sc-domain:example.com" or "https://example.com/". ALTER ... IF NOT EXISTS
  // upgrades existing databases in place.
  await sql`alter table clients add column if not exists gsc_property text default ''`;
  await sql`create table if not exists tasks (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    title text not null,
    type text default 'other',
    assignee text default '',
    status text default 'todo',
    due date,
    created_at timestamptz default now()
  )`;
  await sql`create table if not exists payments (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    month text not null,
    amount numeric default 0,
    status text default 'pending',
    paid_date date,
    created_at timestamptz default now(),
    unique (client_id, month)
  )`;
  // Stripe payment links (optional; created from the Revenue tab when
  // STRIPE_SECRET_KEY is set). ALTER ... IF NOT EXISTS upgrades in place.
  await sql`alter table payments add column if not exists stripe_link_url text default ''`;
  await sql`alter table payments add column if not exists stripe_link_id text default ''`;
  await sql`create table if not exists resources (
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
  )`;
  await sql`create table if not exists deliverables (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    title text default '',
    type text default 'other',              -- reuses task types (guest / onpage / ...)
    status text default 'planned',          -- planned / in_progress / delivered / blocked
    quantity integer default 1,
    due_date date,
    notes text default '',
    created_at timestamptz default now()
  )`;
  await sql`create table if not exists keywords (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    keyword text default '',
    current_rank integer,                    -- lower is better; null = not ranked / untracked
    previous_rank integer,                   -- rolled from current_rank on each rank change
    target_url text default '',
    checked_at timestamptz,                  -- when the current_rank was last recorded
    notes text default '',
    created_at timestamptz default now()
  )`;
  // Serpfox-style tracking metadata, added after the initial release. ALTER ...
  // IF NOT EXISTS keeps existing databases upgrading in place with no manual step.
  await sql`alter table keywords add column if not exists search_engine text default 'www.google.com'`;
  await sql`alter table keywords add column if not exists location text default ''`;
  await sql`alter table keywords add column if not exists platform text default 'desktop'`;
  await sql`alter table keywords add column if not exists volume integer`;
  await sql`alter table keywords add column if not exists starred boolean default false`;
  await sql`alter table keywords add column if not exists auto_track boolean default false`;
  await sql`create table if not exists keyword_history (
    id uuid primary key default gen_random_uuid(),
    keyword_id uuid references keywords(id) on delete cascade,
    rank integer,
    recorded_at timestamptz default now()
  )`;
  await sql`create table if not exists backlinks (
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
  )`;
  await sql`create table if not exists ai_citations (
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
  )`;
  await sql`create table if not exists ai_citation_history (
    id uuid primary key default gen_random_uuid(),
    citation_id uuid references ai_citations(id) on delete cascade,
    cited boolean,
    position integer,
    recorded_at timestamptz default now()
  )`;
  await sql`create table if not exists client_reports (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    period text not null,                    -- 'YYYY-MM'
    summary text default '',                 -- the free-text wins narrative
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (client_id, period)
  )`;
  await sql`create table if not exists client_retainers (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    type text not null,                      -- deliverable type (reuses task types)
    quantity integer default 0,              -- agreed monthly included quantity
    created_at timestamptz default now(),
    unique (client_id, type)
  )`;
  // Team roster: assignees are now real records. clients.team_member and
  // tasks.assignee still store the member NAME (keeps existing data valid and
  // avoids a risky id migration); the roster just populates the dropdowns.
  await sql`create table if not exists team_members (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    role text default '',
    email text default '',
    created_at timestamptz default now()
  )`;
  // Deliverables are attributed to a calendar month so they can be matched to
  // the retainer scope by type + month. Older rows may predate this column.
  await sql`alter table deliverables add column if not exists month text default ''`;
  // Backfill month from an existing due_date so legacy delivered items still
  // count toward their month's scope instead of silently dropping out.
  await sql`update deliverables set month = substring(due_date::text from 1 for 7)
    where (month is null or month = '') and due_date is not null`;
  // Read-only client portal: one revocable share token per client. The token
  // is the whole credential for the public portalLoad action, so it's long,
  // random and unique; disabling keeps the row (re-enable restores the link).
  await sql`create table if not exists client_portal_tokens (
    client_id uuid primary key references clients(id) on delete cascade,
    token text not null unique,
    enabled boolean default true,
    created_at timestamptz default now()
  )`;
  // Recipient for the scheduled monthly report email (one optional address per
  // client). Also created by monthly-report-email.mjs; created here too so the
  // management UI works before the schedule ever runs.
  await sql`create table if not exists client_report_emails (
    client_id uuid primary key references clients(id) on delete cascade,
    recipient text not null,
    enabled boolean default true
  )`;
  // Google Search Console organic performance, filled nightly by gsc-sync.mjs.
  // gsc_daily keeps one row per client per day (rolling window, upserted);
  // gsc_queries keeps the top queries per client per month (replaced on sync).
  await sql`create table if not exists gsc_daily (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    date date not null,
    clicks integer default 0,
    impressions integer default 0,
    ctr real default 0,
    position real default 0,
    unique (client_id, date)
  )`;
  await sql`create table if not exists gsc_queries (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    month text not null,                     -- 'YYYY-MM'
    query text not null,
    clicks integer default 0,
    impressions integer default 0,
    position real default 0,
    unique (client_id, month, query)
  )`;
  // Per-user accounts (optional — the shared APP_PASSWORD login keeps working
  // regardless). Passwords are stored as scrypt hashes, never plaintext, and
  // the hash/salt columns are never selected by any client-facing query.
  await sql`create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null unique,
    password_hash text not null,
    password_salt text not null,
    role text default 'member',              -- member | admin
    active boolean default true,
    created_at timestamptz default now()
  )`;
  // Activity log: a lightweight interaction timeline per client (the CRM
  // "touchpoints" — calls, emails, meetings, and free-text notes). happened_at
  // is when the interaction occurred (author-editable); created_at is the row
  // insert time. This is what turns the ops board into a real CRM. Distinct
  // from the `activity` audit table below, which records who changed what.
  await sql`create table if not exists activities (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    type text default 'note',                -- note / call / email / meeting
    body text default '',
    author text default '',
    happened_at timestamptz default now(),
    follow_up_date date,                      -- optional "next touch" reminder; null once done
    created_at timestamptz default now()
  )`;
  // follow_up_date was added after the first activities release; add it for
  // installs whose table predates it.
  await sql`alter table activities add column if not exists follow_up_date date`;
  // Audit trail. client_id has NO foreign key on purpose: activity must
  // survive client deletion, so the human-readable name lives in
  // entity_label/detail instead of being joined at read time.
  await sql`create table if not exists activity (
    id uuid primary key default gen_random_uuid(),
    actor text default '',
    verb text not null,
    entity text not null,
    entity_label text default '',
    client_id uuid,
    detail text default '',
    created_at timestamptz default now()
  )`;
  // Google integration columns: a client contact email (for Gmail matching),
  // the pushed Calendar event id, and the source Gmail message id (dedupe).
  await sql`alter table clients add column if not exists email text default ''`;
  await sql`alter table activities add column if not exists google_event_id text default ''`;
  await sql`alter table activities add column if not exists gmail_msg_id text default ''`;
  // Uploaded file bytes (see lib/files.js) — in-database so the API runs the
  // same on any host. resources.blob_key points at file_blobs.key.
  await sql`create table if not exists file_blobs (
    key text primary key,
    data bytea not null,
    created_at timestamptz default now()
  )`;
  // Postgres does NOT auto-index foreign-key columns. Without these, every
  // per-client lookup and every ON DELETE CASCADE does a full table scan,
  // which degrades linearly as the client count grows. Idempotent, so they
  // cost nothing after the first run. (payments, client_reports,
  // client_retainers, gsc_daily and gsc_queries are covered by unique
  // constraints leading with client_id.)
  await Promise.all([
    sql`create index if not exists idx_tasks_client on tasks (client_id)`,
    sql`create index if not exists idx_resources_client on resources (client_id)`,
    sql`create index if not exists idx_resources_blob_key on resources (blob_key)`,
    sql`create index if not exists idx_deliverables_client on deliverables (client_id)`,
    sql`create index if not exists idx_keywords_client on keywords (client_id)`,
    sql`create index if not exists idx_keyword_history_kw on keyword_history (keyword_id)`,
    sql`create index if not exists idx_keyword_history_time on keyword_history (recorded_at)`,
    sql`create index if not exists idx_backlinks_client on backlinks (client_id)`,
    sql`create index if not exists idx_ai_citations_client on ai_citations (client_id)`,
    sql`create index if not exists idx_ai_citation_history_cit on ai_citation_history (citation_id)`,
    sql`create index if not exists idx_activity_time on activity (created_at desc)`,
    sql`create index if not exists idx_activities_client on activities (client_id)`,
    sql`create index if not exists idx_activities_time on activities (happened_at)`,
    sql`create index if not exists idx_activities_gmail on activities (gmail_msg_id)`,
  ]);
  schemaReady = true;
}

// One query per dataset, shared by `load` (which returns all of them) and
// `loadSome` (only the requested ones) so both always return identical shapes.
const DATASET_QUERIES = {
  clients: (sql) => sql`select * from clients order by created_at desc`,
  tasks: (sql) => sql`select * from tasks order by created_at desc`,
  payments: (sql) => sql`select * from payments`,
  resources: (sql) => sql`select id, client_id, kind, label, url, blob_key, filename, content_type, size, created_by, created_at
    from resources order by created_at desc`,
  deliverables: (sql) => sql`select * from deliverables order by created_at desc`,
  keywords: (sql) => sql`select * from keywords order by created_at desc`,
  // keyword_history is unbounded; only ship the last 25 points per keyword.
  // The full series comes from the keywordHistory action.
  keyword_history: (sql) => sql`select id, keyword_id, rank, recorded_at from
    (select h.*, row_number() over (partition by keyword_id order by recorded_at desc) rn from keyword_history h) t
    where rn <= 25 order by recorded_at asc`,
  backlinks: (sql) => sql`select * from backlinks order by created_at desc`,
  ai_citations: (sql) => sql`select * from ai_citations order by created_at desc`,
  // ai_citation_history is unbounded like keyword_history; only ship the last
  // 25 points per citation.
  ai_citation_history: (sql) => sql`select id, citation_id, cited, position, recorded_at from
    (select h.*, row_number() over (partition by citation_id order by recorded_at desc) rn from ai_citation_history h) t
    where rn <= 25 order by recorded_at asc`,
  client_reports: (sql) => sql`select id, client_id, period, summary, updated_at from client_reports`,
  client_retainers: (sql) => sql`select id, client_id, type, quantity from client_retainers`,
  team_members: (sql) => sql`select id, name, role, email from team_members order by name asc`,
  activity: (sql) => sql`select id, actor, verb, entity, entity_label, client_id, detail, created_at
    from activity order by created_at desc limit 100`,
  // Client touchpoint timeline (notes / calls / emails / meetings) — distinct
  // from the `activity` audit trail above.
  activities: (sql) => sql`select id, client_id, type, body, author, happened_at, follow_up_date, google_event_id, gmail_msg_id
    from activities order by happened_at desc`,
};

// Fetch the named datasets in parallel → { name: rows, ... }.
async function loadDatasets(sql, names) {
  const results = await Promise.all(names.map((n) => DATASET_QUERIES[n](sql)));
  return Object.fromEntries(names.map((n, i) => [n, results[i]]));
}

// Best-effort audit write — a logging failure must never fail the action itself.
async function logActivity(sql, { actor = "", verb, entity, entity_label = "", client_id = null, detail = "" }) {
  try {
    await sql`insert into activity (actor, verb, entity, entity_label, client_id, detail)
      values (${actor}, ${verb}, ${entity}, ${entity_label}, ${client_id ?? null}, ${detail})`;
  } catch { /* best effort */ }
}

// Content types that are safe to render in the browser. Anything else —
// notably text/html and image/svg+xml, which can run scripts on our origin —
// is served as a generic binary attachment instead.
const INLINE_SAFE = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
  "application/pdf", "text/plain", "text/csv",
  "video/mp4", "video/webm", "audio/mpeg", "audio/wav",
]);

// Only real web links are allowed anywhere we store a user-supplied URL.
// Returns the normalized href, "" for blank input, or null when invalid
// (bad syntax or a non-http(s) scheme like javascript:).
function safeHttpUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let u;
  try { u = new URL(s); }
  catch { try { u = new URL("https://" + s); } catch { return null; } }
  return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
}

// Enum validation: a typo'd status/source silently drops rows out of every
// rollup, so reject unknown values at the API instead of trusting the UI.
const TASK_TYPE_KEYS = TASK_TYPES.map((t) => t.key);
const TASK_STATE_KEYS = TASK_STATES.map((s) => s.key);
const PAY_STATE_KEYS = PAY_STATES.map((s) => s.key);
const DELIVERABLE_STATE_KEYS = DELIVERABLE_STATES.map((s) => s.key);
const BACKLINK_STATE_KEYS = BACKLINK_STATES.map((s) => s.key);
const AI_ENGINE_KEYS = AI_ENGINES.map((e) => e.key);
const ACTIVITY_TYPE_KEYS = ACTIVITY_TYPES.map((t) => t.key);
const KEYWORD_PLATFORMS = ["desktop", "mobile"];
const USER_ROLES = ["member", "admin"];
// Loose email shape check — one @, something either side, a dot in the domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function badEnum(field, value, allowed) {
  if (value === undefined || value === null || value === "") return null;
  return allowed.includes(value) ? null : json({ error: `Invalid ${field}: ${value}` }, 400);
}

// Minimal Stripe REST call — form-encoded POST, no SDK. Throws with Stripe's
// own error message so the UI shows something actionable.
async function stripePost(path, params) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error (HTTP ${res.status})`);
  return data;
}

// A Search Console property is either a domain property ("sc-domain:example.com")
// or a URL-prefix property ("https://example.com/"). Returns the trimmed value,
// "" for blank input, or null when it's neither form.
function safeGscProperty(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.startsWith("sc-domain:") || s.startsWith("http") ? s : null;
}

// Rank is a positive integer or null (unranked). Coerce loosely from the UI.
function toRank(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Domain rating is 0–100 or null (unknown). Returns undefined when the value
// is a number outside that range, so callers can reject it with a clear 400.
function toDomainRating(v) {
  const n = toRank(v);
  if (n === null) return null;
  return n >= 0 && n <= 100 ? n : undefined;
}

// Cited is a tri-state: true / false / null (not checked yet).
function toCited(v) {
  if (v === "" || v === null || v === undefined) return null;
  return Boolean(v);
}

// Auth model: a shared team password gates everything. An optional separate
// admin password unlocks destructive actions (deleting clients). On top of
// that, optional per-user accounts (users table, email + personal password)
// sign in through the same login action and get the same signed session token.
//
// If NO secret is configured we FAIL CLOSED: the API refuses every request
// with a clear operator message. A misconfigured deploy (forgotten or mistyped
// APP_PASSWORD) must never silently expose the whole database to the public.
// For local dev, set APP_PASSWORD in .env (see .env.example).
function authConfigured() {
  return Boolean(process.env.APP_PASSWORD || process.env.ADMIN_PASSWORD);
}

// Signing secret for session tokens. Prefer a dedicated SESSION_SECRET env
// var; without one, fall back to a key derived from the env passwords so
// tokens work with zero new configuration. (With the fallback, rotating either
// password invalidates every outstanding session — a feature.) Returns null
// when there is no secret material at all: then no token can be issued OR
// accepted, keeping the fail-closed guarantee.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (authConfigured()) {
    return `ga-session-v1:${process.env.APP_PASSWORD || ""}:${process.env.ADMIN_PASSWORD || ""}`;
  }
  return null;
}

// Request authentication, used by both GET and POST: the Bearer session token
// (preferred) or the legacy x-app-password header (kept so browsers that
// logged in before the token rollout keep working until their next login).
// Returns { role, name, userId } or null. userId is null for shared-password
// and legacy sessions.
function authenticate(req) {
  const header = req.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer !== header) {
    const secret = sessionSecret();
    const data = secret ? verifyToken(bearer, secret) : null;
    if (!data) return null;
    return {
      role: data.role,
      name: String(data.name || ""),
      userId: data.sub && data.sub !== "shared" ? data.sub : null,
    };
  }
  const role = resolveRole(req.headers.get("x-app-password") || "");
  return role ? { role, name: "", userId: null } : null;
}

// Throwaway scrypt record used to keep "unknown email" and "wrong password"
// responses the same speed, so login timing can't enumerate accounts.
let _dummyRecord;
function dummyRecord() {
  if (!_dummyRecord) _dummyRecord = newPasswordRecord(crypto.randomUUID());
  return _dummyRecord;
}

// Constant-time string compare so response timing can't leak how much of the
// password prefix matched.
function safeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Returns "admin" / "member" for a correct password, or null for a wrong one.
// Only call this once authConfigured() is true.
function resolveRole(pw) {
  const APP = process.env.APP_PASSWORD || "";
  const ADMIN = process.env.ADMIN_PASSWORD || "";
  if (ADMIN && safeEq(pw, ADMIN)) return "admin";
  if (APP && safeEq(pw, APP)) return "member";
  return null;                                  // wrong / missing password
}

// Brute-force throttle for login attempts. Per-instance memory is enough to
// blunt password spraying without a datastore: after MAX_FAILS failures from
// one IP inside the window, reject with 429 until the window resets.
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 15;
const loginFails = new Map(); // ip -> { count, resetAt }
function clientIp(req) {
  return req.headers.get("x-nf-client-connection-ip")
    || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "unknown";
}
function loginBlocked(ip) {
  const rec = loginFails.get(ip);
  if (!rec || Date.now() > rec.resetAt) return false;
  return rec.count >= MAX_FAILS;
}
function noteLoginFail(ip) {
  const rec = loginFails.get(ip);
  if (!rec || Date.now() > rec.resetAt) {
    loginFails.set(ip, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
  } else {
    rec.count += 1;
  }
  if (loginFails.size > 5000) loginFails.clear(); // bound memory
}

const NOT_CONFIGURED = "Login isn't set up yet. Set APP_PASSWORD in Netlify.";

export default async (req) => {
  // GET is used only to download an uploaded file (streamed as its real bytes,
  // not JSON). Still password-gated, like every other request.
  if (req.method === "GET") {
    if (!sessionSecret()) return json({ error: NOT_CONFIGURED }, 503);
    if (!authenticate(req)) return json({ error: "Unauthorized" }, 401);
    if (!process.env.NETLIFY_DATABASE_URL) return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);
    const key = new URL(req.url).searchParams.get("key") || "";
    if (!key) return json({ error: "Missing file key" }, 400);
    try {
      const sql = db();
      await ensureSchema(sql);
      const rows = await sql`select filename, content_type from resources where blob_key=${key} and kind='file' limit 1`;
      if (!rows.length) return json({ error: "File not found" }, 404);
      const data = await fileStore(sql).get(key);
      if (!data) return json({ error: "File no longer stored" }, 404);
      const safeName = (rows[0].filename || "file").replace(/["\\\r\n]/g, "");
      // Whitelisted types may render inline; everything else (esp. HTML/SVG,
      // which would execute scripts on our origin) downloads as a plain binary.
      const inlineSafe = INLINE_SAFE.has(rows[0].content_type);
      return new Response(data, {
        status: 200,
        headers: {
          "content-type": inlineSafe ? rows[0].content_type : "application/octet-stream",
          "content-disposition": `${inlineSafe ? "inline" : "attachment"}; filename="${safeName}"`,
          "x-content-type-options": "nosniff",
        },
      });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { action, payload = {} } = body;

  // Login: validate the credentials and hand back { ok, role, name, token }.
  // Two flavors share one action and one brute-force throttle:
  //   payload.email set   → per-user account (email + personal password)
  //   payload.password    → shared team password (the original flow, unchanged)
  if (action === "login") {
    const ip = clientIp(req);

    // Per-user login. Deliberately NOT gated on authConfigured(): it must keep
    // working when the env passwords are removed and only user accounts
    // remain — but that setup requires SESSION_SECRET, otherwise there is no
    // signing key and we fail closed like everything else.
    if (payload.email) {
      const secret = sessionSecret();
      if (!secret) return json({ error: NOT_CONFIGURED }, 503);
      if (!process.env.NETLIFY_DATABASE_URL) {
        return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);
      }
      if (loginBlocked(ip)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
      try {
        const sql = db();
        await ensureSchema(sql);
        const email = String(payload.email).trim().toLowerCase();
        const rows = await sql`select id, name, role, password_hash, password_salt
          from users where lower(email)=${email} and active limit 1`;
        // Unknown email still burns one scrypt (against a throwaway record) so
        // the response takes the same time either way — no account enumeration.
        let ok;
        if (rows.length) {
          ok = verifyPassword(payload.password || "", rows[0].password_salt, rows[0].password_hash);
        } else {
          const dummy = dummyRecord();
          verifyPassword(payload.password || "", dummy.salt, dummy.hash);
          ok = false;
        }
        if (!ok) {
          noteLoginFail(ip);
          return json({ error: "Wrong email or password." }, 401);
        }
        const role = rows[0].role === "admin" ? "admin" : "member";
        const name = rows[0].name || "Team member";
        const token = signToken({ sub: rows[0].id, name, role }, secret);
        return json({ ok: true, role, name, token });
      } catch (e) {
        return json({ error: String(e?.message || e) }, 500);
      }
    }

    // Shared team password — same checks as always, now also issuing a token
    // (sub "shared", the display name the person typed on the login screen).
    if (!authConfigured()) return json({ error: NOT_CONFIGURED }, 503);
    if (loginBlocked(ip)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    const role = resolveRole(payload.password || "");
    if (!role) {
      noteLoginFail(ip);
      return json({ error: "Wrong password. Ask your team lead for it." }, 401);
    }
    const name = String(payload.name || "").trim().slice(0, 80) || "Team member";
    const token = signToken({ sub: "shared", name, role }, sessionSecret());
    return json({ ok: true, role, name, token });
  }

  // Read-only client portal. The token in the URL is the whole credential, so
  // this runs BEFORE the team-password check (like "login") — but still behind
  // the fail-closed auth/DB configuration guards, and throttled with the same
  // per-IP counter as login so tokens can't be guessed by brute force. Unknown
  // and disabled tokens both return the same 404 on purpose.
  if (action === "portalLoad") {
    if (!sessionSecret()) return json({ error: NOT_CONFIGURED }, 503);
    if (!process.env.NETLIFY_DATABASE_URL) {
      return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);
    }
    const ip = clientIp(req);
    if (loginBlocked(ip)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    try {
      const sql = db();
      await ensureSchema(sql);
      const token = String(payload.token || "");
      const found = token
        ? await sql`select client_id from client_portal_tokens where token=${token} and enabled limit 1`
        : [];
      if (!found.length) {
        noteLoginFail(ip);
        return json({ error: "Not found" }, 404);
      }
      const clientId = found[0].client_id;
      // Only this client's rows, and only portal-safe columns — every SELECT
      // lists its columns explicitly. Never fee / notes / risk / team_member /
      // created_by, and never tasks, payments or resources.
      const [clients, keywords, keyword_history, deliverables, client_reports, retainers] = await Promise.all([
        sql`select name, niche, status, package, start_month from clients where id=${clientId}`,
        sql`select id, keyword, current_rank, previous_rank, target_url, checked_at, volume,
                   search_engine, location, platform
            from keywords where client_id=${clientId} order by keyword`,
        sql`select h.id, h.keyword_id, h.rank, h.recorded_at from keyword_history h
            join keywords k on k.id = h.keyword_id
            where k.client_id=${clientId} order by h.recorded_at asc`,
        sql`select id, title, type, status, quantity, due_date, month from deliverables
            where client_id=${clientId} order by due_date, title`,
        sql`select period, summary from client_reports where client_id=${clientId} order by period`,
        sql`select type, quantity from client_retainers where client_id=${clientId}`,
      ]);
      if (!clients.length) {
        noteLoginFail(ip); // orphaned token — treat exactly like an unknown one
        return json({ error: "Not found" }, 404);
      }
      return json({
        client: clients[0],
        keywords, keyword_history, deliverables, client_reports, retainers,
        agency: { name: process.env.AGENCY_NAME || "Growth Atlas" },
      });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  // Every other action requires a valid session token (or the legacy password
  // header). sessionSecret() doubles as the fail-closed configuration guard:
  // it's null only when neither env passwords nor SESSION_SECRET exist.
  if (!sessionSecret()) return json({ error: NOT_CONFIGURED }, 503);
  const auth = authenticate(req);
  if (!auth) return json({ error: "Unauthorized" }, 401);
  const isAdmin = auth.role === "admin";

  // Fail fast with a friendly 503 (not a raw @netlify/neon stack trace) when the
  // database connection string is absent. Provision Netlify DB, or set
  // NETLIFY_DATABASE_URL on the site (scoped to builds, functions, and runtime).
  if (!process.env.NETLIFY_DATABASE_URL) {
    return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);
  }

  // Who did it, for the activity log: the authenticated session's name when we
  // have one (token sessions carry it), else the display name the frontend
  // sends. The authenticated name wins — it can't be spoofed via the payload.
  const actor = (auth.name || String(payload._actor || "")).trim().slice(0, 80);

  try {
    const sql = db();
    await ensureSchema(sql);
    switch (action) {
      case "load": {
        return json(await loadDatasets(sql, Object.keys(DATASET_QUERIES)));
      }

      case "backupExport": {
        // Full-database export for offline safekeeping, admin-only. Ships every
        // business table in full (unlike `load`, which trims history tables).
        // Excluded on purpose: users' password hashes/salts, integration OAuth
        // tokens + state, portal tokens (all secrets), and file_blobs bytes
        // (can be huge; file METADATA is in `resources` — re-upload the files).
        if (!isAdmin) return json({ error: "Only an admin can export a backup." }, 403);
        const names = [
          "clients", "tasks", "payments", "resources", "deliverables",
          "keywords", "keyword_history", "backlinks", "ai_citations",
          "ai_citation_history", "client_reports", "client_retainers",
          "team_members", "client_report_emails", "gsc_daily", "gsc_queries",
          "activities", "activity",
        ];
        const [users, ...rows] = await Promise.all([
          sql`select id, name, email, role, active, created_at from users`,
          sql`select * from clients order by created_at`,
          sql`select * from tasks order by created_at`,
          sql`select * from payments order by created_at`,
          sql`select id, client_id, kind, label, url, blob_key, filename, content_type, size, created_by, created_at from resources order by created_at`,
          sql`select * from deliverables order by created_at`,
          sql`select * from keywords order by created_at`,
          sql`select * from keyword_history order by recorded_at`,
          sql`select * from backlinks order by created_at`,
          sql`select * from ai_citations order by created_at`,
          sql`select * from ai_citation_history order by recorded_at`,
          sql`select * from client_reports order by created_at`,
          sql`select * from client_retainers order by created_at`,
          sql`select * from team_members order by created_at`,
          sql`select * from client_report_emails`,
          sql`select * from gsc_daily order by date`,
          sql`select * from gsc_queries order by month`,
          sql`select * from activities order by created_at`,
          sql`select * from activity order by created_at`,
        ]);
        const tables = Object.fromEntries(names.map((n, i) => [n, rows[i]]));
        tables.users = users;
        return json({ format: "growth-atlas-backup", version: 1, exported_at: new Date().toISOString(), tables });
      }

      case "loadSome": {
        // Per-entity refresh: fetch only the datasets a mutation touched
        // instead of re-reading the whole database after every change.
        const sets = Array.isArray(payload.sets) ? payload.sets : [];
        if (!sets.length) return json({ error: "No datasets requested." }, 400);
        const unknown = sets.find((s) => !Object.hasOwn(DATASET_QUERIES, s));
        if (unknown !== undefined) return json({ error: `Unknown dataset: ${unknown}` }, 400);
        return json(await loadDatasets(sql, sets));
      }

      case "keywordHistory": {
        // Full rank series for one keyword — load only preloads the last 25.
        if (!payload.keyword_id) return json({ error: "Missing keyword id." }, 400);
        const points = await sql`select id, keyword_id, rank, recorded_at from keyword_history
          where keyword_id=${payload.keyword_id} order by recorded_at asc`;
        return json({ points });
      }

      case "gscLoad": {
        // Search Console data for one client, fetched lazily by the detail
        // view (not part of the global load — it's per-client and can be big).
        // daily: the last 90 days; queries: the top queries for one month —
        // payload.month ('YYYY-MM', used by the monthly report) or, by
        // default, the latest month that has rows.
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        const daily = await sql`select date, clicks, impressions, ctr, position from gsc_daily
          where client_id=${payload.client_id} and date >= current_date - 90 order by date`;
        let month = String(payload.month || "").trim();
        if (!month) {
          const latest = await sql`select max(month) as month from gsc_queries where client_id=${payload.client_id}`;
          month = latest[0]?.month || "";
        }
        const queries = month
          ? await sql`select query, clicks, impressions, position from gsc_queries
              where client_id=${payload.client_id} and month=${month}
              order by clicks desc, impressions desc, query`
          : [];
        return json({ daily, queries, month: month || null });
      }

      case "clientSave": {
        const c = payload;
        if (!c.name || !String(c.name).trim()) return json({ error: "Client name is required." }, 400);
        const bad = badEnum("status", c.status, STATUSES)
          || badEnum("source", c.source, SOURCES)
          || badEnum("package", c.package, PACKAGES)
          || badEnum("risk", c.risk, RISKS);
        if (bad) return bad;
        const gscProperty = safeGscProperty(c.gsc_property);
        if (gscProperty === null) {
          return json({ error: 'Search Console property must start with "sc-domain:" or "http" (or be left blank).' }, 400);
        }
        if (c.id) {
          await sql`update clients set
            name=${c.name}, niche=${c.niche || ""}, status=${c.status || "active"},
            source=${c.source || "Direct"}, package=${c.package || "Standard"},
            fee=${Number(c.fee) || 0}, team_member=${c.team_member || ""},
            start_month=${c.start_month || ""}, renewal_month=${c.renewal_month || ""},
            risk=${c.risk || "low"}, notes=${c.notes || ""}, gsc_property=${gscProperty}, email=${c.email || ""}
            where id=${c.id}`;
          await logActivity(sql, { actor, verb: "updated client", entity: "client", entity_label: c.name, client_id: c.id });
        } else {
          const ins = await sql`insert into clients
            (name, niche, status, source, package, fee, team_member, start_month, renewal_month, risk, notes, gsc_property, email, created_by)
            values (${c.name}, ${c.niche || ""}, ${c.status || "active"}, ${c.source || "Direct"},
                    ${c.package || "Standard"}, ${Number(c.fee) || 0}, ${c.team_member || ""},
                    ${c.start_month || ""}, ${c.renewal_month || ""}, ${c.risk || "low"},
                    ${c.notes || ""}, ${gscProperty}, ${c.email || ""}, ${auth.name || c.created_by || ""}) returning id`;
          // A new client with a monthly fee gets a pending payment row for the
          // current month right away, so Revenue reflects money that's owed
          // without waiting for someone to open the Revenue tab.
          const fee = Number(c.fee) || 0;
          if (ins.length && fee > 0) {
            const month = new Date().toISOString().slice(0, 7);
            await sql`insert into payments (client_id, month, amount, status)
              values (${ins[0].id}, ${month}, ${fee}, 'pending')
              on conflict (client_id, month) do nothing`;
          }
          await logActivity(sql, { actor, verb: "created client", entity: "client", entity_label: c.name, client_id: ins[0]?.id });
        }
        return json({ ok: true });
      }

      case "clientDelete": {
        if (!isAdmin) return json({ error: "Only an admin can delete clients." }, 403);
        // Name captured BEFORE the delete — it's all the activity log keeps.
        const named = await sql`select name from clients where id=${payload.id} limit 1`;
        // Remove the client's uploaded file bytes first (resources rows cascade,
        // file_blobs has no FK so it must be cleaned explicitly).
        const files = await sql`select blob_key from resources
          where client_id=${payload.id} and kind='file' and blob_key <> ''`;
        if (files.length) {
          const store = fileStore(sql);
          for (const f of files) { try { await store.delete(f.blob_key); } catch { /* best effort */ } }
        }
        await sql`delete from clients where id=${payload.id}`;
        if (named.length) await logActivity(sql, { actor, verb: "deleted client", entity: "client", entity_label: named[0].name, client_id: payload.id });
        return json({ ok: true });
      }

      case "taskAdd": {
        const t = payload;
        const bad = badEnum("type", t.type, TASK_TYPE_KEYS) || badEnum("status", t.status, TASK_STATE_KEYS);
        if (bad) return bad;
        await sql`insert into tasks (client_id, title, type, assignee, status, due)
          values (${t.client_id}, ${t.title}, ${t.type || "other"}, ${t.assignee || ""},
                  ${t.status || "todo"}, ${t.due || null})`;
        await logActivity(sql, { actor, verb: "added task", entity: "task", entity_label: `"${t.title}"`, client_id: t.client_id });
        return json({ ok: true });
      }

      case "taskMove": {
        const bad = badEnum("status", payload.status, TASK_STATE_KEYS);
        if (bad) return bad;
        const moved = await sql`select title, client_id from tasks where id=${payload.id} limit 1`;
        await sql`update tasks set status=${payload.status} where id=${payload.id}`;
        if (moved.length) await logActivity(sql, { actor, verb: "moved task", entity: "task", entity_label: `"${moved[0].title}"`, client_id: moved[0].client_id, detail: `to ${TASK_STATES.find((s) => s.key === payload.status)?.label || payload.status}` });
        return json({ ok: true });
      }

      case "taskAssign": {
        await sql`update tasks set assignee=${payload.assignee || ""} where id=${payload.id}`;
        return json({ ok: true });
      }

      case "taskDelete": {
        const gone = await sql`select title, client_id from tasks where id=${payload.id} limit 1`;
        await sql`delete from tasks where id=${payload.id}`;
        if (gone.length) await logActivity(sql, { actor, verb: "deleted task", entity: "task", entity_label: `"${gone[0].title}"`, client_id: gone[0].client_id });
        return json({ ok: true });
      }

      case "paymentSet": {
        const p = payload;
        const bad = badEnum("status", p.status, PAY_STATE_KEYS);
        if (bad) return bad;
        const paidDate = p.status === "paid" ? new Date().toISOString().slice(0, 10) : null;
        await sql`insert into payments (client_id, month, amount, status, paid_date)
          values (${p.client_id}, ${p.month}, ${Number(p.amount) || 0}, ${p.status}, ${paidDate})
          on conflict (client_id, month) do update set
            amount=excluded.amount, status=excluded.status, paid_date=excluded.paid_date`;
        const payee = await sql`select name from clients where id=${p.client_id} limit 1`;
        await logActivity(sql, { actor, verb: "marked payment", entity: "payment", entity_label: `${payee[0]?.name || "client"} ${p.month}`, client_id: p.client_id, detail: p.status });
        return json({ ok: true });
      }

      case "paymentLinkCreate": {
        // Create (or return) a Stripe Payment Link for one client + month.
        // Optional feature: without the key the UI hides the buttons and this
        // answers with a friendly 503 instead of a broken Stripe call.
        if (!process.env.STRIPE_SECRET_KEY) {
          return json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." }, 503);
        }
        const { client_id, month } = payload;
        if (!client_id || !month) return json({ error: "Missing client or month." }, 400);
        const found = await sql`select name, fee from clients where id=${client_id} limit 1`;
        if (!found.length) return json({ error: "Client not found." }, 404);
        const fee = Number(found[0].fee) || 0;
        if (fee <= 0) return json({ error: "Set the client's monthly fee first — the link charges that amount." }, 400);
        // Make sure the payment row exists (same upsert as paymentSet), but
        // never clobber an existing row's amount/status here.
        await sql`insert into payments (client_id, month, amount, status)
          values (${client_id}, ${month}, ${fee}, 'pending')
          on conflict (client_id, month) do nothing`;
        // Idempotent: one link per client+month — reuse it on repeat clicks.
        const existing = await sql`select stripe_link_url from payments
          where client_id=${client_id} and month=${month} limit 1`;
        if (existing[0]?.stripe_link_url) return json({ url: existing[0].stripe_link_url });
        // Price (with an inline product) first, then the link itself. The
        // metadata on the LINK is copied onto each Checkout Session it opens —
        // that's what the webhook reads to find this payments row.
        const currency = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
        const price = await stripePost("/v1/prices", {
          unit_amount: String(Math.round(fee * 100)),
          currency,
          "product_data[name]": `${found[0].name} — SEO retainer ${month}`,
        });
        const link = await stripePost("/v1/payment_links", {
          "line_items[0][price]": price.id,
          "line_items[0][quantity]": "1",
          "metadata[client_id]": String(client_id),
          "metadata[month]": month,
          "payment_intent_data[metadata][client_id]": String(client_id),
          "payment_intent_data[metadata][month]": month,
        });
        await sql`update payments set stripe_link_url=${link.url}, stripe_link_id=${link.id}
          where client_id=${client_id} and month=${month}`;
        return json({ url: link.url });
      }

      case "resourceLinkAdd": {
        const r = payload;
        if (!r.client_id) return json({ error: "Missing client." }, 400);
        if (!r.url || !r.url.trim()) return json({ error: "A link URL is required." }, 400);
        const linkUrl = safeHttpUrl(r.url);
        if (!linkUrl) return json({ error: "Links must be http(s) URLs." }, 400);
        await sql`insert into resources (client_id, kind, label, url, created_by)
          values (${r.client_id}, 'link', ${r.label || ""}, ${linkUrl}, ${auth.name || r.created_by || ""})`;
        await logActivity(sql, { actor, verb: "added link", entity: "resource", entity_label: r.label || linkUrl, client_id: r.client_id });
        return json({ ok: true });
      }

      case "resourceFileAdd": {
        const r = payload;
        if (!r.client_id) return json({ error: "Missing client." }, 400);
        const b64 = r.dataBase64 || "";
        if (!b64) return json({ error: "No file data." }, 400);
        const buffer = Buffer.from(b64, "base64");
        if (!buffer.length) return json({ error: "Empty file." }, 400);
        if (buffer.length > MAX_FILE_BYTES) return json({ error: "File too large (max 4 MB)." }, 413);
        const key = crypto.randomUUID();
        await fileStore(sql).set(key, buffer);
        await sql`insert into resources
          (client_id, kind, label, blob_key, filename, content_type, size, created_by)
          values (${r.client_id}, 'file', ${r.label || r.filename || "File"}, ${key},
                  ${r.filename || "file"}, ${r.content_type || "application/octet-stream"},
                  ${buffer.length}, ${auth.name || r.created_by || ""})`;
        await logActivity(sql, { actor, verb: "uploaded file", entity: "resource", entity_label: r.label || r.filename || "File", client_id: r.client_id });
        return json({ ok: true });
      }

      case "resourceDelete": {
        const rows = await sql`select kind, blob_key, label, client_id from resources where id=${payload.id} limit 1`;
        if (rows.length && rows[0].kind === "file" && rows[0].blob_key) {
          try { await fileStore(sql).delete(rows[0].blob_key); } catch { /* best effort */ }
        }
        await sql`delete from resources where id=${payload.id}`;
        if (rows.length) await logActivity(sql, { actor, verb: "deleted resource", entity: "resource", entity_label: rows[0].label, client_id: rows[0].client_id });
        return json({ ok: true });
      }

      case "deliverableCreate": {
        const d = payload;
        if (!d.client_id) return json({ error: "Pick a client for the deliverable." }, 400);
        const bad = badEnum("type", d.type, TASK_TYPE_KEYS) || badEnum("status", d.status, DELIVERABLE_STATE_KEYS);
        if (bad) return bad;
        // Fall back to the due-date month, then the current month, so every
        // deliverable is attributable to a month for scope matching.
        const month = d.month || (d.due_date ? String(d.due_date).slice(0, 7) : new Date().toISOString().slice(0, 7));
        await sql`insert into deliverables (client_id, title, type, status, quantity, due_date, notes, month)
          values (${d.client_id}, ${d.title || ""}, ${d.type || "other"}, ${d.status || "planned"},
                  ${Number(d.quantity) || 1}, ${d.due_date || null}, ${d.notes || ""}, ${month})`;
        await logActivity(sql, { actor, verb: "created deliverable", entity: "deliverable", entity_label: d.title || typeLabel(d.type), client_id: d.client_id });
        return json({ ok: true });
      }

      case "deliverableUpdate": {
        const d = payload;
        if (!d.id) return json({ error: "Missing deliverable id." }, 400);
        const bad = badEnum("type", d.type, TASK_TYPE_KEYS) || badEnum("status", d.status, DELIVERABLE_STATE_KEYS);
        if (bad) return bad;
        const month = d.month || (d.due_date ? String(d.due_date).slice(0, 7) : "");
        await sql`update deliverables set
          title=${d.title || ""}, type=${d.type || "other"}, status=${d.status || "planned"},
          quantity=${Number(d.quantity) || 1}, due_date=${d.due_date || null}, notes=${d.notes || ""},
          month=${month}
          where id=${d.id}`;
        await logActivity(sql, { actor, verb: "updated deliverable", entity: "deliverable", entity_label: d.title || typeLabel(d.type), client_id: d.client_id });
        return json({ ok: true });
      }

      case "deliverableDelete": {
        // Not admin-gated — only client deletion is.
        const del = await sql`select title, type, client_id from deliverables where id=${payload.id} limit 1`;
        await sql`delete from deliverables where id=${payload.id}`;
        if (del.length) await logActivity(sql, { actor, verb: "deleted deliverable", entity: "deliverable", entity_label: del[0].title || typeLabel(del[0].type), client_id: del[0].client_id });
        return json({ ok: true });
      }

      case "deliverablesGenerateMonth": {
        // Recurring monthly deliverables: for each retainer line, top up the
        // month to the agreed quantity with 'planned' items due on its last
        // day. Idempotent — anything already due in the month (generated or
        // hand-made) counts toward the quota, so re-running only creates the
        // shortfall. Either one client (client_id) or every active client
        // that has retainer lines (all: true).
        const month = String(payload.month || "").trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: "Month must look like 2026-07." }, 400);
        const lines = payload.client_id
          ? await sql`select client_id, type, quantity from client_retainers where client_id=${payload.client_id}`
          : payload.all
            ? await sql`select r.client_id, r.type, r.quantity from client_retainers r
                join clients c on c.id = r.client_id where c.status = 'active'`
            : null;
        if (!lines) return json({ error: "Missing client (or pass all: true)." }, 400);
        const due = lastDayOfMonth(month);
        let created = 0;
        for (const line of lines) {
          const included = Number(line.quantity) || 0;
          if (included <= 0) continue;
          // Month attribution matches scope.js's deliverableMonth(): the
          // explicit month column, falling back to the due-date's month.
          const [{ n }] = await sql`select count(*)::int as n from deliverables
            where client_id=${line.client_id} and type=${line.type}
              and coalesce(nullif(month, ''), to_char(due_date, 'YYYY-MM')) = ${month}`;
          for (let i = n; i < included; i++) {
            await sql`insert into deliverables (client_id, title, type, status, quantity, due_date, month)
              values (${line.client_id}, ${`${typeLabel(line.type)} ${i + 1}/${included} — ${month}`},
                      ${line.type}, 'planned', 1, ${due}, ${month})`;
            created += 1;
          }
        }
        if (created > 0) {
          await logActivity(sql, {
            actor, verb: "generated", entity: "deliverables",
            entity_label: `${created} deliverable${created === 1 ? "" : "s"} for ${month}`,
            client_id: payload.client_id || null, detail: "from retainer scope",
          });
        }
        return json({ ok: true, created });
      }

      case "backlinkCreate": {
        const b = payload;
        if (!b.client_id) return json({ error: "Pick a client for the backlink." }, 400);
        const bad = badEnum("status", b.status, BACKLINK_STATE_KEYS);
        if (bad) return bad;
        const linkUrl = safeHttpUrl(b.url);
        if (linkUrl === null) return json({ error: "Backlink URL must be an http(s) URL." }, 400);
        const targetUrl = safeHttpUrl(b.target_url);
        if (targetUrl === null) return json({ error: "Target URL must be an http(s) URL (or blank)." }, 400);
        const dr = toDomainRating(b.domain_rating);
        if (dr === undefined) return json({ error: "Domain rating must be between 0 and 100 (or blank)." }, 400);
        await sql`insert into backlinks
          (client_id, url, target_url, anchor_text, domain_rating, status, cost, notes, placed_date, created_by)
          values (${b.client_id}, ${linkUrl}, ${targetUrl}, ${b.anchor_text || ""}, ${dr},
                  ${b.status || "live"}, ${Number(b.cost) || 0}, ${b.notes || ""},
                  ${b.placed_date || null}, ${auth.name || b.created_by || ""})`;
        await logActivity(sql, { actor, verb: "added backlink", entity: "backlink", entity_label: linkUrl || b.anchor_text || "", client_id: b.client_id });
        return json({ ok: true });
      }

      case "backlinkUpdate": {
        const b = payload;
        if (!b.id) return json({ error: "Missing backlink id." }, 400);
        const bad = badEnum("status", b.status, BACKLINK_STATE_KEYS);
        if (bad) return bad;
        const linkUrl = safeHttpUrl(b.url);
        if (linkUrl === null) return json({ error: "Backlink URL must be an http(s) URL." }, 400);
        const targetUrl = safeHttpUrl(b.target_url);
        if (targetUrl === null) return json({ error: "Target URL must be an http(s) URL (or blank)." }, 400);
        const dr = toDomainRating(b.domain_rating);
        if (dr === undefined) return json({ error: "Domain rating must be between 0 and 100 (or blank)." }, 400);
        await sql`update backlinks set
          url=${linkUrl}, target_url=${targetUrl}, anchor_text=${b.anchor_text || ""},
          domain_rating=${dr}, status=${b.status || "live"}, cost=${Number(b.cost) || 0},
          notes=${b.notes || ""}, placed_date=${b.placed_date || null}
          where id=${b.id}`;
        await logActivity(sql, { actor, verb: "updated backlink", entity: "backlink", entity_label: linkUrl || b.anchor_text || "", client_id: b.client_id });
        return json({ ok: true });
      }

      case "backlinkDelete": {
        // Not admin-gated — only client deletion is.
        const blGone = await sql`select url, anchor_text, client_id from backlinks where id=${payload.id} limit 1`;
        await sql`delete from backlinks where id=${payload.id}`;
        if (blGone.length) await logActivity(sql, { actor, verb: "deleted backlink", entity: "backlink", entity_label: blGone[0].url || blGone[0].anchor_text || "", client_id: blGone[0].client_id });
        return json({ ok: true });
      }

      case "keywordCreate": {
        const k = payload;
        if (!k.client_id) return json({ error: "Pick a client for the keyword." }, 400);
        const bad = badEnum("platform", k.platform, KEYWORD_PLATFORMS);
        if (bad) return bad;
        const cur = toRank(k.current_rank);
        const checkedAt = cur == null ? null : new Date().toISOString();
        const targetUrl = safeHttpUrl(k.target_url);
        if (targetUrl === null) return json({ error: "Target URL must be an http(s) URL." }, 400);
        const created = await sql`insert into keywords
          (client_id, keyword, current_rank, previous_rank, target_url, checked_at, notes,
           search_engine, location, platform, volume, starred, auto_track)
          values (${k.client_id}, ${k.keyword || ""}, ${cur}, ${null}, ${targetUrl}, ${checkedAt}, ${k.notes || ""},
                  ${k.search_engine || "www.google.com"}, ${k.location || ""}, ${k.platform || "desktop"},
                  ${toRank(k.volume)}, ${Boolean(k.starred)}, ${Boolean(k.auto_track)})
          returning id`;
        // Record the first rank point so the history chart has a starting value.
        if (cur != null && created.length) {
          await sql`insert into keyword_history (keyword_id, rank) values (${created[0].id}, ${cur})`;
        }
        await logActivity(sql, { actor, verb: "added keyword", entity: "keyword", entity_label: k.keyword || "", client_id: k.client_id });
        return json({ ok: true });
      }

      case "keywordUpdate": {
        const k = payload;
        if (!k.id) return json({ error: "Missing keyword id." }, 400);
        const bad = badEnum("platform", k.platform, KEYWORD_PLATFORMS);
        if (bad) return bad;
        const rows = await sql`select current_rank, previous_rank, checked_at from keywords where id=${k.id} limit 1`;
        if (!rows.length) return json({ error: "Keyword not found." }, 404);
        const existing = rows[0];
        const cur = toRank(k.current_rank);
        // Roll the old current_rank into previous_rank only when the rank actually
        // changes, so movement stays meaningful across plain metadata edits.
        const rankChanged = (cur ?? null) !== (existing.current_rank ?? null);
        const previous_rank = rankChanged ? existing.current_rank : existing.previous_rank;
        const checked_at = rankChanged ? new Date().toISOString() : existing.checked_at;
        const targetUrl = safeHttpUrl(k.target_url);
        if (targetUrl === null) return json({ error: "Target URL must be an http(s) URL." }, 400);
        await sql`update keywords set
          keyword=${k.keyword || ""}, current_rank=${cur}, previous_rank=${previous_rank ?? null},
          target_url=${targetUrl}, checked_at=${checked_at ?? null}, notes=${k.notes || ""},
          search_engine=${k.search_engine || "www.google.com"}, location=${k.location || ""},
          platform=${k.platform || "desktop"}, volume=${toRank(k.volume)},
          starred=${Boolean(k.starred)}, auto_track=${Boolean(k.auto_track)}
          where id=${k.id}`;
        // Append a history point whenever the rank actually changes to a real value.
        if (rankChanged && cur != null) {
          await sql`insert into keyword_history (keyword_id, rank) values (${k.id}, ${cur})`;
        }
        await logActivity(sql, { actor, verb: "updated keyword", entity: "keyword", entity_label: k.keyword || "", client_id: k.client_id });
        return json({ ok: true });
      }

      case "keywordsBulkAdd": {
        // Serpfox-style bulk add: one textarea line per keyword, all sharing the
        // same client / target URL / engine / location / platform. No rank yet —
        // ranks arrive via manual edits or the scheduled auto-check.
        const p = payload;
        if (!p.client_id) return json({ error: "Pick a client for the keywords." }, 400);
        const bad = badEnum("platform", p.platform, KEYWORD_PLATFORMS);
        if (bad) return bad;
        const targetUrl = safeHttpUrl(p.target_url);
        if (targetUrl === null) return json({ error: "Target URL must be an http(s) URL." }, 400);
        const seen = new Set();
        const list = [];
        for (const raw of Array.isArray(p.keywords) ? p.keywords : []) {
          const kw = String(raw || "").trim();
          if (!kw) continue;                          // drop empty lines
          const key = kw.toLowerCase();
          if (seen.has(key)) continue;                // dedupe within the batch
          seen.add(key);
          list.push(kw);
          if (list.length >= 200) break;              // cap per call
        }
        if (!list.length) return json({ error: "Enter at least one keyword." }, 400);
        // One statement for the whole batch — unnest turns the array into rows.
        await sql`insert into keywords (client_id, keyword, target_url, search_engine, location, platform)
          select ${p.client_id}, kw, ${targetUrl}, ${p.search_engine || "www.google.com"},
                 ${p.location || ""}, ${p.platform || "desktop"}
          from unnest(${list}::text[]) as kw`;
        await logActivity(sql, { actor, verb: "added", entity: "keywords", entity_label: `${list.length} keyword${list.length === 1 ? "" : "s"}`, client_id: p.client_id });
        return json({ ok: true, added: list.length });
      }

      case "keywordsBulkDelete": {
        // Not admin-gated — only client deletion is. History rows cascade.
        const ids = (Array.isArray(payload.ids) ? payload.ids : []).slice(0, 500);
        if (!ids.length) return json({ error: "No keywords selected." }, 400);
        const removed = await sql`delete from keywords where id = any(${ids}::uuid[]) returning client_id`;
        if (removed.length) await logActivity(sql, { actor, verb: "deleted", entity: "keywords", entity_label: `${removed.length} keyword${removed.length === 1 ? "" : "s"}`, client_id: removed[0].client_id });
        return json({ ok: true });
      }

      case "keywordStar": {
        if (!payload.id) return json({ error: "Missing keyword id." }, 400);
        await sql`update keywords set starred=${Boolean(payload.starred)} where id=${payload.id}`;
        return json({ ok: true });
      }

      case "keywordDelete": {
        // Not admin-gated — only client deletion is.
        const kwGone = await sql`select keyword, client_id from keywords where id=${payload.id} limit 1`;
        await sql`delete from keywords where id=${payload.id}`;
        if (kwGone.length) await logActivity(sql, { actor, verb: "deleted keyword", entity: "keyword", entity_label: kwGone[0].keyword, client_id: kwGone[0].client_id });
        return json({ ok: true });
      }

      case "aiCitationCreate": {
        const c = payload;
        if (!c.client_id) return json({ error: "Pick a client for the prompt." }, 400);
        const bad = badEnum("engine", c.engine, AI_ENGINE_KEYS);
        if (bad) return bad;
        const citedUrl = safeHttpUrl(c.url);
        if (citedUrl === null) return json({ error: "Cited URL must be an http(s) URL (or blank)." }, 400);
        const cited = toCited(c.cited);
        const position = toRank(c.position);
        // Stamp checked_at only when a result was actually recorded.
        const checkedAt = cited == null ? null : new Date().toISOString();
        const created = await sql`insert into ai_citations
          (client_id, prompt, engine, cited, position, url, checked_at, notes)
          values (${c.client_id}, ${c.prompt || ""}, ${c.engine || "chatgpt"}, ${cited},
                  ${position}, ${citedUrl}, ${checkedAt}, ${c.notes || ""})
          returning id`;
        // Record the first check so the history has a starting point.
        if (cited != null && created.length) {
          await sql`insert into ai_citation_history (citation_id, cited, position) values (${created[0].id}, ${cited}, ${position})`;
        }
        await logActivity(sql, { actor, verb: "added AI prompt", entity: "ai_citation", entity_label: `"${c.prompt || ""}"`, client_id: c.client_id });
        return json({ ok: true });
      }

      case "aiCitationUpdate": {
        const c = payload;
        if (!c.id) return json({ error: "Missing prompt id." }, 400);
        const bad = badEnum("engine", c.engine, AI_ENGINE_KEYS);
        if (bad) return bad;
        const citedUrl = safeHttpUrl(c.url);
        if (citedUrl === null) return json({ error: "Cited URL must be an http(s) URL (or blank)." }, 400);
        const rows = await sql`select cited, position, checked_at from ai_citations where id=${c.id} limit 1`;
        if (!rows.length) return json({ error: "Prompt not found." }, 404);
        const existing = rows[0];
        const cited = toCited(c.cited);
        const position = toRank(c.position);
        // Same semantics as keyword ranks: only a real change to the check
        // result re-stamps checked_at and appends a history point.
        const changed = (cited ?? null) !== (existing.cited ?? null)
          || (position ?? null) !== (existing.position ?? null);
        const checked_at = changed ? new Date().toISOString() : existing.checked_at;
        await sql`update ai_citations set
          prompt=${c.prompt || ""}, engine=${c.engine || "chatgpt"}, cited=${cited},
          position=${position}, url=${citedUrl}, checked_at=${checked_at ?? null}, notes=${c.notes || ""}
          where id=${c.id}`;
        if (changed && cited != null) {
          await sql`insert into ai_citation_history (citation_id, cited, position) values (${c.id}, ${cited}, ${position})`;
        }
        await logActivity(sql, { actor, verb: "updated AI prompt", entity: "ai_citation", entity_label: `"${c.prompt || ""}"`, client_id: c.client_id });
        return json({ ok: true });
      }

      case "aiCitationDelete": {
        // Not admin-gated — only client deletion is. History rows cascade.
        const aiGone = await sql`select prompt, client_id from ai_citations where id=${payload.id} limit 1`;
        await sql`delete from ai_citations where id=${payload.id}`;
        if (aiGone.length) await logActivity(sql, { actor, verb: "deleted AI prompt", entity: "ai_citation", entity_label: `"${aiGone[0].prompt}"`, client_id: aiGone[0].client_id });
        return json({ ok: true });
      }

      case "reportSave": {
        // Upsert the monthly narrative for a client. Not admin-gated.
        const r = payload;
        if (!r.client_id || !r.period) return json({ error: "Missing client or month." }, 400);
        await sql`insert into client_reports (client_id, period, summary)
          values (${r.client_id}, ${r.period}, ${r.summary || ""})
          on conflict (client_id, period) do update set
            summary=excluded.summary, updated_at=now()`;
        await logActivity(sql, { actor, verb: "saved", entity: "report", entity_label: `${r.period} report`, client_id: r.client_id });
        return json({ ok: true });
      }

      case "reportDelete": {
        // Not admin-gated — only client deletion is.
        await sql`delete from client_reports where id=${payload.id}`;
        return json({ ok: true });
      }

      case "retainerSave": {
        // Upsert the agreed monthly quantity for a client + deliverable type.
        const r = payload;
        if (!r.client_id || !r.type) return json({ error: "Missing client or type." }, 400);
        await sql`insert into client_retainers (client_id, type, quantity)
          values (${r.client_id}, ${r.type}, ${Number(r.quantity) || 0})
          on conflict (client_id, type) do update set quantity=excluded.quantity`;
        await logActivity(sql, { actor, verb: "updated retainer", entity: "retainer", entity_label: typeLabel(r.type), client_id: r.client_id });
        return json({ ok: true });
      }

      case "retainerDelete": {
        // Not admin-gated — only client deletion is.
        await sql`delete from client_retainers where id=${payload.id}`;
        return json({ ok: true });
      }

      case "teamAdd": {
        const m = payload;
        if (!m.name || !m.name.trim()) return json({ error: "A team member name is required." }, 400);
        await sql`insert into team_members (name, role, email)
          values (${m.name.trim()}, ${m.role || ""}, ${m.email || ""})`;
        await logActivity(sql, { actor, verb: "added team member", entity: "team_member", entity_label: m.name.trim() });
        return json({ ok: true });
      }

      case "teamUpdate": {
        const m = payload;
        if (!m.id) return json({ error: "Missing team member id." }, 400);
        if (!m.name || !m.name.trim()) return json({ error: "A team member name is required." }, 400);
        await sql`update team_members set
          name=${m.name.trim()}, role=${m.role || ""}, email=${m.email || ""}
          where id=${m.id}`;
        await logActivity(sql, { actor, verb: "updated team member", entity: "team_member", entity_label: m.name.trim() });
        return json({ ok: true });
      }

      case "teamDelete": {
        // Not admin-gated — only client deletion is. Removing a member from the
        // roster does NOT unassign anyone: clients/tasks keep the stored name.
        const mGone = await sql`delete from team_members where id=${payload.id} returning name`;
        if (mGone.length) await logActivity(sql, { actor, verb: "removed team member", entity: "team_member", entity_label: mGone[0].name });
        return json({ ok: true });
      }

      /* -------- activity log (client interaction timeline) -------- */
      // The `activities` touchpoint timeline — NOT the `activity` audit trail,
      // which is written by logActivity and is never mutated directly.

      case "activityAdd": {
        // Log a client touchpoint (note / call / email / meeting). happened_at
        // defaults to now, but the UI may pass an explicit date/time.
        const a = payload;
        if (!a.client_id) return json({ error: "Missing client." }, 400);
        if (!a.body || !a.body.trim()) return json({ error: "Write something to log." }, 400);
        const bad = badEnum("type", a.type, ACTIVITY_TYPE_KEYS);
        if (bad) return bad;
        const type = a.type || "note";
        const happenedAt = a.happened_at ? new Date(a.happened_at) : new Date();
        if (Number.isNaN(happenedAt.getTime())) return json({ error: "Invalid date/time." }, 400);
        const followUp = a.follow_up_date ? String(a.follow_up_date).slice(0, 10) : null;
        await sql`insert into activities (client_id, type, body, author, happened_at, follow_up_date)
          values (${a.client_id}, ${type}, ${a.body.trim()}, ${a.author || actor || ""}, ${happenedAt.toISOString()}, ${followUp})`;
        await logActivity(sql, { actor, verb: "logged", entity: "activity", entity_label: `a ${activityLabel(type).toLowerCase()}`, client_id: a.client_id });
        return json({ ok: true });
      }

      case "activityFollowupSet": {
        // Set or clear (null) the follow-up reminder on an existing activity.
        const a = payload;
        if (!a.id) return json({ error: "Missing activity id." }, 400);
        const followUp = a.follow_up_date ? String(a.follow_up_date).slice(0, 10) : null;
        const rows = await sql`update activities set follow_up_date=${followUp}
          where id=${a.id} returning type, client_id`;
        if (rows.length) await logActivity(sql, { actor, verb: followUp ? "set a follow-up on" : "completed a follow-up on", entity: "activity", entity_label: `a ${activityLabel(rows[0].type).toLowerCase()}`, client_id: rows[0].client_id });
        return json({ ok: true });
      }

      case "activityDelete": {
        // Not admin-gated — only client deletion is.
        const gone = await sql`delete from activities where id=${payload.id} returning type, client_id`;
        if (gone.length) await logActivity(sql, { actor, verb: "removed", entity: "activity", entity_label: `a logged ${activityLabel(gone[0].type).toLowerCase()}`, client_id: gone[0].client_id });
        return json({ ok: true });
      }

      case "portalTokenGet": {
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        const rows = await sql`select token, enabled from client_portal_tokens
          where client_id=${payload.client_id} limit 1`;
        if (!rows.length) return json({ token: null });
        return json({ token: rows[0].token, enabled: rows[0].enabled });
      }

      case "portalTokenCreate": {
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        const [info] = await sql`select (select name from clients where id=${payload.client_id}) as name,
          exists(select 1 from client_portal_tokens where client_id=${payload.client_id}) as had`;
        // 64 hex chars of crypto randomness. Regenerating replaces the old
        // token — any previously shared link stops working — and re-enables
        // the portal (creating a fresh link implies you want it live).
        const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
        await sql`insert into client_portal_tokens (client_id, token)
          values (${payload.client_id}, ${token})
          on conflict (client_id) do update set
            token=excluded.token, enabled=true, created_at=now()`;
        await logActivity(sql, { actor, verb: info?.had ? "regenerated portal link for" : "created portal link for", entity: "portal", entity_label: info?.name || "", client_id: payload.client_id });
        return json({ token });
      }

      case "portalTokenSetEnabled": {
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        await sql`update client_portal_tokens set enabled=${Boolean(payload.enabled)}
          where client_id=${payload.client_id}`;
        const pc = await sql`select name from clients where id=${payload.client_id} limit 1`;
        await logActivity(sql, { actor, verb: `${payload.enabled ? "enabled" : "disabled"} portal link for`, entity: "portal", entity_label: pc[0]?.name || "", client_id: payload.client_id });
        return json({ ok: true });
      }

      /* -------- per-user accounts (admin-only management) -------- */
      // None of these ever select password_hash / password_salt: hashes must
      // never reach the client, even for admins.

      case "userList": {
        if (!isAdmin) return json({ error: "Only an admin can manage user accounts." }, 403);
        const users = await sql`select id, name, email, role, active, created_at
          from users order by created_at`;
        return json({ users });
      }

      case "userSave": {
        if (!isAdmin) return json({ error: "Only an admin can manage user accounts." }, 403);
        const u = payload;
        const name = String(u.name || "").trim().slice(0, 80);
        const email = String(u.email || "").trim().toLowerCase();
        const userRole = u.role || "member";
        if (!name) return json({ error: "The user's name is required." }, 400);
        if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address." }, 400);
        const bad = badEnum("role", userRole, USER_ROLES);
        if (bad) return bad;
        const active = u.active === undefined ? true : Boolean(u.active);
        const password = String(u.password || "");
        if (password && password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
        // Friendly duplicate check instead of a raw unique-violation error.
        const clash = await sql`select 1 from users
          where email=${email} and id is distinct from ${u.id || null}::uuid limit 1`;
        if (clash.length) return json({ error: "That email is already in use." }, 400);
        if (u.id) {
          // Update; an empty password means "leave the password unchanged".
          const found = await sql`select 1 from users where id=${u.id} limit 1`;
          if (!found.length) return json({ error: "User not found." }, 404);
          if (password) {
            const { salt, hash } = newPasswordRecord(password);
            await sql`update users set name=${name}, email=${email}, role=${userRole},
              active=${active}, password_hash=${hash}, password_salt=${salt} where id=${u.id}`;
          } else {
            await sql`update users set name=${name}, email=${email}, role=${userRole},
              active=${active} where id=${u.id}`;
          }
          await logActivity(sql, { actor, verb: "updated user account", entity: "user", entity_label: `${name} (${email})` });
        } else {
          if (!password) return json({ error: "A password is required for a new user." }, 400);
          const { salt, hash } = newPasswordRecord(password);
          await sql`insert into users (name, email, password_hash, password_salt, role, active)
            values (${name}, ${email}, ${hash}, ${salt}, ${userRole}, ${active})`;
          await logActivity(sql, { actor, verb: "created user account", entity: "user", entity_label: `${name} (${email})` });
        }
        return json({ ok: true });
      }

      case "userDelete": {
        if (!isAdmin) return json({ error: "Only an admin can manage user accounts." }, 403);
        if (!payload.id) return json({ error: "Missing user id." }, 400);
        const gone = await sql`delete from users where id=${payload.id} returning name, email`;
        if (gone.length) await logActivity(sql, { actor, verb: "deleted user account", entity: "user", entity_label: `${gone[0].name} (${gone[0].email})` });
        return json({ ok: true });
      }

      case "reportEmailGet": {
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        const rows = await sql`select recipient, enabled from client_report_emails
          where client_id=${payload.client_id} limit 1`;
        if (!rows.length) return json({ recipient: null });
        return json({ recipient: rows[0].recipient, enabled: rows[0].enabled });
      }

      case "reportEmailSet": {
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        const recipient = String(payload.recipient || "").trim();
        const enabled = Boolean(payload.enabled);
        if (!recipient) {
          // Clearing the address while disabled removes the row entirely.
          if (enabled) return json({ error: "Enter a recipient email first." }, 400);
          await sql`delete from client_report_emails where client_id=${payload.client_id}`;
          return json({ ok: true });
        }
        if (!recipient.includes("@")) return json({ error: "That doesn't look like an email address." }, 400);
        await sql`insert into client_report_emails (client_id, recipient, enabled)
          values (${payload.client_id}, ${recipient}, ${enabled})
          on conflict (client_id) do update set
            recipient=excluded.recipient, enabled=excluded.enabled`;
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
};

// Route this function at /api/data (Netlify Functions v2 routing).
export const config = { path: "/api/data" };

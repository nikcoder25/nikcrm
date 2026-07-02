import { timingSafeEqual } from "node:crypto";
import { neon } from "@netlify/neon";
import { getStore } from "@netlify/blobs";
import { STATUSES, SOURCES, PACKAGES, RISKS, TASK_TYPES, TASK_STATES, PAY_STATES, DELIVERABLE_STATES, typeLabel } from "../../src/lib/constants.js";

// Uploaded client files live in a Netlify Blobs store (auto-available to
// functions — no setup). The DB "resources" table holds the metadata + blob key.
const FILES_STORE = "client-files";
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
  // Postgres does NOT auto-index foreign-key columns. Without these, every
  // per-client lookup and every ON DELETE CASCADE does a full table scan,
  // which degrades linearly as the client count grows. Idempotent, so they
  // cost nothing after the first run. (payments, client_reports and
  // client_retainers are covered by unique constraints leading with client_id.)
  await Promise.all([
    sql`create index if not exists idx_tasks_client on tasks (client_id)`,
    sql`create index if not exists idx_resources_client on resources (client_id)`,
    sql`create index if not exists idx_resources_blob_key on resources (blob_key)`,
    sql`create index if not exists idx_deliverables_client on deliverables (client_id)`,
    sql`create index if not exists idx_keywords_client on keywords (client_id)`,
    sql`create index if not exists idx_keyword_history_kw on keyword_history (keyword_id)`,
    sql`create index if not exists idx_keyword_history_time on keyword_history (recorded_at)`,
    sql`create index if not exists idx_activity_time on activity (created_at desc)`,
  ]);
  schemaReady = true;
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
const KEYWORD_PLATFORMS = ["desktop", "mobile"];
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

// Rank is a positive integer or null (unranked). Coerce loosely from the UI.
function toRank(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Auth model: a shared team password gates everything. An optional separate
// admin password unlocks destructive actions (deleting clients).
//
// If NO password is configured we FAIL CLOSED: the API refuses every request
// with a clear operator message. A misconfigured deploy (forgotten or mistyped
// APP_PASSWORD) must never silently expose the whole database to the public.
// For local dev, set APP_PASSWORD in .env (see .env.example).
function authConfigured() {
  return Boolean(process.env.APP_PASSWORD || process.env.ADMIN_PASSWORD);
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
    if (!authConfigured()) return json({ error: NOT_CONFIGURED }, 503);
    if (!resolveRole(req.headers.get("x-app-password") || "")) return json({ error: "Unauthorized" }, 401);
    if (!process.env.NETLIFY_DATABASE_URL) return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);
    const key = new URL(req.url).searchParams.get("key") || "";
    if (!key) return json({ error: "Missing file key" }, 400);
    try {
      const sql = db();
      await ensureSchema(sql);
      const rows = await sql`select filename, content_type from resources where blob_key=${key} and kind='file' limit 1`;
      if (!rows.length) return json({ error: "File not found" }, 404);
      const data = await getStore(FILES_STORE).get(key, { type: "arrayBuffer" });
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

  // Login: validate the password and hand back the role for the UI.
  if (action === "login") {
    if (!authConfigured()) return json({ error: NOT_CONFIGURED }, 503);
    const ip = clientIp(req);
    if (loginBlocked(ip)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    const role = resolveRole(payload.password || "");
    if (!role) {
      noteLoginFail(ip);
      return json({ error: "Wrong password. Ask your team lead for it." }, 401);
    }
    return json({ ok: true, role });
  }

  // Read-only client portal. The token in the URL is the whole credential, so
  // this runs BEFORE the team-password check (like "login") — but still behind
  // the fail-closed auth/DB configuration guards, and throttled with the same
  // per-IP counter as login so tokens can't be guessed by brute force. Unknown
  // and disabled tokens both return the same 404 on purpose.
  if (action === "portalLoad") {
    if (!authConfigured()) return json({ error: NOT_CONFIGURED }, 503);
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
        sql`select id, title, type, status, quantity, due_date from deliverables
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

  // Every other action requires a valid password in the header.
  if (!authConfigured()) return json({ error: NOT_CONFIGURED }, 503);
  const pw = req.headers.get("x-app-password") || "";
  const role = resolveRole(pw);
  if (!role) return json({ error: "Unauthorized" }, 401);
  const isAdmin = role === "admin";

  // Fail fast with a friendly 503 (not a raw @netlify/neon stack trace) when the
  // database connection string is absent. Provision Netlify DB, or set
  // NETLIFY_DATABASE_URL on the site (scoped to builds, functions, and runtime).
  if (!process.env.NETLIFY_DATABASE_URL) {
    return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);
  }

  // Who did it, for the activity log. Sent by the frontend on every call.
  const actor = String(payload._actor || "").trim().slice(0, 80);

  try {
    const sql = db();
    await ensureSchema(sql);
    switch (action) {
      case "load": {
        const [clients, tasks, payments, resources, deliverables, keywords, keyword_history, client_reports, client_retainers, activity] = await Promise.all([
          sql`select * from clients order by created_at desc`,
          sql`select * from tasks order by created_at desc`,
          sql`select * from payments`,
          sql`select id, client_id, kind, label, url, blob_key, filename, content_type, size, created_by, created_at
              from resources order by created_at desc`,
          sql`select * from deliverables order by created_at desc`,
          sql`select * from keywords order by created_at desc`,
          // keyword_history is unbounded; only ship the last 25 points per
          // keyword. The full series comes from the keywordHistory action.
          sql`select id, keyword_id, rank, recorded_at from
              (select h.*, row_number() over (partition by keyword_id order by recorded_at desc) rn from keyword_history h) t
              where rn <= 25 order by recorded_at asc`,
          sql`select id, client_id, period, summary, updated_at from client_reports`,
          sql`select id, client_id, type, quantity from client_retainers`,
          sql`select id, actor, verb, entity, entity_label, client_id, detail, created_at
              from activity order by created_at desc limit 100`,
        ]);
        return json({ clients, tasks, payments, resources, deliverables, keywords, keyword_history, client_reports, client_retainers, activity });
      }

      case "keywordHistory": {
        // Full rank series for one keyword — load only preloads the last 25.
        if (!payload.keyword_id) return json({ error: "Missing keyword id." }, 400);
        const points = await sql`select id, keyword_id, rank, recorded_at from keyword_history
          where keyword_id=${payload.keyword_id} order by recorded_at asc`;
        return json({ points });
      }

      case "clientSave": {
        const c = payload;
        if (!c.name || !String(c.name).trim()) return json({ error: "Client name is required." }, 400);
        const bad = badEnum("status", c.status, STATUSES)
          || badEnum("source", c.source, SOURCES)
          || badEnum("package", c.package, PACKAGES)
          || badEnum("risk", c.risk, RISKS);
        if (bad) return bad;
        if (c.id) {
          await sql`update clients set
            name=${c.name}, niche=${c.niche || ""}, status=${c.status || "active"},
            source=${c.source || "Direct"}, package=${c.package || "Standard"},
            fee=${Number(c.fee) || 0}, team_member=${c.team_member || ""},
            start_month=${c.start_month || ""}, renewal_month=${c.renewal_month || ""},
            risk=${c.risk || "low"}, notes=${c.notes || ""}
            where id=${c.id}`;
          await logActivity(sql, { actor, verb: "updated client", entity: "client", entity_label: c.name, client_id: c.id });
        } else {
          const ins = await sql`insert into clients
            (name, niche, status, source, package, fee, team_member, start_month, renewal_month, risk, notes, created_by)
            values (${c.name}, ${c.niche || ""}, ${c.status || "active"}, ${c.source || "Direct"},
                    ${c.package || "Standard"}, ${Number(c.fee) || 0}, ${c.team_member || ""},
                    ${c.start_month || ""}, ${c.renewal_month || ""}, ${c.risk || "low"},
                    ${c.notes || ""}, ${c.created_by || ""}) returning id`;
          await logActivity(sql, { actor, verb: "created client", entity: "client", entity_label: c.name, client_id: ins[0]?.id });
        }
        return json({ ok: true });
      }

      case "clientDelete": {
        if (!isAdmin) return json({ error: "Only an admin can delete clients." }, 403);
        // Name captured BEFORE the delete — it's all the activity log keeps.
        const named = await sql`select name from clients where id=${payload.id} limit 1`;
        // Remove the client's uploaded blobs first (DB rows cascade, blobs don't).
        const files = await sql`select blob_key from resources
          where client_id=${payload.id} and kind='file' and blob_key <> ''`;
        if (files.length) {
          const store = getStore(FILES_STORE);
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
          values (${r.client_id}, 'link', ${r.label || ""}, ${linkUrl}, ${r.created_by || ""})`;
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
        await getStore(FILES_STORE).set(key, buffer);
        await sql`insert into resources
          (client_id, kind, label, blob_key, filename, content_type, size, created_by)
          values (${r.client_id}, 'file', ${r.label || r.filename || "File"}, ${key},
                  ${r.filename || "file"}, ${r.content_type || "application/octet-stream"},
                  ${buffer.length}, ${r.created_by || ""})`;
        await logActivity(sql, { actor, verb: "uploaded file", entity: "resource", entity_label: r.label || r.filename || "File", client_id: r.client_id });
        return json({ ok: true });
      }

      case "resourceDelete": {
        const rows = await sql`select kind, blob_key, label, client_id from resources where id=${payload.id} limit 1`;
        if (rows.length && rows[0].kind === "file" && rows[0].blob_key) {
          try { await getStore(FILES_STORE).delete(rows[0].blob_key); } catch { /* best effort */ }
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
        await sql`insert into deliverables (client_id, title, type, status, quantity, due_date, notes)
          values (${d.client_id}, ${d.title || ""}, ${d.type || "other"}, ${d.status || "planned"},
                  ${Number(d.quantity) || 1}, ${d.due_date || null}, ${d.notes || ""})`;
        await logActivity(sql, { actor, verb: "created deliverable", entity: "deliverable", entity_label: d.title || typeLabel(d.type), client_id: d.client_id });
        return json({ ok: true });
      }

      case "deliverableUpdate": {
        const d = payload;
        if (!d.id) return json({ error: "Missing deliverable id." }, 400);
        const bad = badEnum("type", d.type, TASK_TYPE_KEYS) || badEnum("status", d.status, DELIVERABLE_STATE_KEYS);
        if (bad) return bad;
        await sql`update deliverables set
          title=${d.title || ""}, type=${d.type || "other"}, status=${d.status || "planned"},
          quantity=${Number(d.quantity) || 1}, due_date=${d.due_date || null}, notes=${d.notes || ""}
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

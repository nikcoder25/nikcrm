import { neon } from "@netlify/neon";
import { getStore } from "@netlify/blobs";

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
  await sql`create table if not exists client_reports (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    period text not null,                    -- 'YYYY-MM'
    summary text default '',                 -- the free-text wins narrative
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (client_id, period)
  )`;
  schemaReady = true;
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

// Returns "admin" / "member" for a correct password, or null for a wrong one.
// Only call this once authConfigured() is true.
function resolveRole(pw) {
  const APP = process.env.APP_PASSWORD || "";
  const ADMIN = process.env.ADMIN_PASSWORD || "";
  if (ADMIN && pw === ADMIN) return "admin";
  if (APP && pw === APP) return "member";
  return null;                                  // wrong / missing password
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
      return new Response(data, {
        status: 200,
        headers: {
          "content-type": rows[0].content_type || "application/octet-stream",
          "content-disposition": `inline; filename="${safeName}"`,
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
    const role = resolveRole(payload.password || "");
    if (!role) return json({ error: "Wrong password. Ask your team lead for it." }, 401);
    return json({ ok: true, role });
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

  try {
    const sql = db();
    await ensureSchema(sql);
    switch (action) {
      case "load": {
        const [clients, tasks, payments, resources, deliverables, keywords, client_reports] = await Promise.all([
          sql`select * from clients order by created_at desc`,
          sql`select * from tasks order by created_at desc`,
          sql`select * from payments`,
          sql`select id, client_id, kind, label, url, blob_key, filename, content_type, size, created_by, created_at
              from resources order by created_at desc`,
          sql`select * from deliverables order by created_at desc`,
          sql`select * from keywords order by created_at desc`,
          sql`select id, client_id, period, summary, updated_at from client_reports`,
        ]);
        return json({ clients, tasks, payments, resources, deliverables, keywords, client_reports });
      }

      case "clientSave": {
        const c = payload;
        if (c.id) {
          await sql`update clients set
            name=${c.name}, niche=${c.niche || ""}, status=${c.status || "active"},
            source=${c.source || "Direct"}, package=${c.package || "Standard"},
            fee=${Number(c.fee) || 0}, team_member=${c.team_member || ""},
            start_month=${c.start_month || ""}, renewal_month=${c.renewal_month || ""},
            risk=${c.risk || "low"}, notes=${c.notes || ""}
            where id=${c.id}`;
        } else {
          await sql`insert into clients
            (name, niche, status, source, package, fee, team_member, start_month, renewal_month, risk, notes, created_by)
            values (${c.name}, ${c.niche || ""}, ${c.status || "active"}, ${c.source || "Direct"},
                    ${c.package || "Standard"}, ${Number(c.fee) || 0}, ${c.team_member || ""},
                    ${c.start_month || ""}, ${c.renewal_month || ""}, ${c.risk || "low"},
                    ${c.notes || ""}, ${c.created_by || ""})`;
        }
        return json({ ok: true });
      }

      case "clientDelete": {
        if (!isAdmin) return json({ error: "Only an admin can delete clients." }, 403);
        // Remove the client's uploaded blobs first (DB rows cascade, blobs don't).
        const files = await sql`select blob_key from resources
          where client_id=${payload.id} and kind='file' and blob_key <> ''`;
        if (files.length) {
          const store = getStore(FILES_STORE);
          for (const f of files) { try { await store.delete(f.blob_key); } catch { /* best effort */ } }
        }
        await sql`delete from clients where id=${payload.id}`;
        return json({ ok: true });
      }

      case "taskAdd": {
        const t = payload;
        await sql`insert into tasks (client_id, title, type, assignee, status, due)
          values (${t.client_id}, ${t.title}, ${t.type || "other"}, ${t.assignee || ""},
                  ${t.status || "todo"}, ${t.due || null})`;
        return json({ ok: true });
      }

      case "taskMove": {
        await sql`update tasks set status=${payload.status} where id=${payload.id}`;
        return json({ ok: true });
      }

      case "taskDelete": {
        await sql`delete from tasks where id=${payload.id}`;
        return json({ ok: true });
      }

      case "paymentSet": {
        const p = payload;
        const paidDate = p.status === "paid" ? new Date().toISOString().slice(0, 10) : null;
        await sql`insert into payments (client_id, month, amount, status, paid_date)
          values (${p.client_id}, ${p.month}, ${Number(p.amount) || 0}, ${p.status}, ${paidDate})
          on conflict (client_id, month) do update set
            amount=excluded.amount, status=excluded.status, paid_date=excluded.paid_date`;
        return json({ ok: true });
      }

      case "resourceLinkAdd": {
        const r = payload;
        if (!r.client_id) return json({ error: "Missing client." }, 400);
        if (!r.url || !r.url.trim()) return json({ error: "A link URL is required." }, 400);
        await sql`insert into resources (client_id, kind, label, url, created_by)
          values (${r.client_id}, 'link', ${r.label || ""}, ${r.url.trim()}, ${r.created_by || ""})`;
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
        return json({ ok: true });
      }

      case "resourceDelete": {
        const rows = await sql`select kind, blob_key from resources where id=${payload.id} limit 1`;
        if (rows.length && rows[0].kind === "file" && rows[0].blob_key) {
          try { await getStore(FILES_STORE).delete(rows[0].blob_key); } catch { /* best effort */ }
        }
        await sql`delete from resources where id=${payload.id}`;
        return json({ ok: true });
      }

      case "deliverableCreate": {
        const d = payload;
        if (!d.client_id) return json({ error: "Pick a client for the deliverable." }, 400);
        await sql`insert into deliverables (client_id, title, type, status, quantity, due_date, notes)
          values (${d.client_id}, ${d.title || ""}, ${d.type || "other"}, ${d.status || "planned"},
                  ${Number(d.quantity) || 1}, ${d.due_date || null}, ${d.notes || ""})`;
        return json({ ok: true });
      }

      case "deliverableUpdate": {
        const d = payload;
        if (!d.id) return json({ error: "Missing deliverable id." }, 400);
        await sql`update deliverables set
          title=${d.title || ""}, type=${d.type || "other"}, status=${d.status || "planned"},
          quantity=${Number(d.quantity) || 1}, due_date=${d.due_date || null}, notes=${d.notes || ""}
          where id=${d.id}`;
        return json({ ok: true });
      }

      case "deliverableDelete": {
        // Not admin-gated — only client deletion is.
        await sql`delete from deliverables where id=${payload.id}`;
        return json({ ok: true });
      }

      case "keywordCreate": {
        const k = payload;
        if (!k.client_id) return json({ error: "Pick a client for the keyword." }, 400);
        const cur = toRank(k.current_rank);
        const checkedAt = cur == null ? null : new Date().toISOString();
        await sql`insert into keywords (client_id, keyword, current_rank, previous_rank, target_url, checked_at, notes)
          values (${k.client_id}, ${k.keyword || ""}, ${cur}, ${null}, ${k.target_url || ""}, ${checkedAt}, ${k.notes || ""})`;
        return json({ ok: true });
      }

      case "keywordUpdate": {
        const k = payload;
        if (!k.id) return json({ error: "Missing keyword id." }, 400);
        const rows = await sql`select current_rank, previous_rank, checked_at from keywords where id=${k.id} limit 1`;
        if (!rows.length) return json({ error: "Keyword not found." }, 404);
        const existing = rows[0];
        const cur = toRank(k.current_rank);
        // Roll the old current_rank into previous_rank only when the rank actually
        // changes, so movement stays meaningful across plain metadata edits.
        const rankChanged = (cur ?? null) !== (existing.current_rank ?? null);
        const previous_rank = rankChanged ? existing.current_rank : existing.previous_rank;
        const checked_at = rankChanged ? new Date().toISOString() : existing.checked_at;
        await sql`update keywords set
          keyword=${k.keyword || ""}, current_rank=${cur}, previous_rank=${previous_rank ?? null},
          target_url=${k.target_url || ""}, checked_at=${checked_at ?? null}, notes=${k.notes || ""}
          where id=${k.id}`;
        return json({ ok: true });
      }

      case "keywordDelete": {
        // Not admin-gated — only client deletion is.
        await sql`delete from keywords where id=${payload.id}`;
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
        return json({ ok: true });
      }

      case "reportDelete": {
        // Not admin-gated — only client deletion is.
        await sql`delete from client_reports where id=${payload.id}`;
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

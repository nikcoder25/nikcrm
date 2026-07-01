import { neon } from "@netlify/neon";

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
  schemaReady = true;
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
        const [clients, tasks, payments] = await Promise.all([
          sql`select * from clients order by created_at desc`,
          sql`select * from tasks order by created_at desc`,
          sql`select * from payments`,
        ]);
        return json({ clients, tasks, payments });
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

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
};

// Route this function at /api/data (Netlify Functions v2 routing).
export const config = { path: "/api/data" };

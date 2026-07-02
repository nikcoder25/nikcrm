// Google integration: OAuth 2.0 (web server flow) + a thin Gmail / Calendar
// proxy, routed at /api/google (Netlify Functions v2).
//
// Model: ONE Google account per workspace (the agency's), connected by an admin.
// Tokens live in the `integrations` table and never leave the server — the
// browser only ever sees connection status. Everything is gated by the same
// shared team password as /api/data; connecting/disconnecting also requires the
// admin password.
//
// Setup (see README): create a Google Cloud OAuth 2.0 "Web application" client,
// add `<your-site>/api/google` as an authorized redirect URI, enable the Gmail
// and Calendar APIs, and set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (and
// optionally GOOGLE_REDIRECT_URI) in Netlify. This file cannot be exercised
// without those credentials.

import { timingSafeEqual } from "node:crypto";
import { neon } from "@netlify/neon";
import { verifyToken } from "../lib/auth.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const redirect = (location) => new Response(null, { status: 302, headers: { location } });

let _sql;
function db() { if (!_sql) _sql = neon(); return _sql; }

/* ---------------- auth (mirrors data.js: Bearer session token, with the
   legacy x-app-password header as fallback) ---------------- */
function authConfigured() { return Boolean(process.env.APP_PASSWORD || process.env.ADMIN_PASSWORD); }

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (authConfigured()) {
    return `ga-session-v1:${process.env.APP_PASSWORD || ""}:${process.env.ADMIN_PASSWORD || ""}`;
  }
  return null;
}

function safeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function resolveRole(pw) {
  const APP = process.env.APP_PASSWORD || "", ADMIN = process.env.ADMIN_PASSWORD || "";
  if (ADMIN && safeEq(pw, ADMIN)) return "admin";
  if (APP && safeEq(pw, APP)) return "member";
  return null;
}

// Returns { role, name } or null.
function authenticate(req) {
  const header = req.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer !== header) {
    const secret = sessionSecret();
    const data = secret ? verifyToken(bearer, secret) : null;
    return data ? { role: data.role, name: String(data.name || "") } : null;
  }
  const role = resolveRole(req.headers.get("x-app-password") || "");
  return role ? { role, name: "" } : null;
}

const OAUTH = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  userinfo: "https://www.googleapis.com/oauth2/v2/userinfo",
};
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

function googleConfigured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return new URL(req.url).origin + "/api/google";
}

let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`create table if not exists integrations (
    provider text primary key,
    access_token text default '',
    refresh_token text default '',
    token_expiry timestamptz,
    scope text default '',
    account_email text default '',
    connected_by text default '',
    updated_at timestamptz default now()
  )`;
  await sql`create table if not exists oauth_states (
    state text primary key,
    created_by text default '',
    created_at timestamptz default now()
  )`;
  schemaReady = true;
}

/* ---------------- token helpers ---------------- */
// Exchange an authorization code (or refresh token) for tokens.
async function tokenRequest(params) {
  const res = await fetch(OAUTH.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Token request failed (${res.status})`);
  return data;
}

// Return a currently-valid access token, refreshing it if it's within 60s of
// expiry. Throws a friendly error when Google isn't connected.
async function getAccessToken(sql) {
  const rows = await sql`select * from integrations where provider='google' limit 1`;
  if (!rows.length || !rows[0].refresh_token) throw new Error("Google isn't connected. An admin can connect it in Settings.");
  const row = rows[0];
  const expMs = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (row.access_token && expMs - Date.now() > 60_000) return row.access_token;
  const data = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
  });
  const expiry = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString();
  await sql`update integrations set access_token=${data.access_token}, token_expiry=${expiry}, updated_at=now() where provider='google'`;
  return data.access_token;
}

async function gapi(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.error || `Google API error (${res.status})`);
  return data;
}

/* ---------------- calendar / gmail ---------------- */
const dayPlus = (ymd, n) => {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

// Build a Calendar event body from an activity + its client name.
function eventBody(activity, clientName) {
  if (activity.type === "meeting" && activity.happened_at) {
    const start = new Date(activity.happened_at);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    return { summary: `Meeting: ${clientName}`, description: activity.body || "", start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } };
  }
  // Otherwise treat it as an all-day follow-up reminder.
  const day = String(activity.follow_up_date).slice(0, 10);
  return { summary: `Follow up: ${clientName}`, description: `${activity.body || ""}`.trim(), start: { date: day }, end: { date: dayPlus(day, 1) } };
}

export default async (req) => {
  // OAuth callback: Google redirects the browser here (GET ?code&state). It
  // can't carry the app password, so it's gated by the one-time `state` nonce
  // that the password-gated `authUrl` action created.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) return json({ ok: true }); // health probe / no-op
    if (!process.env.NETLIFY_DATABASE_URL) return redirect("/?google=error");
    try {
      const sql = db();
      await ensureSchema(sql);
      const st = await sql`select state from oauth_states where state=${state || ""} limit 1`;
      if (!st.length) return redirect("/?google=error");
      await sql`delete from oauth_states where state=${state}`;
      // Exchange the code for tokens.
      const tok = await tokenRequest({
        grant_type: "authorization_code",
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(req),
      });
      const expiry = new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString();
      // Identify the connected account (best-effort).
      let email = "";
      try { const who = await gapi(tok.access_token, OAUTH.userinfo); email = who.email || ""; } catch { /* non-fatal */ }
      // Upsert. Google only returns a refresh_token on first consent (or with
      // prompt=consent) — keep the stored one if this response omits it.
      await sql`insert into integrations (provider, access_token, refresh_token, token_expiry, scope, account_email, updated_at)
        values ('google', ${tok.access_token}, ${tok.refresh_token || ""}, ${expiry}, ${tok.scope || ""}, ${email}, now())
        on conflict (provider) do update set
          access_token=excluded.access_token,
          refresh_token=case when excluded.refresh_token <> '' then excluded.refresh_token else integrations.refresh_token end,
          token_expiry=excluded.token_expiry, scope=excluded.scope, account_email=excluded.account_email, updated_at=now()`;
      return redirect("/?google=connected");
    } catch (e) {
      return redirect("/?google=error&msg=" + encodeURIComponent(String(e?.message || e).slice(0, 200)));
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sessionSecret()) return json({ error: "Login isn't set up yet. Set APP_PASSWORD in Cloudflare." }, 503);

  const auth = authenticate(req);
  if (!auth) return json({ error: "Unauthorized" }, 401);
  const isAdmin = auth.role === "admin";

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { action, payload = {} } = body;

  if (!process.env.NETLIFY_DATABASE_URL) return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);

  try {
    const sql = db();
    await ensureSchema(sql);

    switch (action) {
      case "status": {
        const rows = await sql`select account_email, scope, updated_at, refresh_token from integrations where provider='google' limit 1`;
        const connected = rows.length > 0 && Boolean(rows[0].refresh_token);
        return json({
          configured: googleConfigured(),
          connected,
          account_email: connected ? rows[0].account_email : "",
          updated_at: connected ? rows[0].updated_at : null,
        });
      }

      case "authUrl": {
        if (!isAdmin) return json({ error: "Only an admin can connect Google." }, 403);
        if (!googleConfigured()) return json({ error: "Google isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Cloudflare." }, 400);
        const state = crypto.randomUUID();
        await sql`insert into oauth_states (state, created_by) values (${state}, ${payload.by || ""})`;
        const params = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          redirect_uri: redirectUri(req),
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          scope: SCOPES.join(" "),
          state,
        });
        return json({ url: `${OAUTH.auth}?${params.toString()}` });
      }

      case "disconnect": {
        if (!isAdmin) return json({ error: "Only an admin can disconnect Google." }, 403);
        await sql`delete from integrations where provider='google'`;
        return json({ ok: true });
      }

      case "calendarPush": {
        // Push one activity (follow-up or meeting) to the connected Google
        // Calendar. Idempotent: re-pushing updates the same event.
        const id = payload.activity_id;
        if (!id) return json({ error: "Missing activity id." }, 400);
        const rows = await sql`select a.*, c.name as client_name from activities a join clients c on c.id=a.client_id where a.id=${id} limit 1`;
        if (!rows.length) return json({ error: "Activity not found." }, 404);
        const a = rows[0];
        if (!a.follow_up_date && !(a.type === "meeting" && a.happened_at)) {
          return json({ error: "Only follow-ups and meetings can go on the calendar." }, 400);
        }
        const token = await getAccessToken(sql);
        const evt = eventBody(a, a.client_name);
        const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
        let saved;
        if (a.google_event_id) {
          saved = await gapi(token, `${base}/${encodeURIComponent(a.google_event_id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(evt) });
        } else {
          saved = await gapi(token, base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evt) });
        }
        await sql`update activities set google_event_id=${saved.id} where id=${id}`;
        return json({ ok: true, event_id: saved.id, html_link: saved.htmlLink || "" });
      }

      case "gmailSync": {
        // Import recent Gmail messages to/from a client's contact email as
        // 'email' activities. Deduped by Gmail message id.
        const clientId = payload.client_id;
        if (!clientId) return json({ error: "Missing client id." }, 400);
        const crows = await sql`select id, name, email from clients where id=${clientId} limit 1`;
        if (!crows.length) return json({ error: "Client not found." }, 404);
        const client = crows[0];
        if (!client.email) return json({ error: "Add a contact email to this client first." }, 400);
        const token = await getAccessToken(sql);
        const q = encodeURIComponent(`from:${client.email} OR to:${client.email}`);
        const list = await gapi(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${q}`);
        const msgs = list.messages || [];
        if (!msgs.length) return json({ ok: true, imported: 0 });
        // Skip messages already imported for this client (dedupe by Gmail id).
        const existing = await sql`select gmail_msg_id from activities where client_id=${clientId} and gmail_msg_id <> ''`;
        const seen = new Set(existing.map((r) => r.gmail_msg_id));
        let imported = 0;
        for (const m of msgs) {
          if (seen.has(m.id)) continue;
          const full = await gapi(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
          const headers = Object.fromEntries((full.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
          const subject = headers.subject || "(no subject)";
          const from = headers.from || "";
          const snippet = (full.snippet || "").slice(0, 400);
          const dateHdr = headers.date ? new Date(headers.date) : new Date(Number(full.internalDate) || Date.now());
          const happened = Number.isNaN(dateHdr.getTime()) ? new Date().toISOString() : dateHdr.toISOString();
          const bodyText = `${subject}\n${from ? `From: ${from}\n` : ""}${snippet}`.trim();
          await sql`insert into activities (client_id, type, body, author, happened_at, gmail_msg_id)
            values (${clientId}, 'email', ${bodyText}, 'Gmail', ${happened}, ${m.id})`;
          imported += 1;
        }
        return json({ ok: true, imported });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
};

export const config = { path: "/api/google" };

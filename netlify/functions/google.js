// Google integration: OAuth 2.0 (web server flow) + a thin Gmail / Calendar
// proxy, routed at /api/google (Netlify Functions v2, also mounted by the
// Cloudflare Worker).
//
// ONE Google OAuth client and ONE redirect URI (<api-origin>/api/google) serve
// three flows, told apart by the `flow` column on the OAuth `state` row:
//   'sso'          Sign in with Google on the login screen (openid email
//                  profile only). Matches an EXISTING users row by Google
//                  sub/email and issues the same signed session token as the
//                  email/password login. Never auto-creates accounts.
//   'connect_user' Per-user Gmail + Calendar connect from Settings. Tokens are
//                  stored per user id in `user_google_tokens`, server-side
//                  only, and take precedence over the workspace fallback.
//   'connect'      Legacy workspace-wide connect (admin only) — kept as the
//                  fallback so existing installs keep working untouched.
//
// The frontend may live on a different origin than this API (Hostinger static
// site + Cloudflare Worker). Each flow records the app origin it started from
// — validated against the request origin and ALLOWED_ORIGIN so the callback
// can never be aimed at an attacker's site — and the callback redirects there.
//
// Setup (see README): create a Google Cloud OAuth 2.0 "Web application" client,
// add `<api-origin>/api/google` as the single authorized redirect URI, enable
// the Gmail and Calendar APIs, and set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
// (and optionally GOOGLE_REDIRECT_URI). This file cannot be exercised without
// those credentials.

import { timingSafeEqual } from "node:crypto";
import { neon } from "@netlify/neon";
import { verifyToken, signToken } from "../lib/auth.js";

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

// Returns { role, name, userId } or null. userId is null for shared-password
// and legacy sessions (mirrors data.js).
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
      userId: data.sub && data.sub !== "shared" ? String(data.sub) : null,
    };
  }
  const role = resolveRole(req.headers.get("x-app-password") || "");
  return role ? { role, name: "", userId: null } : null;
}

const OAUTH = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  userinfo: "https://www.googleapis.com/oauth2/v2/userinfo",
};
// Sign in with Google: identity only — no mailbox or calendar access at login.
const SSO_SCOPES = ["openid", "email", "profile"];
// Per-user (and legacy workspace) Gmail + Calendar + Search Console connect —
// a separate consent flow from SSO. Users who connected before the Search
// Console scope was added reconnect once to grant it.
const CONNECT_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

function googleConfigured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return new URL(req.url).origin + "/api/google";
}

/* ---------------- app-origin handling ----------------
   The static frontend may be on a different origin than this API. OAuth flows
   record which app origin they started from so the callback can send the
   browser back there. Only the API's own origin and the ALLOWED_ORIGIN list
   are ever accepted — the SSO callback puts a session token in the redirect,
   so an unvalidated origin would hand sessions to an attacker's site. */

// The origins a flow may bounce back to. Exported for unit tests.
export function allowedAppOrigins(requestOrigin, allowedOriginEnv) {
  const list = String(allowedOriginEnv || "")
    .split(",").map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s && s !== "*");
  return [String(requestOrigin || "").replace(/\/+$/, ""), ...list];
}

// A candidate origin if it's allowed, else "" (caller falls back).
export function resolveAppOrigin(candidate, requestOrigin, allowedOriginEnv) {
  const c = String(candidate || "").trim().replace(/\/+$/, "");
  return c && allowedAppOrigins(requestOrigin, allowedOriginEnv).includes(c) ? c : "";
}

// Best origin to redirect to when the state row is missing/unknown: the first
// configured frontend origin (Cloudflare split deploy), else the API's own
// origin (Netlify same-origin deploy).
function fallbackAppOrigin(req) {
  const list = String(process.env.ALLOWED_ORIGIN || "")
    .split(",").map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s && s !== "*");
  return list[0] || new URL(req.url).origin;
}

/* ---------------- ssoStart throttle ----------------
   ssoStart is the one unauthenticated action here (the user isn't logged in
   yet), so bound it per IP like data.js's login throttle. */
const SSO_WINDOW_MS = 10 * 60 * 1000;
const SSO_MAX_STARTS = 30;
const ssoHits = new Map(); // ip -> { count, resetAt }
function ssoThrottled(req) {
  const ip = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-nf-client-connection-ip")
    || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "unknown";
  const rec = ssoHits.get(ip);
  if (!rec || Date.now() > rec.resetAt) {
    ssoHits.set(ip, { count: 1, resetAt: Date.now() + SSO_WINDOW_MS });
    if (ssoHits.size > 5000) ssoHits.clear(); // bound memory
    return false;
  }
  rec.count += 1;
  return rec.count > SSO_MAX_STARTS;
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
  // Which flow a state belongs to ('connect' = legacy workspace, 'connect_user'
  // = per-user Gmail/Calendar, 'sso' = Sign in with Google), who started it,
  // and which frontend origin the callback should send the browser back to.
  // Pre-upgrade rows default to 'connect', matching their old behavior.
  await sql`alter table oauth_states add column if not exists flow text default 'connect'`;
  await sql`alter table oauth_states add column if not exists user_id text default ''`;
  await sql`alter table oauth_states add column if not exists app_origin text default ''`;
  // Per-user Gmail/Calendar tokens — server-side only, never sent to the
  // browser. user_id is text (not a FK) on purpose: the users table belongs to
  // data.js and may not exist yet when this handler runs first on a fresh
  // database; rows are removed on disconnect and on user deletion.
  await sql`create table if not exists user_google_tokens (
    user_id text primary key,
    access_token text default '',
    refresh_token text default '',
    token_expiry timestamptz,
    scope text default '',
    account_email text default '',
    updated_at timestamptz default now()
  )`;
  // Google SSO identity on user accounts. Added HERE (not in data.js) because
  // data.js's ensureSchema fast-paths out on existing databases, so its ALTERs
  // never run there; `if exists` covers a fresh DB where users doesn't exist yet.
  await sql`alter table if exists users add column if not exists google_sub text default ''`;
  await sql`alter table if exists users add column if not exists google_email text default ''`;
  // Search Console sites a user imported into their Websites dashboard.
  await sql`create table if not exists user_gsc_sites (
    user_id text not null,
    site_url text not null,
    added_at timestamptz default now(),
    primary key (user_id, site_url)
  )`;
  // Which Search Console site powers a client's "Organic search" panel, and
  // whose per-user OAuth token fetches it. No FK to clients (created by
  // data.js, possibly later); data.js cleans this up on client deletion.
  await sql`create table if not exists client_gsc_sites (
    client_id uuid primary key,
    site_url text not null,
    user_id text not null,
    updated_at timestamptz default now()
  )`;
  // Per-site Search Analytics cache (JSON payload). Fetches go to Google at
  // most once per TTL per site, keeping any one invocation to ~2 Google calls
  // — well inside Cloudflare's 50-subrequest budget.
  await sql`create table if not exists gsc_cache (
    site_url text primary key,
    payload text default '',
    fetched_at timestamptz default now()
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

// Refresh helper shared by both token stores.
async function refreshedToken(refreshToken) {
  const data = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
  });
  const expiry = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString();
  return { token: data.access_token, expiry };
}

// Valid access token from a user_google_tokens row, refreshing when within
// 60s of expiry.
async function freshUserToken(sql, userId, row) {
  const expMs = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (row.access_token && expMs - Date.now() > 60_000) return row.access_token;
  const { token, expiry } = await refreshedToken(row.refresh_token);
  await sql`update user_google_tokens set access_token=${token}, token_expiry=${expiry}, updated_at=now() where user_id=${userId}`;
  return token;
}

// STRICTLY the given user's token — no workspace fallback. Search Console
// calls use this: the workspace token was never granted the webmasters scope.
async function getUserAccessToken(sql, userId) {
  const rows = userId
    ? await sql`select access_token, refresh_token, token_expiry from user_google_tokens where user_id=${userId} limit 1`
    : [];
  if (!rows.length || !rows[0].refresh_token) throw new Error("Connect your Google account in Settings first.");
  return freshUserToken(sql, userId, rows[0]);
}

// Return a currently-valid access token for this session, refreshing when
// within 60s of expiry. The CURRENT USER's connection wins; the legacy
// workspace-wide row is the fallback so existing installs keep working.
// Throws a friendly error when neither is connected.
async function getAccessToken(sql, userId) {
  if (userId) {
    const rows = await sql`select access_token, refresh_token, token_expiry from user_google_tokens where user_id=${userId} limit 1`;
    if (rows.length && rows[0].refresh_token) return freshUserToken(sql, userId, rows[0]);
  }
  const rows = await sql`select access_token, refresh_token, token_expiry from integrations where provider='google' limit 1`;
  if (!rows.length || !rows[0].refresh_token) throw new Error("Connect your Google account in Settings first.");
  const row = rows[0];
  const expMs = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (row.access_token && expMs - Date.now() > 60_000) return row.access_token;
  const { token, expiry } = await refreshedToken(row.refresh_token);
  await sql`update integrations set access_token=${token}, token_expiry=${expiry}, updated_at=now() where provider='google'`;
  return token;
}

/* ---------------- Search Console (per-user OAuth) ----------------
   Data flows: a user imports their sites into the Websites dashboard, or
   attaches one of their sites to a client. Search Analytics results are
   cached per site in gsc_cache so any one request makes at most two Google
   calls (daily series + top queries); everything else reads the cache. */

const GSC_API = "https://www.googleapis.com/webmasters/v3";
const GSC_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // GSC data lags ~2 days; 6h is plenty fresh

const gscDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// The user's verified Search Console properties.
async function gscListSites(token) {
  const data = await gapi(token, `${GSC_API}/sites`);
  return (data.siteEntry || [])
    .filter((s) => s.permissionLevel && s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ site_url: s.siteUrl, permission: s.permissionLevel }))
    .sort((a, b) => a.site_url.localeCompare(b.site_url));
}

async function gscSearchAnalytics(token, siteUrl, body) {
  const data = await gapi(token, `${GSC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return Array.isArray(data.rows) ? data.rows : [];
}

const gscNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Site data (daily series ~90d + top queries 28d) from the cache, refetched
// with the OWNER user's token when stale. Shape matches what the frontend's
// organic panels already consume: {daily, queries, month} (month is null —
// per-user queries are a rolling 28-day window, not calendar-month buckets).
async function gscSiteData(sql, ownerUserId, siteUrl, force = false) {
  const cached = await sql`select payload, fetched_at from gsc_cache where site_url=${siteUrl} limit 1`;
  if (!force && cached.length && Date.now() - new Date(cached[0].fetched_at).getTime() < GSC_CACHE_TTL_MS) {
    try { return JSON.parse(cached[0].payload); } catch { /* corrupt — refetch */ }
  }
  const token = await getUserAccessToken(sql, ownerUserId);
  const [dailyRows, queryRows] = await Promise.all([
    gscSearchAnalytics(token, siteUrl, { startDate: gscDaysAgo(90), endDate: gscDaysAgo(1), dimensions: ["date"], rowLimit: 500 }),
    gscSearchAnalytics(token, siteUrl, { startDate: gscDaysAgo(28), endDate: gscDaysAgo(1), dimensions: ["query"], rowLimit: 15 }),
  ]);
  const data = {
    daily: dailyRows.map((r) => ({
      date: String(r.keys?.[0] || "").slice(0, 10),
      clicks: gscNum(r.clicks), impressions: gscNum(r.impressions),
      ctr: gscNum(r.ctr), position: gscNum(r.position),
    })),
    queries: queryRows.map((r) => ({
      query: String(r.keys?.[0] || ""),
      clicks: gscNum(r.clicks), impressions: gscNum(r.impressions), position: gscNum(r.position),
    })),
    month: null,
  };
  await sql`insert into gsc_cache (site_url, payload, fetched_at) values (${siteUrl}, ${JSON.stringify(data)}, now())
    on conflict (site_url) do update set payload=excluded.payload, fetched_at=now()`;
  return data;
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
  // can't carry a session, so it's gated by the one-time `state` nonce that
  // the flow-starting action created; the row says which flow this is and
  // which frontend origin to send the browser back to.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) return json({ ok: true }); // health probe / no-op
    let appOrigin = fallbackAppOrigin(req);
    let flow = "connect";
    if (!process.env.NETLIFY_DATABASE_URL) return redirect(appOrigin + "/?google=error");
    try {
      const sql = db();
      await ensureSchema(sql);
      const st = await sql`select state, flow, user_id, app_origin from oauth_states where state=${state || ""} limit 1`;
      if (!st.length) return redirect(appOrigin + "/?google=error");
      await sql`delete from oauth_states where state=${state}`;
      flow = st[0].flow || "connect";
      if (st[0].app_origin) appOrigin = st[0].app_origin;
      // Exchange the code for tokens.
      const tok = await tokenRequest({
        grant_type: "authorization_code",
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(req),
      });
      const expiry = new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString();
      // Identify the Google account (sub + email). Best-effort for the connect
      // flows; required for SSO, which matches an account by it.
      let email = "", sub = "";
      try {
        const who = await gapi(tok.access_token, OAUTH.userinfo);
        email = String(who.email || "").toLowerCase();
        sub = String(who.id || "");
      } catch { /* handled per-flow below */ }

      if (flow === "sso") {
        // Sign in with Google: match an EXISTING account — never auto-create.
        const secret = sessionSecret();
        if (!secret) return redirect(appOrigin + "/?sso=error&msg=" + encodeURIComponent("Login isn't set up on the server yet."));
        if (!email) return redirect(appOrigin + "/?sso=error&msg=" + encodeURIComponent("Google didn't return an email address."));
        let users = [];
        try {
          users = await sql`select id, name, role from users
            where active and ((${sub} <> '' and google_sub=${sub})
                           or lower(email)=${email}
                           or (google_email <> '' and lower(google_email)=${email}))
            order by (google_sub=${sub}) desc limit 1`;
        } catch { users = []; } // users table may not exist yet → no account
        if (!users.length) return redirect(appOrigin + "/?sso=nouser");
        const u = users[0];
        // Persist the Google identity for reliable future matching (email can
        // change on either side; the sub never does).
        await sql`update users set google_sub=${sub}, google_email=${email} where id=${u.id}`;
        const role = u.role === "admin" ? "admin" : "member";
        const token = signToken({ sub: u.id, name: u.name || "Team member", role }, secret);
        // The token travels in the URL FRAGMENT: fragments never leave the
        // browser (not sent to any server, absent from logs), and the app
        // scrubs it from the address bar as soon as it reads it.
        return redirect(appOrigin + "/#sso_token=" + encodeURIComponent(token));
      }

      if (flow === "connect_user") {
        // Per-user Gmail/Calendar tokens. Google only returns a refresh_token
        // on first consent (or with prompt=consent) — keep the stored one if
        // this response omits it.
        const userId = String(st[0].user_id || "");
        if (!userId) return redirect(appOrigin + "/?google=error");
        await sql`insert into user_google_tokens (user_id, access_token, refresh_token, token_expiry, scope, account_email, updated_at)
          values (${userId}, ${tok.access_token}, ${tok.refresh_token || ""}, ${expiry}, ${tok.scope || ""}, ${email}, now())
          on conflict (user_id) do update set
            access_token=excluded.access_token,
            refresh_token=case when excluded.refresh_token <> '' then excluded.refresh_token else user_google_tokens.refresh_token end,
            token_expiry=excluded.token_expiry, scope=excluded.scope, account_email=excluded.account_email, updated_at=now()`;
        return redirect(appOrigin + "/?google=connected");
      }

      // Legacy workspace-wide connect (flow 'connect').
      await sql`insert into integrations (provider, access_token, refresh_token, token_expiry, scope, account_email, updated_at)
        values ('google', ${tok.access_token}, ${tok.refresh_token || ""}, ${expiry}, ${tok.scope || ""}, ${email}, now())
        on conflict (provider) do update set
          access_token=excluded.access_token,
          refresh_token=case when excluded.refresh_token <> '' then excluded.refresh_token else integrations.refresh_token end,
          token_expiry=excluded.token_expiry, scope=excluded.scope, account_email=excluded.account_email, updated_at=now()`;
      return redirect(appOrigin + "/?google=connected");
    } catch (e) {
      const msg = encodeURIComponent(String(e?.message || e).slice(0, 200));
      return redirect(appOrigin + (flow === "sso" ? `/?sso=error&msg=${msg}` : `/?google=error&msg=${msg}`));
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sessionSecret()) return json({ error: "Login isn't set up yet. Set APP_PASSWORD in Cloudflare." }, 503);

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { action, payload = {} } = body;

  if (!process.env.NETLIFY_DATABASE_URL) return json({ error: "Database not configured. Set NETLIFY_DATABASE_URL." }, 503);

  // Public action: start "Sign in with Google" from the login screen. The user
  // has no session yet, so this runs BEFORE the auth gate — throttled per IP,
  // and all it does is mint a one-time state row + build the consent URL.
  if (action === "ssoStart") {
    if (!googleConfigured()) return json({ error: "Google sign-in isn't set up on this server." }, 400);
    if (ssoThrottled(req)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    try {
      const sql = db();
      await ensureSchema(sql);
      const requestOrigin = new URL(req.url).origin;
      const appOrigin = resolveAppOrigin(payload.app_origin, requestOrigin, process.env.ALLOWED_ORIGIN) || requestOrigin;
      const state = crypto.randomUUID();
      // Expire stale nonces so unauthenticated starts can't grow the table.
      await sql`delete from oauth_states where created_at < now() - interval '1 hour'`;
      await sql`insert into oauth_states (state, flow, app_origin) values (${state}, 'sso', ${appOrigin})`;
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri(req),
        response_type: "code",
        prompt: "select_account",
        scope: SSO_SCOPES.join(" "),
        state,
      });
      return json({ url: `${OAUTH.auth}?${params.toString()}` });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  const auth = authenticate(req);
  if (!auth) return json({ error: "Unauthorized" }, 401);
  const isAdmin = auth.role === "admin";

  try {
    const sql = db();
    await ensureSchema(sql);

    switch (action) {
      case "status": {
        // The CURRENT USER's connection, plus the legacy workspace fallback.
        // `connected`/`account_email` keep their old meaning ("can this
        // session use Gmail/Calendar, and as which account") for old clients.
        const mine = auth.userId
          ? await sql`select account_email, updated_at, refresh_token from user_google_tokens where user_id=${auth.userId} limit 1`
          : [];
        const userConnected = mine.length > 0 && Boolean(mine[0].refresh_token);
        const ws = await sql`select account_email, updated_at, refresh_token from integrations where provider='google' limit 1`;
        const wsConnected = ws.length > 0 && Boolean(ws[0].refresh_token);
        return json({
          configured: googleConfigured(),
          connected: userConnected || wsConnected,
          account_email: userConnected ? mine[0].account_email : (wsConnected ? ws[0].account_email : ""),
          updated_at: userConnected ? mine[0].updated_at : (wsConnected ? ws[0].updated_at : null),
          user_account: Boolean(auth.userId),
          user_connected: userConnected,
          user_email: userConnected ? mine[0].account_email : "",
          workspace_connected: wsConnected,
          workspace_email: wsConnected ? ws[0].account_email : "",
        });
      }

      case "authUrl": {
        if (!googleConfigured()) return json({ error: "Google isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Cloudflare." }, 400);
        // Default: connect the CURRENT USER's Google account. payload.workspace
        // keeps the legacy admin-only workspace-wide connect available.
        const workspace = Boolean(payload.workspace);
        if (workspace && !isAdmin) return json({ error: "Only an admin can connect the workspace fallback." }, 403);
        if (!workspace && !auth.userId) {
          return json({ error: "Sign in with your personal account (My account or Google) to connect your own Google account." }, 400);
        }
        const requestOrigin = new URL(req.url).origin;
        const appOrigin = resolveAppOrigin(payload.app_origin, requestOrigin, process.env.ALLOWED_ORIGIN) || requestOrigin;
        const state = crypto.randomUUID();
        await sql`insert into oauth_states (state, created_by, flow, user_id, app_origin)
          values (${state}, ${payload.by || ""}, ${workspace ? "connect" : "connect_user"}, ${workspace ? "" : auth.userId}, ${appOrigin})`;
        const params = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          redirect_uri: redirectUri(req),
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          scope: CONNECT_SCOPES.join(" "),
          state,
        });
        return json({ url: `${OAUTH.auth}?${params.toString()}` });
      }

      case "disconnect": {
        if (payload.workspace) {
          if (!isAdmin) return json({ error: "Only an admin can disconnect the workspace fallback." }, 403);
          await sql`delete from integrations where provider='google'`;
          return json({ ok: true });
        }
        if (!auth.userId) return json({ error: "This session has no personal Google connection." }, 400);
        await sql`delete from user_google_tokens where user_id=${auth.userId}`;
        return json({ ok: true });
      }

      /* ---------- Search Console (per-user) ---------- */

      case "gscSites": {
        // The CURRENT user's verified Search Console properties (live from
        // Google — used by pickers, so it should never be stale).
        const token = await getUserAccessToken(sql, auth.userId);
        return json({ sites: await gscListSites(token) });
      }

      case "gscSiteList": {
        // Sites the current user imported into their Websites dashboard.
        if (!auth.userId) return json({ sites: [] });
        const sites = await sql`select site_url, added_at from user_gsc_sites where user_id=${auth.userId} order by site_url`;
        return json({ sites });
      }

      case "gscSiteAdd": {
        const siteUrl = String(payload.site_url || "").trim();
        if (!siteUrl) return json({ error: "Missing site URL." }, 400);
        if (!auth.userId) return json({ error: "Sign in with your personal account (My account or Google) first." }, 400);
        // Only sites actually on the user's Search Console account.
        const token = await getUserAccessToken(sql, auth.userId);
        const sites = await gscListSites(token);
        if (!sites.some((s) => s.site_url === siteUrl)) return json({ error: "That site isn't on your Search Console account." }, 400);
        await sql`insert into user_gsc_sites (user_id, site_url) values (${auth.userId}, ${siteUrl}) on conflict do nothing`;
        return json({ ok: true });
      }

      case "gscSiteRemove": {
        if (!auth.userId) return json({ error: "This session has no imported sites." }, 400);
        await sql`delete from user_gsc_sites where user_id=${auth.userId} and site_url=${String(payload.site_url || "")}`;
        return json({ ok: true });
      }

      case "gscSiteData": {
        // Search Analytics for one of the current user's imported sites
        // (cached per site; at most two Google calls when stale).
        const siteUrl = String(payload.site_url || "").trim();
        if (!siteUrl) return json({ error: "Missing site URL." }, 400);
        if (!auth.userId) return json({ error: "Sign in with your personal account first." }, 400);
        const mine = await sql`select site_url from user_gsc_sites where user_id=${auth.userId} and site_url=${siteUrl} limit 1`;
        if (!mine.length) return json({ error: "Import this site on the Websites tab first." }, 404);
        const data = await gscSiteData(sql, auth.userId, siteUrl, Boolean(payload.force));
        return json(data);
      }

      case "gscAttach": {
        // Attach one of the CURRENT user's Search Console sites to a client;
        // that user's token then powers the client's organic-search panels.
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        const siteUrl = String(payload.site_url || "").trim();
        if (!siteUrl) return json({ error: "Missing site URL." }, 400);
        if (!auth.userId) return json({ error: "Sign in with your personal account (My account or Google) and connect Google in Settings first." }, 400);
        const token = await getUserAccessToken(sql, auth.userId);
        const sites = await gscListSites(token);
        if (!sites.some((s) => s.site_url === siteUrl)) return json({ error: "That site isn't on your Search Console account." }, 400);
        await sql`insert into client_gsc_sites (client_id, site_url, user_id, updated_at)
          values (${payload.client_id}, ${siteUrl}, ${auth.userId}, now())
          on conflict (client_id) do update set site_url=excluded.site_url, user_id=excluded.user_id, updated_at=now()`;
        return json({ ok: true });
      }

      case "gscDetach": {
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        await sql`delete from client_gsc_sites where client_id=${payload.client_id}`;
        return json({ ok: true });
      }

      case "gscClientData": {
        // Organic-search data for one client. A per-user attached site takes
        // precedence; otherwise fall back to the service-account tables that
        // gsc-sync.mjs fills nightly (the pre-existing path, unchanged).
        if (!payload.client_id) return json({ error: "Missing client." }, 400);
        const map = await sql`select site_url, user_id from client_gsc_sites where client_id=${payload.client_id} limit 1`;
        if (map.length) {
          const data = await gscSiteData(sql, map[0].user_id, map[0].site_url, Boolean(payload.force));
          return json({ source: "user", site_url: map[0].site_url, ...data });
        }
        // gsc_daily / gsc_queries belong to data.js's schema; on a fresh DB
        // where only this handler has run they may not exist yet.
        try {
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
          return json({ source: "service", site_url: "", daily, queries, month: month || null });
        } catch {
          return json({ source: "service", site_url: "", daily: [], queries: [], month: null });
        }
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
        const token = await getAccessToken(sql, auth.userId);
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
        const token = await getAccessToken(sql, auth.userId);
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

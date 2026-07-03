// Integration-style tests for the /api/google handler: the real handler runs
// against a mocked @netlify/neon (in-memory rows, routed by SQL text) and a
// mocked global fetch for Google's token/userinfo endpoints. Covers the three
// OAuth flows end-to-end at the Request/Response level.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { signToken, verifyToken } from "../lib/auth.js";

// ---- in-memory "database" ----
const store = {
  states: new Map(),        // state -> { flow, user_id, app_origin }
  users: [],                // { id, name, email, role, active, google_sub, google_email }
  userTokens: new Map(),    // user_id -> { access_token, refresh_token, token_expiry, account_email }
  integrations: null,       // workspace row or null
};

function sqlMock(strings, ...values) {
  const text = strings.join("¤").replace(/\s+/g, " ");
  const q = (s) => text.includes(s);
  if (q("create table") || q("alter table") || q("create extension")) return Promise.resolve([]);
  if (q("delete from oauth_states where created_at")) return Promise.resolve([]);
  if (q("select state, flow, user_id, app_origin from oauth_states")) {
    const row = store.states.get(values[0]);
    return Promise.resolve(row ? [{ state: values[0], ...row }] : []);
  }
  if (q("delete from oauth_states where state=")) { store.states.delete(values[0]); return Promise.resolve([]); }
  if (q("insert into oauth_states (state, flow, app_origin)")) {
    // ssoStart insert: flow is the inline literal 'sso'; values are [state, app_origin].
    store.states.set(values[0], { flow: "sso", user_id: "", app_origin: values[1] });
    return Promise.resolve([]);
  }
  if (q("insert into oauth_states (state, created_by, flow, user_id, app_origin)")) {
    store.states.set(values[0], { flow: values[2], user_id: values[3], app_origin: values[4] });
    return Promise.resolve([]);
  }
  if (q("select id, name, role from users")) {
    const sub = values[0], email = values[2];
    const hit = store.users
      .filter((u) => u.active)
      .filter((u) => (sub && u.google_sub === sub) || u.email.toLowerCase() === email || (u.google_email && u.google_email.toLowerCase() === email))
      .sort((a, b) => (b.google_sub === sub) - (a.google_sub === sub))[0];
    return Promise.resolve(hit ? [{ id: hit.id, name: hit.name, role: hit.role }] : []);
  }
  if (q("update users set google_sub=")) {
    const u = store.users.find((x) => x.id === values[2]);
    if (u) { u.google_sub = values[0]; u.google_email = values[1]; }
    return Promise.resolve([]);
  }
  if (q("insert into user_google_tokens")) {
    store.userTokens.set(values[0], { access_token: values[1], refresh_token: values[2], token_expiry: values[3], account_email: values[5] });
    return Promise.resolve([]);
  }
  if (q("delete from user_google_tokens")) { store.userTokens.delete(values[0]); return Promise.resolve([]); }
  if (q("from user_google_tokens where user_id=")) {
    const row = store.userTokens.get(values[0]);
    return Promise.resolve(row ? [{ ...row, updated_at: "2026-01-01" }] : []);
  }
  if (q("from integrations where provider=")) {
    return Promise.resolve(store.integrations ? [{ ...store.integrations, updated_at: "2026-01-01" }] : []);
  }
  if (q("insert into integrations")) {
    store.integrations = { access_token: values[0], refresh_token: values[1], token_expiry: values[2], account_email: values[4] };
    return Promise.resolve([]);
  }
  if (q("delete from integrations")) { store.integrations = null; return Promise.resolve([]); }
  throw new Error("sqlMock: unrouted query: " + text.slice(0, 120));
}

vi.mock("@netlify/neon", () => ({ neon: () => sqlMock }));
const handler = (await import("./google.js")).default;

// ---- Google endpoints mock ----
const googleAccount = { id: "sub-123", email: "nik@agency.com" };
vi.stubGlobal("fetch", async (url) => {
  const u = String(url);
  if (u.startsWith("https://oauth2.googleapis.com/token")) {
    return new Response(JSON.stringify({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "openid email" }), { status: 200 });
  }
  if (u.startsWith("https://www.googleapis.com/oauth2/v2/userinfo")) {
    return new Response(JSON.stringify(googleAccount), { status: 200 });
  }
  throw new Error("fetch mock: unrouted " + u);
});

const API = "https://growth-atlas-api.growth-atlas-nik.workers.dev";
const APP = "https://blueviolet-owl-311449.hostingersite.com";

const post = (action, payload = {}, headers = {}) =>
  handler(new Request(`${API}/api/google`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ action, payload }),
  }));

beforeEach(() => {
  process.env.APP_PASSWORD = "team-pw";
  process.env.SESSION_SECRET = "test-secret";
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "csec";
  process.env.NETLIFY_DATABASE_URL = "postgres://fake";
  process.env.ALLOWED_ORIGIN = APP;
  delete process.env.GOOGLE_REDIRECT_URI;
  store.states.clear();
  store.userTokens.clear();
  store.integrations = null;
  store.users = [
    { id: "user-1", name: "Nik", email: "nik@agency.com", role: "admin", active: true, google_sub: "", google_email: "" },
    { id: "user-2", name: "Sara", email: "sara@agency.com", role: "member", active: true, google_sub: "", google_email: "" },
  ];
});

const bearer = (sub, role = "member", name = "Nik") =>
  ({ authorization: `Bearer ${signToken({ sub, name, role }, "test-secret")}` });

describe("Sign in with Google (SSO)", () => {
  it("ssoStart is public, uses identity-only scopes and the single /api/google redirect URI", async () => {
    const res = await post("ssoStart", { app_origin: APP });
    expect(res.status).toBe(200);
    const { url } = await res.json();
    const u = new URL(url);
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("redirect_uri")).toBe(`${API}/api/google`);
    expect(u.searchParams.get("scope")).not.toContain("gmail");
    const state = u.searchParams.get("state");
    expect(store.states.get(state)).toMatchObject({ flow: "sso", app_origin: APP });
  });

  it("rejects a non-allowlisted app_origin (falls back to the API origin)", async () => {
    const res = await post("ssoStart", { app_origin: "https://evil.example.com" });
    const { url } = await res.json();
    const state = new URL(url).searchParams.get("state");
    expect(store.states.get(state).app_origin).toBe(API);
  });

  it("callback matches an existing user by email, persists sub, and returns the token in the fragment", async () => {
    const start = await (await post("ssoStart", { app_origin: APP })).json();
    const state = new URL(start.url).searchParams.get("state");
    const cb = await handler(new Request(`${API}/api/google?code=abc&state=${state}`));
    expect(cb.status).toBe(302);
    const loc = cb.headers.get("location");
    expect(loc.startsWith(`${APP}/#sso_token=`)).toBe(true);
    const token = decodeURIComponent(loc.split("#sso_token=")[1]);
    const payload = verifyToken(token, "test-secret");
    expect(payload).toMatchObject({ sub: "user-1", name: "Nik", role: "admin" });
    // Google identity persisted for reliable future matching.
    expect(store.users[0].google_sub).toBe("sub-123");
    // State is single-use.
    expect(store.states.has(state)).toBe(false);
  });

  it("callback with an unknown Google email redirects with sso=nouser and never creates an account", async () => {
    googleAccount.email = "stranger@example.com";
    googleAccount.id = "sub-999";
    const start = await (await post("ssoStart", { app_origin: APP })).json();
    const state = new URL(start.url).searchParams.get("state");
    const cb = await handler(new Request(`${API}/api/google?code=abc&state=${state}`));
    expect(cb.headers.get("location")).toBe(`${APP}/?sso=nouser`);
    expect(store.users.length).toBe(2);
    googleAccount.email = "nik@agency.com";
    googleAccount.id = "sub-123";
  });

  it("callback with an unknown state redirects to an error, issuing nothing", async () => {
    const cb = await handler(new Request(`${API}/api/google?code=abc&state=forged`));
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toBe(`${APP}/?google=error`);
  });
});

describe("Per-user Gmail/Calendar connect", () => {
  it("authUrl for a personal session starts a connect_user flow with Gmail+Calendar scopes", async () => {
    const res = await post("authUrl", { app_origin: APP }, bearer("user-2"));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    const u = new URL(url);
    expect(u.searchParams.get("scope")).toContain("gmail.readonly");
    expect(u.searchParams.get("scope")).toContain("calendar.events");
    expect(u.searchParams.get("access_type")).toBe("offline");
    const state = u.searchParams.get("state");
    expect(store.states.get(state)).toMatchObject({ flow: "connect_user", user_id: "user-2", app_origin: APP });
  });

  it("authUrl for a shared-password session asks the user to sign in personally", async () => {
    const res = await post("authUrl", {}, bearer("shared"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("personal account");
  });

  it("callback stores tokens keyed by the user id; status reports the CURRENT user's connection", async () => {
    const start = await (await post("authUrl", { app_origin: APP }, bearer("user-2"))).json();
    const state = new URL(start.url).searchParams.get("state");
    const cb = await handler(new Request(`${API}/api/google?code=abc&state=${state}`));
    expect(cb.headers.get("location")).toBe(`${APP}/?google=connected`);
    expect(store.userTokens.get("user-2")).toMatchObject({ refresh_token: "rt-1", account_email: "nik@agency.com" });

    const mine = await (await post("status", {}, bearer("user-2"))).json();
    expect(mine).toMatchObject({ user_account: true, user_connected: true, connected: true });
    const other = await (await post("status", {}, bearer("user-1"))).json();
    expect(other).toMatchObject({ user_account: true, user_connected: false, connected: false });
  });

  it("legacy workspace connect stays admin-only and acts as the fallback in status", async () => {
    const denied = await post("authUrl", { workspace: true }, bearer("user-2", "member"));
    expect(denied.status).toBe(403);
    const start = await (await post("authUrl", { workspace: true, app_origin: APP }, bearer("shared", "admin"))).json();
    const state = new URL(start.url).searchParams.get("state");
    await handler(new Request(`${API}/api/google?code=abc&state=${state}`));
    expect(store.integrations).toMatchObject({ refresh_token: "rt-1" });
    // A shared-password session can still USE Google features via the fallback.
    const s = await (await post("status", {}, bearer("shared", "admin"))).json();
    expect(s).toMatchObject({ user_account: false, user_connected: false, workspace_connected: true, connected: true });
  });

  it("disconnect removes only the current user's tokens; workspace disconnect is admin-only", async () => {
    store.userTokens.set("user-2", { access_token: "a", refresh_token: "r", token_expiry: null, account_email: "x@y.z" });
    store.integrations = { access_token: "a", refresh_token: "r", token_expiry: null, account_email: "ws@y.z" };
    const res = await post("disconnect", {}, bearer("user-2"));
    expect(res.status).toBe(200);
    expect(store.userTokens.has("user-2")).toBe(false);
    expect(store.integrations).not.toBeNull();
    const deniedWs = await post("disconnect", { workspace: true }, bearer("user-2", "member"));
    expect(deniedWs.status).toBe(403);
  });
});

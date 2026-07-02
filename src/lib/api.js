// Frontend data layer. Talks to the Netlify Function at /api/data, which owns
// the Netlify DB (Neon Postgres) connection. Replaces the old Supabase client.

const KEY = "ga_session";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function saveSession(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function signOut() { localStorage.removeItem(KEY); }

// Auth header for API calls. New sessions carry a signed token (sent as a
// Bearer header); sessions saved before the token rollout only have the shared
// password, so keep sending the legacy header until the next login — nobody
// gets force-signed-out by the upgrade.
export function authHeaders() {
  const s = getSession();
  if (s?.token) return { authorization: `Bearer ${s.token}` };
  if (s?.password) return { "x-app-password": s.password };
  return {};
}

async function call(action, payload) {
  const s = getSession();
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    // _actor = the display name shown in the activity log for this action.
    body: JSON.stringify({ action, payload: { ...payload, _actor: s?.name } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Two login flavors, one function: pass `email` to sign in with a personal
// account (email + password), omit it for the shared team password (name +
// password). Stores { name, role, token } — never the raw password, unless the
// server didn't return a token (older deploy) and we need the legacy fallback.
export async function login(name, password, email) {
  const payload = email
    ? { email: email.trim(), password }
    : { name: (name || "").trim(), password };
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "login", payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  const session = {
    name: data.name || (name || "").trim() || "Team member",
    role: data.role,
    ...(data.token ? { token: data.token } : { password }),
  };
  saveSession(session);
  return session;
}

export const load = () => call("load");
// Per-entity refresh: fetch only the named datasets (e.g. ["tasks"]) instead
// of the whole database. Same row shapes as `load`, keyed by dataset name.
export const loadSome = (sets) => call("loadSome", { sets });
export const saveClient = (c) => call("clientSave", c);
export const deleteClient = (id) => call("clientDelete", { id });
export const addTask = (t) => call("taskAdd", t);
export const moveTask = (id, status) => call("taskMove", { id, status });
export const assignTask = (id, assignee) => call("taskAssign", { id, assignee });
export const deleteTask = (id) => call("taskDelete", { id });
export const setPayment = (client_id, month, patch) => call("paymentSet", { client_id, month, ...patch });
// Stripe payment link for one client + month. Returns { url }; 503 with a
// friendly message when STRIPE_SECRET_KEY isn't configured.
export const createPaymentLink = (client_id, month) => call("paymentLinkCreate", { client_id, month });

/* ---------------- resources (links + uploaded files) ---------------- */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export const addResourceLink = (client_id, label, url) => call("resourceLinkAdd", { client_id, label, url });
export const deleteResource = (id) => call("resourceDelete", { id });

const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); // strip data: prefix
    reader.readAsDataURL(file);
  });

export async function uploadResourceFile(client_id, file, label) {
  if (file.size > MAX_FILE_BYTES) throw new Error("File too large (max 4 MB).");
  const dataBase64 = await readAsBase64(file);
  return call("resourceFileAdd", {
    client_id,
    label: label || file.name,
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size: file.size,
    dataBase64,
  });
}

// Download an uploaded file: fetch it with the auth header, then hand back a
// temporary object URL the browser can open or save.
export async function fetchFileObjectUrl(blobKey) {
  const res = await fetch(`/api/data?key=${encodeURIComponent(blobKey)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Download failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return URL.createObjectURL(await res.blob());
}

/* ---------------- deliverables ---------------- */
export const createDeliverable = (d) => call("deliverableCreate", d);
export const updateDeliverable = (d) => call("deliverableUpdate", d);
export const deleteDeliverable = (id) => call("deliverableDelete", { id });
// Top up a month's deliverables to the retainer scope. Payload is either
// { client_id, month } or { all: true, month }; returns { ok, created }.
export const generateMonthDeliverables = (p) => call("deliverablesGenerateMonth", p);

/* ---------------- backlinks (link building tracker) ---------------- */
export const createBacklink = (b) => call("backlinkCreate", b);
export const updateBacklink = (b) => call("backlinkUpdate", b);
export const deleteBacklink = (id) => call("backlinkDelete", { id });

/* ---------------- AI visibility (AEO citation tracking) ---------------- */
export const createAiCitation = (c) => call("aiCitationCreate", c);
export const updateAiCitation = (c) => call("aiCitationUpdate", c);
export const deleteAiCitation = (id) => call("aiCitationDelete", { id });

/* ---------------- keywords (rank tracking) ---------------- */
export const createKeyword = (k) => call("keywordCreate", k);
export const updateKeyword = (k) => call("keywordUpdate", k);
export const deleteKeyword = (id) => call("keywordDelete", { id });
// Bulk add: { client_id, target_url, keywords: [...], search_engine, location, platform }
export const bulkAddKeywords = (p) => call("keywordsBulkAdd", p);
export const bulkDeleteKeywords = (ids) => call("keywordsBulkDelete", { ids });
export const starKeyword = (id, starred) => call("keywordStar", { id, starred });
// Full rank history for one keyword — `load` only ships the last 25 points.
export const fetchKeywordHistory = (keyword_id) => call("keywordHistory", { keyword_id });

/* ---------------- Google Search Console (organic performance) ---------------- */
// Per-client GSC data, fetched lazily by the detail view: { daily, queries, month }.
// daily = last 90 days of gsc_daily; queries = top queries for `month`
// ('YYYY-MM', optional — defaults to the latest month that has rows).
export const gscLoad = (client_id, month) => call("gscLoad", { client_id, month });

/* ---------------- monthly reports (per-client narrative) ---------------- */
export const saveReport = (client_id, period, summary) => call("reportSave", { client_id, period, summary });
export const deleteReport = (id) => call("reportDelete", { id });

/* ---------------- retainers (agreed monthly scope per client) ---------------- */
export const saveRetainer = (client_id, type, quantity) => call("retainerSave", { client_id, type, quantity });
export const deleteRetainer = (id) => call("retainerDelete", { id });

/* ---------------- team members (assignee roster) ---------------- */
export const createMember = (m) => call("teamAdd", m);
export const updateMember = (m) => call("teamUpdate", m);
export const deleteMember = (id) => call("teamDelete", { id });

/* ---------------- client portal (read-only share links) ---------------- */
export const getPortalToken = (client_id) => call("portalTokenGet", { client_id });
export const createPortalToken = (client_id) => call("portalTokenCreate", { client_id });
export const setPortalTokenEnabled = (client_id, enabled) => call("portalTokenSetEnabled", { client_id, enabled });

// Public portal load: the token IS the credential, so no password header —
// clients open their link without a team session.
export async function portalLoad(token) {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "portalLoad", payload: { token } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- user accounts (admin-only management) ---------------- */
export const userList = () => call("userList");
// { id?, name, email, role, active, password? } — password required on create,
// blank on update = leave unchanged.
export const saveUser = (u) => call("userSave", u);
export const deleteUser = (id) => call("userDelete", { id });

/* ---------------- monthly report email recipient ---------------- */
export const getReportEmail = (client_id) => call("reportEmailGet", { client_id });
export const setReportEmail = (client_id, recipient, enabled) => call("reportEmailSet", { client_id, recipient, enabled });

/* ---------------- activity log (client interaction timeline) ---------------- */
export const addActivity = (a) => call("activityAdd", a);
export const deleteActivity = (id) => call("activityDelete", { id });
export const setActivityFollowup = (id, follow_up_date) => call("activityFollowupSet", { id, follow_up_date });

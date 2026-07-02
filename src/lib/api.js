// Frontend data layer. Talks to the Netlify Function at /api/data, which owns
// the Netlify DB (Neon Postgres) connection. Replaces the old Supabase client.

const KEY = "ga_session";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function saveSession(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function signOut() { localStorage.removeItem(KEY); }

async function call(action, payload) {
  const s = getSession();
  const res = await fetch("/api/data", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(s?.password ? { "x-app-password": s.password } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function login(name, password) {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "login", payload: { password } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  const session = { name: (name || "").trim() || "Team member", role: data.role, password };
  saveSession(session);
  return session;
}

export const load = () => call("load");
export const saveClient = (c) => call("clientSave", c);
export const deleteClient = (id) => call("clientDelete", { id });
export const addTask = (t) => call("taskAdd", t);
export const moveTask = (id, status) => call("taskMove", { id, status });
export const deleteTask = (id) => call("taskDelete", { id });
export const setPayment = (client_id, month, patch) => call("paymentSet", { client_id, month, ...patch });

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
  const s = getSession();
  const res = await fetch(`/api/data?key=${encodeURIComponent(blobKey)}`, {
    headers: { ...(s?.password ? { "x-app-password": s.password } : {}) },
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

/* ---------------- keywords (rank tracking) ---------------- */
export const createKeyword = (k) => call("keywordCreate", k);
export const updateKeyword = (k) => call("keywordUpdate", k);
export const deleteKeyword = (id) => call("keywordDelete", { id });
// Bulk add: { client_id, target_url, keywords: [...], search_engine, location, platform }
export const bulkAddKeywords = (p) => call("keywordsBulkAdd", p);
export const bulkDeleteKeywords = (ids) => call("keywordsBulkDelete", { ids });
export const starKeyword = (id, starred) => call("keywordStar", { id, starred });

/* ---------------- monthly reports (per-client narrative) ---------------- */
export const saveReport = (client_id, period, summary) => call("reportSave", { client_id, period, summary });
export const deleteReport = (id) => call("reportDelete", { id });

/* ---------------- retainers (agreed monthly scope per client) ---------------- */
export const saveRetainer = (client_id, type, quantity) => call("retainerSave", { client_id, type, quantity });
export const deleteRetainer = (id) => call("retainerDelete", { id });

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

/* ---------------- monthly report email recipient ---------------- */
export const getReportEmail = (client_id) => call("reportEmailGet", { client_id });
export const setReportEmail = (client_id, recipient, enabled) => call("reportEmailSet", { client_id, recipient, enabled });

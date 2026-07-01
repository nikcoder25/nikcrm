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

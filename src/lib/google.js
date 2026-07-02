// Frontend client for the Google integration function at /api/google.
// Reuses lib/api.js's auth headers (Bearer session token, or the legacy
// password header for pre-token sessions). Tokens live server-side; these
// calls only ever move status + sync results.
import { authHeaders, API_BASE } from "./api";

async function gcall(action, payload) {
  const res = await fetch(`${API_BASE}/api/google`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
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

export const googleStatus = () => gcall("status");
export const googleAuthUrl = (by) => gcall("authUrl", { by });
export const googleDisconnect = () => gcall("disconnect");
export const pushToCalendar = (activity_id) => gcall("calendarPush", { activity_id });
export const syncGmail = (client_id) => gcall("gmailSync", { client_id });

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
// Connect Gmail/Calendar: the CURRENT USER's account by default; pass
// workspace=true (admin only) for the legacy workspace-wide fallback. The app
// origin rides along so the OAuth callback can bounce back to this site even
// when the API lives on another origin (Cloudflare Worker + static frontend).
export const googleAuthUrl = (by, workspace = false) => gcall("authUrl", { by, workspace, app_origin: window.location.origin });
export const googleDisconnect = (workspace = false) => gcall("disconnect", { workspace });
export const pushToCalendar = (activity_id) => gcall("calendarPush", { activity_id });
export const syncGmail = (client_id) => gcall("gmailSync", { client_id });
// Public (no session yet): start "Sign in with Google" from the login screen.
export const googleSsoUrl = () => gcall("ssoStart", { app_origin: window.location.origin });

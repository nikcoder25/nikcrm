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

/* ---------------- Search Console (per-user) ----------------
   Sites and Search Analytics fetched with the CURRENT USER's OAuth token
   (server-side; the browser only ever sees the resulting numbers). */
export const gscSites = () => gcall("gscSites");                                  // live list from Google
export const gscSiteList = () => gcall("gscSiteList");                            // imported into Websites
export const gscSiteAdd = (site_url) => gcall("gscSiteAdd", { site_url });
export const gscSiteRemove = (site_url) => gcall("gscSiteRemove", { site_url });
export const gscSiteData = (site_url, force = false) => gcall("gscSiteData", { site_url, force });
export const gscAttach = (client_id, site_url) => gcall("gscAttach", { client_id, site_url });
export const gscDetach = (client_id) => gcall("gscDetach", { client_id });
// Organic data for a client: per-user attached site first, service-account
// tables as the fallback. Replaces direct gscLoad calls in the client views.
export const gscClientData = (client_id, month) => gcall("gscClientData", { client_id, month });

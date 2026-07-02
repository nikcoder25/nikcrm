/* global process, Buffer, fetch, URLSearchParams */

// Google service-account auth — plain node:crypto + fetch, no SDK, so the
// scheduled functions add zero dependencies. Configure with:
//   GSC_SERVICE_ACCOUNT_JSON   the full JSON key of one Google Cloud service
//                              account (Search Console access is granted by
//                              adding its client_email as a user on each
//                              property; callers no-op without it).

import { createSign } from "node:crypto";

// Parsed credentials, or null when the env var is missing/invalid. Parsed on
// every call on purpose — it's cheap and keeps the failure mode obvious.
function credentials() {
  try {
    const parsed = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON || "");
    if (parsed && typeof parsed === "object" && parsed.client_email && parsed.private_key) return parsed;
  } catch { /* not JSON — treated as unconfigured */ }
  return null;
}

export function gscConfigured() {
  return Boolean(credentials());
}

const b64url = (s) => Buffer.from(s).toString("base64url");

// One cached token per warm instance, keyed by the scope set, refreshed when
// less than ~5 minutes of its lifetime remain.
let cached = null; // { scopeKey, token, expiresAt }
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Exchange a self-signed service-account JWT (RS256) for an OAuth2 access
// token. Only call once gscConfigured() is true; throws with Google's own
// error message on failure so callers can log something actionable.
export async function googleAccessToken(scopes) {
  const scopeKey = scopes.join(" ");
  if (cached && cached.scopeKey === scopeKey && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
    return cached.token;
  }
  const creds = credentials();
  if (!creds) throw new Error("GSC_SERVICE_ACCOUNT_JSON is not configured or invalid.");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: creds.client_email,
    scope: scopeKey,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(creds.private_key, "base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google token exchange failed (HTTP ${res.status})`);
  }
  cached = {
    scopeKey,
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return cached.token;
}

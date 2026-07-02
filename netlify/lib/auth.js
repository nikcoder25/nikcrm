// Pure auth helpers shared by the API function: scrypt password hashing and
// signed stateless session tokens. Uses node:crypto only and takes the signing
// secret as an argument, so it has no Netlify/env dependencies and is
// unit-testable (see auth.test.js).
import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ---------------- passwords (scrypt) ---------------- */

// New salt + hash pair for storing a password. Both are hex strings.
export function newPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, SCRYPT_KEYLEN).toString("hex");
  return { salt, hash };
}

// Constant-time verify against a stored salt + hex hash. Any malformed input
// (bad hex, empty salt, ...) counts as a failed match, never a crash.
export function verifyPassword(password, salt, expectedHex) {
  try {
    const got = scryptSync(String(password), String(salt), SCRYPT_KEYLEN);
    const want = Buffer.from(String(expectedHex), "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

/* ---------------- session tokens ---------------- */
// Stateless signed token, no session table:
//   base64url(JSON {sub, name, role, exp}) + "." + base64url(HMAC-SHA256(payload))
// sub is a user id or "shared" (shared team-password sessions).

const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest();

export function signToken({ sub, name, role }, secret, ttlMs = SESSION_TTL_MS) {
  const payload = Buffer.from(JSON.stringify({ sub, name, role, exp: Date.now() + ttlMs }))
    .toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

// Returns the decoded payload {sub, name, role, exp} for a valid, unexpired
// token, or null. Signature check is constant-time.
export function verifyToken(token, secret) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const want = sign(payload, secret);
  let got;
  try { got = Buffer.from(sig, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
  if (data.role !== "admin" && data.role !== "member") return null;
  return data;
}

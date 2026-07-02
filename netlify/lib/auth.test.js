import { describe, it, expect } from "vitest";
import { newPasswordRecord, verifyPassword, signToken, verifyToken, SESSION_TTL_MS } from "./auth.js";

describe("password hashing (scrypt)", () => {
  it("verifies the password it hashed", () => {
    const { salt, hash } = newPasswordRecord("hunter2hunter2");
    expect(verifyPassword("hunter2hunter2", salt, hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const { salt, hash } = newPasswordRecord("correct horse");
    expect(verifyPassword("battery staple", salt, hash)).toBe(false);
  });

  it("salts: same password twice gives different salt and hash", () => {
    const a = newPasswordRecord("same-password");
    const b = newPasswordRecord("same-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(verifyPassword("same-password", b.salt, b.hash)).toBe(true);
  });

  it("fails closed on malformed stored values", () => {
    expect(verifyPassword("x", "", "")).toBe(false);
    expect(verifyPassword("x", "abcd", "not-hex-at-all")).toBe(false);
    expect(verifyPassword("x", null, undefined)).toBe(false);
  });
});

describe("session tokens", () => {
  const SECRET = "test-secret";

  it("round-trips sub / name / role and sets a ~30d expiry", () => {
    const before = Date.now();
    const token = signToken({ sub: "shared", name: "Vivek", role: "admin" }, SECRET);
    const data = verifyToken(token, SECRET);
    expect(data).toMatchObject({ sub: "shared", name: "Vivek", role: "admin" });
    expect(data.exp).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
    expect(data.exp).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signToken({ sub: "u1", name: "A", role: "member" }, "other-secret");
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered payload (e.g. role escalation)", () => {
    const token = signToken({ sub: "u1", name: "A", role: "member" }, SECRET);
    const [payload, sig] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const forged = Buffer.from(JSON.stringify({ ...decoded, role: "admin" })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signToken({ sub: "u1", name: "A", role: "member" }, SECRET, -1000);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it("rejects unknown roles even when correctly signed", () => {
    const token = signToken({ sub: "u1", name: "A", role: "superadmin" }, SECRET);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifyToken("", SECRET)).toBeNull();
    expect(verifyToken(null, SECRET)).toBeNull();
    expect(verifyToken("just-one-part", SECRET)).toBeNull();
    expect(verifyToken("a.b.c", SECRET)).toBeNull();
    expect(verifyToken("!!!.???", SECRET)).toBeNull();
  });
});

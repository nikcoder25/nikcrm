import { describe, it, expect } from "vitest";
import { clientIdFromPath, clientPath, portalTokenFromPath, portalPath } from "./router.js";

describe("clientIdFromPath", () => {
  it("extracts the id from /clients/:id (with or without trailing slash)", () => {
    expect(clientIdFromPath("/clients/abc-123")).toBe("abc-123");
    expect(clientIdFromPath("/clients/abc-123/")).toBe("abc-123");
  });
  it("returns null for other paths", () => {
    expect(clientIdFromPath("/")).toBe(null);
    expect(clientIdFromPath("/clients")).toBe(null);
    expect(clientIdFromPath("/clients/a/b")).toBe(null);
  });
});

describe("portalTokenFromPath", () => {
  it("extracts the token from /portal/:token (with or without trailing slash)", () => {
    expect(portalTokenFromPath("/portal/deadbeef01")).toBe("deadbeef01");
    expect(portalTokenFromPath("/portal/deadbeef01/")).toBe("deadbeef01");
  });
  it("returns null for other paths", () => {
    expect(portalTokenFromPath("/")).toBe(null);
    expect(portalTokenFromPath("/portal")).toBe(null);
    expect(portalTokenFromPath("/portal/a/b")).toBe(null);
    expect(portalTokenFromPath("/clients/abc")).toBe(null);
    expect(portalTokenFromPath("")).toBe(null);
  });
  it("round-trips with portalPath / clientPath", () => {
    expect(portalTokenFromPath(portalPath("t0k3n"))).toBe("t0k3n");
    expect(clientIdFromPath(clientPath("abc-123"))).toBe("abc-123");
  });
});

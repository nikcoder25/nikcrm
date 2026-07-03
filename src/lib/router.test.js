import { describe, it, expect } from "vitest";
import { clientIdFromPath, clientTabFromPath, clientPath, portalTokenFromPath, portalPath, websiteFromPath, websitePath } from "./router.js";

describe("websiteFromPath", () => {
  it("round-trips Search Console site URLs (colons and slashes included)", () => {
    expect(websiteFromPath(websitePath("sc-domain:example.com"))).toBe("sc-domain:example.com");
    expect(websiteFromPath(websitePath("https://example.com/"))).toBe("https://example.com/");
  });
  it("returns null for other paths", () => {
    expect(websiteFromPath("/websites")).toBe(null);
    expect(websiteFromPath("/clients/abc")).toBe(null);
    expect(websiteFromPath("/")).toBe(null);
  });
});

describe("clientIdFromPath", () => {
  it("extracts the id from /clients/:id (with or without trailing slash)", () => {
    expect(clientIdFromPath("/clients/abc-123")).toBe("abc-123");
    expect(clientIdFromPath("/clients/abc-123/")).toBe("abc-123");
  });
  it("extracts the id from /clients/:id/:tab", () => {
    expect(clientIdFromPath("/clients/abc-123/seo")).toBe("abc-123");
    expect(clientIdFromPath("/clients/abc-123/seo/")).toBe("abc-123");
  });
  it("returns null for other paths", () => {
    expect(clientIdFromPath("/")).toBe(null);
    expect(clientIdFromPath("/clients")).toBe(null);
    expect(clientIdFromPath("/clients/a/b/c")).toBe(null);
  });
});

describe("clientTabFromPath", () => {
  it("extracts the tab from /clients/:id/:tab", () => {
    expect(clientTabFromPath("/clients/abc-123/seo")).toBe("seo");
    expect(clientTabFromPath("/clients/abc-123/report/")).toBe("report");
  });
  it("returns null without a tab segment", () => {
    expect(clientTabFromPath("/clients/abc-123")).toBe(null);
    expect(clientTabFromPath("/clients/abc-123/")).toBe(null);
    expect(clientTabFromPath("/")).toBe(null);
  });
  it("round-trips with clientPath, keeping the default tab off the URL", () => {
    expect(clientPath("abc-123", "overview")).toBe("/clients/abc-123");
    expect(clientPath("abc-123", "seo")).toBe("/clients/abc-123/seo");
    expect(clientTabFromPath(clientPath("abc-123", "seo"))).toBe("seo");
    expect(clientIdFromPath(clientPath("abc-123", "seo"))).toBe("abc-123");
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

import { describe, it, expect } from "vitest";
import { allowedAppOrigins, resolveAppOrigin } from "../google.js";

// The OAuth callback redirects the browser to the "app origin" recorded when
// the flow started — for SSO that redirect carries a session token, so ONLY
// the API's own origin and the ALLOWED_ORIGIN list may ever be accepted.
describe("resolveAppOrigin", () => {
  const api = "https://growth-atlas-app.netlify.app";
  const allowed = "https://blueviolet-owl-311449.hostingersite.com, https://crm.example.com/";

  it("accepts the API's own origin (Netlify same-origin deploy)", () => {
    expect(resolveAppOrigin(api, api, "")).toBe(api);
  });
  it("accepts origins from ALLOWED_ORIGIN, ignoring spaces and trailing slashes", () => {
    expect(resolveAppOrigin("https://blueviolet-owl-311449.hostingersite.com", api, allowed))
      .toBe("https://blueviolet-owl-311449.hostingersite.com");
    expect(resolveAppOrigin("https://crm.example.com", api, allowed)).toBe("https://crm.example.com");
    expect(resolveAppOrigin("https://crm.example.com/", api, allowed)).toBe("https://crm.example.com");
  });
  it("rejects any other origin — no open redirect for session tokens", () => {
    expect(resolveAppOrigin("https://evil.example.com", api, allowed)).toBe("");
    expect(resolveAppOrigin("https://crm.example.com.evil.com", api, allowed)).toBe("");
    expect(resolveAppOrigin("", api, allowed)).toBe("");
    expect(resolveAppOrigin(null, api, allowed)).toBe("");
  });
  it("never treats the '*' CORS wildcard as a redirectable origin", () => {
    expect(resolveAppOrigin("*", api, "*")).toBe("");
    expect(allowedAppOrigins(api, "*")).toEqual([api]);
  });
});

import { describe, it, expect } from "vitest";
import { money, ym, ymLabel, todayStr, isPastDue, timeAgo } from "./format.js";

describe("money", () => {
  it("formats numbers with a dollar sign", () => {
    expect(money(1500)).toBe("$1,500");
  });
  it("treats junk as zero", () => {
    expect(money(undefined)).toBe("$0");
    expect(money("abc")).toBe("$0");
  });
});

describe("ym / ymLabel", () => {
  it("formats a date as YYYY-MM", () => {
    expect(ym(new Date(2026, 6, 2))).toBe("2026-07");
  });
  it("labels a month string", () => {
    expect(ymLabel("2026-07")).toBe("Jul 2026");
    expect(ymLabel("")).toBe("");
  });
});

describe("isPastDue", () => {
  it("is true strictly before today, false today and later", () => {
    expect(isPastDue("2000-01-01")).toBe(true);
    expect(isPastDue(todayStr())).toBe(false);
    expect(isPastDue("2999-12-31")).toBe(false);
    expect(isPastDue(null)).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-07-02T12:00:00Z");
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  it("buckets by age", () => {
    expect(timeAgo(ago(30 * 1000), now)).toBe("just now");
    expect(timeAgo(ago(2 * 60 * 1000), now)).toBe("2m ago");
    expect(timeAgo(ago(3 * 3600 * 1000), now)).toBe("3h ago");
    expect(timeAgo(ago(30 * 3600 * 1000), now)).toBe("yesterday");
  });
  it("falls back to a short date beyond two days", () => {
    expect(timeAgo("2026-06-01T12:00:00Z", now)).toMatch(/Jun 1, 2026/);
  });
  it("returns empty for junk and never goes negative", () => {
    expect(timeAgo("not a date", now)).toBe("");
    expect(timeAgo(ago(-60 * 1000), now)).toBe("just now"); // slight clock skew
  });
});

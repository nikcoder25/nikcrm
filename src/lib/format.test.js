import { describe, it, expect } from "vitest";
import { money, ym, ymLabel, todayStr, isPastDue } from "./format.js";

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

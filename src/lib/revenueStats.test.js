import { describe, it, expect } from "vitest";
import { ymOf, monthKeys, revenueByMonth, clientsByMonth, ordersByMonth, pipelineFunnel, revenueBySource, sourceBreakdown, deltaPct } from "./revenueStats";

describe("revenueStats", () => {
  it("ymOf handles dates and timestamps", () => {
    expect(ymOf("2026-07-03")).toBe("2026-07");
    expect(ymOf("2026-07-03T14:22:00.000Z")).toBe("2026-07");
    expect(ymOf("")).toBe("");
    expect(ymOf(null)).toBe("");
  });

  it("monthKeys returns the last n months oldest-first, ending at ref", () => {
    expect(monthKeys(4, new Date(2026, 6, 15))).toEqual(["2026-04", "2026-05", "2026-06", "2026-07"]);
    // crosses a year boundary
    expect(monthKeys(3, new Date(2026, 1, 1))).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("revenueByMonth splits collected vs pending and ignores out-of-window months", () => {
    const months = ["2026-06", "2026-07"];
    const pays = [
      { month: "2026-06", amount: 100, status: "paid" },
      { month: "2026-06", amount: 50, status: "pending" },
      { month: "2026-07", amount: 200, status: "overdue" }, // not paid → pending bucket
      { month: "2026-05", amount: 999, status: "paid" },     // outside window → dropped
    ];
    expect(revenueByMonth(pays, months)).toEqual([
      { month: "2026-06", collected: 100, pending: 50, billed: 150 },
      { month: "2026-07", collected: 0, pending: 200, billed: 200 },
    ]);
  });

  it("clientsByMonth counts intake and a true cumulative total", () => {
    const months = ["2026-06", "2026-07"];
    const clients = [
      { created_at: "2026-05-10T00:00:00Z" }, // predates window → seeds cumulative
      { created_at: "2026-06-02T00:00:00Z" },
      { created_at: "2026-06-20T00:00:00Z" },
      { created_at: "2026-07-05T00:00:00Z" },
    ];
    expect(clientsByMonth(clients, months)).toEqual([
      { month: "2026-06", added: 2, total: 3 },
      { month: "2026-07", added: 1, total: 4 },
    ]);
  });

  it("ordersByMonth attributes starts+value by start_date and deliveries by end_date", () => {
    const months = ["2026-06", "2026-07"];
    const orders = [
      { status: "in_progress", start_date: "2026-06-01", end_date: "2026-07-10", price: 500 },
      { status: "delivered", start_date: "2026-06-15", end_date: "2026-06-28", price: 300 },
      { status: "not_started", start_date: "2026-07-02", end_date: "2026-07-20", price: 0 },
      { status: "finished", start_date: "2026-05-01", end_date: "2026-07-03", price: 999 }, // start out of window, delivery in
    ];
    expect(ordersByMonth(orders, months)).toEqual([
      { month: "2026-06", started: 2, delivered: 1, value: 800 },
      { month: "2026-07", started: 1, delivered: 1, value: 0 },
    ]);
  });

  it("pipelineFunnel counts every stage in order", () => {
    const clients = [
      { status: "lead" }, { status: "lead" }, { status: "active" }, { status: "loss" }, { status: "active" },
    ];
    expect(pipelineFunnel(clients)).toEqual([
      { status: "lead", count: 2 }, { status: "upcoming", count: 0 }, { status: "active", count: 2 },
      { status: "paused", count: 0 }, { status: "ended", count: 0 }, { status: "loss", count: 1 },
    ]);
  });

  it("revenueBySource sums active-client fees per source, richest first", () => {
    const clients = [
      { status: "active", source: "Fiverr", fee: 500 },
      { status: "active", source: "Direct", fee: 900 },
      { status: "active", source: "Fiverr", fee: 300 },
      { status: "paused", source: "Direct", fee: 999 }, // not active → excluded
      { status: "active", fee: 100 },                    // no source → Other
    ];
    expect(revenueBySource(clients)).toEqual([
      { source: "Direct", mrr: 900 },
      { source: "Fiverr", mrr: 800 },
      { source: "Other", mrr: 100 },
    ]);
  });

  it("sourceBreakdown merges client MRR and order count/value per source", () => {
    const clients = [
      { status: "active", source: "Fiverr", fee: 500 },
      { status: "active", source: "Direct", fee: 900 },
      { status: "paused", source: "Direct", fee: 999 }, // not active → no MRR
    ];
    const orders = [
      { source: "Fiverr", price: 1200 },
      { source: "Fiverr", price: 300 },
      { source: "Direct", price: 400 },
      { source: undefined, price: 100 }, // → "Other"
    ];
    expect(sourceBreakdown(clients, orders)).toEqual([
      { source: "Fiverr", mrr: 500, orderCount: 2, orderValue: 1500 },   // 500+1500 = 2000
      { source: "Direct", mrr: 900, orderCount: 1, orderValue: 400 },     // 900+400 = 1300
      { source: "Other", mrr: 0, orderCount: 1, orderValue: 100 },        // 0+100 = 100
    ]);
  });

  it("sourceBreakdown treats a non-admin's price-less orders as zero value", () => {
    const rows = sourceBreakdown([], [{ source: "Fiverr" }, { source: "Fiverr" }]);
    expect(rows).toEqual([{ source: "Fiverr", mrr: 0, orderCount: 2, orderValue: 0 }]);
  });

  it("deltaPct is whole-percent and null when there's no base", () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    expect(deltaPct(50, 0)).toBe(null);
    expect(deltaPct(0, 0)).toBe(null);
  });
});

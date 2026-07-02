import { describe, it, expect } from "vitest";
import { deliverableMonth, deliveredCount, scopeRows, isOverScope } from "./scope.js";

const CLIENT = "c1";
const month = "2026-07";
const d = (over = {}) => ({
  client_id: CLIENT, type: "blog", status: "delivered", due_date: "2026-07-15", ...over,
});

describe("deliverableMonth", () => {
  it("prefers the explicit month field", () => {
    expect(deliverableMonth({ month: "2026-07", due_date: "2026-06-30" })).toBe("2026-07");
  });
  it("falls back to the due date's month for legacy rows", () => {
    expect(deliverableMonth({ month: "", due_date: "2026-07-15" })).toBe("2026-07");
    expect(deliverableMonth({ due_date: "2026-07-15" })).toBe("2026-07");
  });
  it("is unattributed without a month or due date", () => {
    expect(deliverableMonth({ month: "", due_date: null })).toBe("");
    expect(deliverableMonth({})).toBe("");
  });
});

describe("deliveredCount", () => {
  it("counts only delivered items of the type in the month", () => {
    const deliverables = [
      d(),
      d({ status: "planned" }),            // wrong status
      d({ type: "guest" }),                // wrong type
      d({ due_date: "2026-06-30" }),       // wrong month
      d({ client_id: "other" }),           // wrong client
      d({ due_date: null }),               // no due date or month -> not attributed
      d({ month: "2026-06" }),             // explicit month overrides due_date
    ];
    expect(deliveredCount(deliverables, CLIENT, "blog", month)).toBe(1);
  });

  it("attributes by explicit month even when due_date disagrees or is missing", () => {
    const deliverables = [
      d({ month: "2026-07", due_date: "2026-06-30" }),
      d({ month: "2026-07", due_date: null }),
    ];
    expect(deliveredCount(deliverables, CLIENT, "blog", month)).toBe(2);
  });
});

describe("scopeRows", () => {
  const retainers = [{ id: "r1", client_id: CLIENT, type: "blog", quantity: 2 }];

  it("flags under scope", () => {
    expect(scopeRows(retainers, [d()], CLIENT, month)[0]).toMatchObject({ state: "under", delta: -1 });
  });
  it("flags complete when delivered equals included", () => {
    expect(scopeRows(retainers, [d(), d()], CLIENT, month)[0]).toMatchObject({ state: "complete", delta: 0 });
  });
  it("flags over scope (scope creep)", () => {
    expect(scopeRows(retainers, [d(), d(), d()], CLIENT, month)[0]).toMatchObject({ state: "over", delta: 1 });
  });
  it("ignores other clients' retainers", () => {
    expect(scopeRows([{ ...retainers[0], client_id: "other" }], [d()], CLIENT, month)).toEqual([]);
  });
});

describe("isOverScope", () => {
  it("is true only when some line is over", () => {
    const retainers = [{ id: "r1", client_id: CLIENT, type: "blog", quantity: 1 }];
    expect(isOverScope(retainers, [d()], CLIENT, month)).toBe(false);
    expect(isOverScope(retainers, [d(), d()], CLIENT, month)).toBe(true);
  });
});

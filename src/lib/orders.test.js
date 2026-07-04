import { describe, it, expect } from "vitest";
import { isArchived, splitOrders, ARCHIVE_STATUS, RESTORE_STATUS } from "./orders";
import { ordersCsv } from "./csv";
import { orderStatusLabel, ORDER_STATES } from "./constants";

const mk = (id, status, extra = {}) => ({ id, name: `order-${id}`, status, source: "Direct", ...extra });

describe("order archiving", () => {
  it("treats only 'archived' orders as archived (Reviewed/Revision stay active)", () => {
    expect(isArchived(mk(1, "archived"))).toBe(true);
    expect(isArchived(mk(2, "reviewed"))).toBe(false);
    expect(isArchived(mk(3, "revision"))).toBe(false);
    expect(isArchived(mk(4, "delivered"))).toBe(false);
    expect(isArchived({})).toBe(false);
    expect(ARCHIVE_STATUS).toBe("archived");
    expect(RESTORE_STATUS).toBe("delivered");
  });

  it("splits a flat list into active and archived, preserving every row", () => {
    const orders = [mk(1, "delivered"), mk(2, "archived"), mk(3, "revision"), mk(4, "archived")];
    const { active, archived } = splitOrders(orders);
    expect(active.map((o) => o.id)).toEqual([1, 3]);
    expect(archived.map((o) => o.id)).toEqual([2, 4]);
    // Restoring an archived order lands it on an active (non-archived) status.
    expect(isArchived({ ...archived[0], status: RESTORE_STATUS })).toBe(false);
  });

  it("Revision, Reviewed and Archive are real order statuses", () => {
    expect(orderStatusLabel("revision")).toBe("Revision");
    expect(orderStatusLabel("reviewed")).toBe("Reviewed");
    expect(orderStatusLabel("archived")).toBe("Archive");
    const keys = ORDER_STATES.map((s) => s.key);
    expect(keys).toEqual(["not_started", "in_progress", "finished", "delivered", "revision", "reviewed", "archived"]);
  });
});

describe("ordersCsv archived column", () => {
  it("adds an Archived column with yes/no per row", () => {
    const csv = ordersCsv([mk(1, "archived"), mk(2, "delivered")]);
    const [header, r1, r2] = csv.split("\r\n");
    const cols = header.split(",");
    const idx = cols.indexOf("Archived");
    expect(idx).toBeGreaterThan(-1);
    expect(r1.split(",")[idx]).toBe("yes");
    expect(r2.split(",")[idx]).toBe("no");
  });
});

import { describe, it, expect } from "vitest";
import { parseQuickTask, parseDate, matchClient, matchAssignee } from "./quickparse";

// Fixed reference point: Wednesday, 2026-07-01 (local).
const NOW = new Date(2026, 6, 1);

const clients = [
  { id: "c1", name: "Ridgeline HVAC" },
  { id: "c2", name: "Green Bay Moving Co" },
  { id: "c3", name: "idaho" },
];
const members = [{ name: "zach_komorowski" }, { name: "jw_west" }];
const ctx = { clients, members };

describe("parseDate", () => {
  it("today / tomorrow", () => {
    expect(parseDate("ship today", NOW).date).toBe("2026-07-01");
    expect(parseDate("ship tomorrow", NOW).date).toBe("2026-07-02");
  });
  it("weekday (this coming one)", () => {
    // Wed 07-01 → Friday is 07-03
    expect(parseDate("due friday", NOW).date).toBe("2026-07-03");
  });
  it("bare weekday on the same day resolves to today", () => {
    expect(parseDate("wednesday", NOW).date).toBe("2026-07-01");
  });
  it("next weekday jumps a week", () => {
    expect(parseDate("next friday", NOW).date).toBe("2026-07-10");
  });
  it("in N days / weeks", () => {
    expect(parseDate("in 3 days", NOW).date).toBe("2026-07-04");
    expect(parseDate("in 2 weeks", NOW).date).toBe("2026-07-15");
  });
  it("month-name dates, both orders", () => {
    expect(parseDate("jul 10", NOW).date).toBe("2026-07-10");
    expect(parseDate("10 jul", NOW).date).toBe("2026-07-10");
    expect(parseDate("23 jan 2027", NOW).date).toBe("2027-01-23");
  });
  it("a bare month/day already past rolls to next year", () => {
    // June 5 is before July 1 → next year
    expect(parseDate("jun 5", NOW).date).toBe("2027-06-05");
  });
  it("ISO and numeric day/month", () => {
    expect(parseDate("2026-08-15", NOW).date).toBe("2026-08-15");
    expect(parseDate("15/08", NOW).date).toBe("2026-08-15");
    expect(parseDate("15/08/2027", NOW).date).toBe("2027-08-15");
  });
  it("returns null when there is no date", () => {
    expect(parseDate("guest post on example.com", NOW)).toBeNull();
  });
});

describe("matchClient / matchAssignee", () => {
  it("fuzzy client match", () => {
    expect(matchClient("ridgeline", clients).id).toBe("c1");
    expect(matchClient("green bay", clients).id).toBe("c2");
    expect(matchClient("nope", clients)).toBeNull();
  });
  it("assignee matches roster, else keeps typed value", () => {
    expect(matchAssignee("zach", members)).toBe("zach_komorowski");
    expect(matchAssignee("someoneelse", members)).toBe("someoneelse");
  });
});

describe("parseQuickTask", () => {
  it("parses the canonical example end to end", () => {
    const r = parseQuickTask(
      "Guest post on hvacblog.com for Ridgeline due friday @zach !doing",
      ctx, NOW,
    );
    expect(r.type).toBe("guest");
    expect(r.client_id).toBe("c1");
    expect(r.assignee).toBe("zach_komorowski");
    expect(r.status).toBe("doing");
    expect(r.due).toBe("2026-07-03");
    expect(r.title).toBe("Guest post on hvacblog.com");
  });

  it("detects type without stripping the words", () => {
    const r = parseQuickTask("Backlink from authority site", ctx, NOW);
    expect(r.type).toBe("backlink");
    expect(r.title).toBe("Backlink from authority site");
  });

  it("supports #client and 'assigned to' phrasing", () => {
    const r = parseQuickTask("Technical audit #idaho assigned to jw_west", ctx, NOW);
    expect(r.type).toBe("audit");
    expect(r.client_id).toBe("c3");
    expect(r.assignee).toBe("jw_west");
    expect(r.title).toBe("Technical audit");
  });

  it("leaves 'for' in the title when it is not a client", () => {
    const r = parseQuickTask("Optimise landing page for conversions", ctx, NOW);
    expect(r.client_id).toBe("");
    expect(r.title).toBe("Optimise landing page for conversions");
  });

  it("only strips !status when it is a real status", () => {
    const r = parseQuickTask("Fix 404s !todo", ctx, NOW);
    expect(r.status).toBe("todo");
    expect(r.title).toBe("Fix 404s");
    const r2 = parseQuickTask("Add !important banner", ctx, NOW);
    expect(r2.status).toBe("");
    expect(r2.title).toBe("Add !important banner");
  });

  it("empty input yields an empty title", () => {
    expect(parseQuickTask("", ctx, NOW).title).toBe("");
  });
});

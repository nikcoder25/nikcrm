import { describe, it, expect } from "vitest";
import { parseTaskPrompt } from "./promptTask.js";

const clients = [{ id: 1, name: "Acme Plumbing" }, { id: 2, name: "Blue HVAC" }];
const members = [{ name: "Sara Khan" }, { name: "Nik" }];
const now = new Date(2026, 6, 3); // Friday, Jul 3 2026
const parse = (p) => parseTaskPrompt(p, { clients, members, now });

describe("parseTaskPrompt", () => {
  it("pulls client, type, assignee and due date out of a full prompt", () => {
    expect(parse("Guest post on hvacblog.com for Acme Plumbing assign to Sara due tomorrow")).toEqual({
      client_id: 1, type: "guest", title: "Guest post on hvacblog.com", assignee: "Sara Khan", due: "2026-07-04",
    });
  });

  it("strips filler like 'add a task to' and matches a client by first word", () => {
    expect(parse("add a task to fix schema for Blue by Monday")).toEqual({
      client_id: 2, type: "schema", title: "Fix schema", assignee: "", due: "2026-07-06",
    });
  });

  it("parses ISO dates", () => {
    expect(parse("publish blog for Acme Plumbing on 2026-08-10")).toMatchObject({
      client_id: 1, type: "blog", title: "Publish blog", due: "2026-08-10",
    });
  });

  it("parses day-first slash dates and rolls past ones to next year", () => {
    expect(parse("backlink outreach due 15/8")).toMatchObject({ type: "backlink", title: "Backlink outreach", due: "2026-08-15" });
    expect(parse("pay invoice 01/02")).toMatchObject({ due: "2027-02-01" });
  });

  it("does not mistake URL path segments for dates", () => {
    expect(parse("guest post on site.com/10/7 for Acme Plumbing")).toMatchObject({
      client_id: 1, due: "", title: "Guest post on site.com/10/7",
    });
  });

  it("parses relative phrases", () => {
    expect(parse("audit in 2 weeks").due).toBe("2026-07-17");
    expect(parse("anchor text review next week").due).toBe("2026-07-10");
    expect(parse("guest post end of month").due).toBe("2026-07-31");
    expect(parse("call about renewal next friday")).toMatchObject({ title: "Call about renewal", due: "2026-07-17" });
    expect(parse("send report due aug 12").due).toBe("2026-08-12");
  });

  it("matches @mentions and roster first names", () => {
    expect(parse("onpage fixes for Acme Plumbing @Nik")).toMatchObject({
      client_id: 1, type: "onpage", title: "Onpage fixes", assignee: "Nik",
    });
  });

  it("keeps an unknown assignee as free text", () => {
    expect(parse("write meta descriptions assign to bob")).toMatchObject({ title: "Write meta descriptions", assignee: "Bob" });
  });

  it("matches a bare full roster name", () => {
    expect(parse("update sitemap for Acme Plumbing, Sara Khan")).toMatchObject({
      client_id: 1, title: "Update sitemap", assignee: "Sara Khan",
    });
  });

  it("leaves everything empty-handed prompts as a plain title", () => {
    expect(parse("just a plain task")).toEqual({
      client_id: "", type: "other", title: "Just a plain task", assignee: "", due: "",
    });
  });
});

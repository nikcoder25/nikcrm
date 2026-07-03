import { describe, it, expect } from "vitest";
import { parseDelimited, detectDelimiter, guessMapping, normalizeStatus, normalizeDate, parseImport } from "./importParse";

describe("parseDelimited", () => {
  it("parses TSV (as pasted from Sheets/Excel)", () => {
    const rows = parseDelimited("Name\tStatus\nwolfsbanek9\tDelivered");
    expect(rows).toEqual([["Name", "Status"], ["wolfsbanek9", "Delivered"]]);
  });
  it("parses CSV with quoted commas", () => {
    const rows = parseDelimited('name,order data\nTcs,"monthly seo, 11th month"');
    expect(rows[1]).toEqual(["Tcs", "monthly seo, 11th month"]);
  });
  it("detects the delimiter", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a,b,c")).toBe(",");
  });
  it("drops blank rows", () => {
    expect(parseDelimited("a,b\n\n,\nc,d").length).toBe(2);
  });
});

describe("guessMapping", () => {
  it("maps the team's sheet headers", () => {
    const headers = ["Name", "Status", "start", "end / delivered", "Time", "Person", "website link", "order data", "doc file", "google sheet"];
    expect(guessMapping(headers)).toEqual([
      "name", "status", "start_date", "end_date", "delivery_time", "person", "website", "order_data", "doc_file", "google_sheet",
    ]);
  });
  it("leaves unknown columns unmapped", () => {
    expect(guessMapping(["Count Down", "on page seo"])).toEqual(["", ""]);
  });
});

describe("normalizeStatus", () => {
  it("maps sheet labels to keys", () => {
    expect(normalizeStatus("In Progress")).toBe("in_progress");
    expect(normalizeStatus("Not Started")).toBe("not_started");
    expect(normalizeStatus("Finished")).toBe("finished");
    expect(normalizeStatus("Delivered")).toBe("delivered");
    expect(normalizeStatus("")).toBe("not_started");
  });
});

describe("normalizeDate", () => {
  it("ISO and US month/day/year", () => {
    expect(normalizeDate("2026-06-28")).toBe("2026-06-28");
    expect(normalizeDate("5/30/26")).toBe("2026-05-30");
    expect(normalizeDate("6/2/2026")).toBe("2026-06-02");
  });
  it("month names", () => {
    expect(normalizeDate("Jun 5, 2026")).toBe("2026-06-05");
    expect(normalizeDate("5 Jun 2026")).toBe("2026-06-05");
  });
  it("blank / junk → empty", () => {
    expect(normalizeDate("")).toBe("");
    expect(normalizeDate("soon")).toBe("");
  });
});

describe("parseImport end to end", () => {
  const pasted = [
    "Name\tStatus\tstart\tend / delivered\tPerson\twebsite link\torder data\tdoc file\tgoogle sheet",
    "wolfsbanek9\tDelivered\t5/30/26\t2026-06-28\tzach\twolfsbanek9.com\tmonthly seo\thttps://docs.google.com/doc/1\thttps://docs.google.com/sheet/1",
    "cj50000\tIn Progress\t6/26/26\t2026-07-04\t\tgorillaroofcleaning.info\t12 pages on page seo\t\t",
  ].join("\n");

  it("maps headers, rows, statuses, dates and links", () => {
    const r = parseImport(pasted);
    expect(r.hasHeader).toBe(true);
    expect(r.orders).toHaveLength(2);
    expect(r.orders[0]).toMatchObject({
      name: "wolfsbanek9", status: "delivered", start_date: "2026-05-30",
      end_date: "2026-06-28", person: "zach", website: "wolfsbanek9.com",
      order_data: "monthly seo", doc_file: "https://docs.google.com/doc/1",
      google_sheet: "https://docs.google.com/sheet/1",
    });
    expect(r.orders[1]).toMatchObject({ name: "cj50000", status: "in_progress", start_date: "2026-06-26" });
  });

  it("skips rows with no name", () => {
    const r = parseImport("Name\tStatus\n\tDelivered\nreal\tFinished");
    expect(r.orders).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it("handles headerless data when told so", () => {
    const r = parseImport("acme\tDelivered", { hasHeader: false });
    expect(r.orders).toHaveLength(0); // Column 1/2 unmapped → no name field
    expect(r.headers).toEqual(["Column 1", "Column 2"]);
  });
});

/* ---------------- spreadsheet / CSV import parsing ----------------
   Turn a pasted block (tab-separated when copied from Excel/Google Sheets, or
   comma-separated CSV) into order rows. Pure + unit-tested; no dependency, so
   pasting straight from a sheet works with nothing installed. */

import { ORDER_STATES } from "./constants";

const pad = (n) => String(n).padStart(2, "0");

// Guess the delimiter from the first line: a tab if the paste has any (Excel /
// Sheets copy as TSV), otherwise comma.
export function detectDelimiter(text) {
  const firstLine = (String(text).split(/\r?\n/)[0]) || "";
  return firstLine.includes("\t") ? "\t" : ",";
}

// RFC-4180-ish parser: handles quoted fields, escaped "" quotes, and both
// delimiters. Returns an array of rows (each an array of cell strings), with
// fully blank rows dropped.
export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = String(text);
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) endField();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// Header label → order field. Longest-intent aliases; anything unmatched
// (Count Down, on/off page SEO checkboxes…) stays unmapped and is ignored.
const FIELD_ALIASES = {
  name: ["name", "order name", "client", "site name", "title"],
  status: ["status", "state"],
  start_date: ["start", "start date", "started", "begin"],
  end_date: ["end / delivered", "end / deliver", "end/delivered", "end / deliver", "deliver", "delivered", "end date", "end", "due", "due date", "deadline", "finish"],
  delivery_time: ["time", "delivery time", "hour"],
  person: ["person", "assignee", "assigned", "who", "team", "team member", "owner"],
  website: ["website link", "website", "site", "url", "link", "web"],
  order_data: ["order data", "order details", "details", "package", "order", "scope", "notes", "description"],
  doc_file: ["doc file", "doc", "document", "docx", "google doc", "doc link", "gdoc"],
  google_sheet: ["google sheet", "sheet", "spreadsheet", "gsheet", "sheet link", "google sheets"],
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// The order fields must not double-map: once a column claims a field, later
// columns can't reuse it (e.g. a sheet with both "order" and "order data").
export function fieldForHeader(header, taken = new Set()) {
  const h = norm(header);
  if (!h) return "";
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (taken.has(field)) continue;
    if (aliases.some((a) => h === a)) return field;
  }
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (taken.has(field)) continue;
    if (aliases.some((a) => h.includes(a) || a.includes(h))) return field;
  }
  return "";
}

// Map a header row to an aligned array of field keys ("" = ignore this column).
export function guessMapping(headers) {
  const taken = new Set();
  return headers.map((h) => {
    const f = fieldForHeader(h, taken);
    if (f) taken.add(f);
    return f;
  });
}

// A row looks like a header when at least two of its cells name known fields —
// enough to tell "Name | Status | Start" apart from real data.
export function looksLikeHeader(cells) {
  const taken = new Set();
  let hits = 0;
  for (const c of cells) { const f = fieldForHeader(c, taken); if (f) { taken.add(f); hits++; } }
  return hits >= 2;
}

export function normalizeStatus(value) {
  const v = norm(value).replace(/[_-]+/g, " ");
  if (!v) return "not_started";
  const byLabel = ORDER_STATES.find((s) => s.label.toLowerCase() === v || s.key.replace(/_/g, " ") === v);
  if (byLabel) return byLabel.key;
  if (/progress|doing|working|wip|ongoing/.test(v)) return "in_progress";
  if (/deliver|done|complete/.test(v)) return "delivered";
  if (/finish/.test(v)) return "finished";
  return "not_started";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Best-effort date → 'YYYY-MM-DD' (or "" when unparseable). Slashed dates are
// read US-style month/day (matching the team's sheet, e.g. 5/30/26 = May 30).
export function normalizeDate(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s); // ISO-ish 2026-06-28
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s); // 5/30/26  (month/day/year)
  if (m) {
    const mo = +m[1], d = +m[2]; let y = +m[3];
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
    return "";
  }
  m = /^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/i.exec(s); // Jun 5, 2026
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) return `${m[3] || new Date().getFullYear()}-${pad(mo + 1)}-${pad(+m[2])}`;
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?\s*(\d{4})?$/i.exec(s); // 5 Jun 2026
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) return `${m[3] || new Date().getFullYear()}-${pad(mo + 1)}-${pad(+m[1])}`;
  }
  return "";
}

const URL_FIELDS = new Set(["website", "doc_file", "google_sheet"]);

// Build order objects from data rows + a column→field mapping. Rows without a
// name are skipped. Returns { orders, skipped }.
export function rowsToOrders(dataRows, mapping) {
  const orders = [];
  let skipped = 0;
  for (const cells of dataRows) {
    const o = { name: "", status: "", start_date: "", end_date: "", delivery_time: "", person: "", website: "", order_data: "", doc_file: "", google_sheet: "" };
    mapping.forEach((field, i) => {
      if (!field) return;
      const raw = (cells[i] == null ? "" : String(cells[i])).trim();
      if (field === "status") o.status = normalizeStatus(raw);
      else if (field === "start_date") o.start_date = normalizeDate(raw);
      else if (field === "end_date") o.end_date = normalizeDate(raw);
      else if (URL_FIELDS.has(field)) o[field] = raw;
      else o[field] = raw;
    });
    if (!o.name.trim()) { skipped++; continue; }
    o.status = o.status || "not_started";
    orders.push(o);
  }
  return { orders, skipped };
}

// End-to-end: raw pasted/CSV text → { headers, mapping, dataRows, orders }.
// `hasHeader` is auto-detected but overridable from the UI.
export function parseImport(text, { hasHeader } = {}) {
  const rows = parseDelimited(text);
  if (!rows.length) return { headers: [], mapping: [], dataRows: [], orders: [], skipped: 0, hasHeader: false };
  const auto = looksLikeHeader(rows[0]);
  const useHeader = hasHeader === undefined ? auto : hasHeader;
  const width = Math.max(...rows.map((r) => r.length));
  const headers = useHeader
    ? Array.from({ length: width }, (_, i) => (rows[0][i] || `Column ${i + 1}`))
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const mapping = guessMapping(headers);
  const dataRows = useHeader ? rows.slice(1) : rows;
  const { orders, skipped } = rowsToOrders(dataRows, mapping);
  return { headers, mapping, dataRows, orders, skipped, hasHeader: useHeader };
}

/* ---------------- natural-language task prompt parser ----------------
   Turns a free-form prompt — typed or dictated ("Guest post on hvacblog.com
   for Acme Plumbing, assign to Sara, due Friday") — into task fields. Runs
   entirely client-side (no AI call): known client/member names are matched
   against the roster, task types by keyword, and due dates by a set of
   common phrasings. Whatever remains becomes the title. `now` is injectable
   for tests. */
import { lastDayOfMonth, ym } from "./format";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (base, n) => { const d = startOfDay(base); d.setDate(d.getDate() + n); return d; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Splice a regex match out of the text, leaving a space so words don't fuse.
const cut = (s, m) => s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);

/* ---- due date ---- */
// Optional connector before a date phrase ("due Friday", "by 12/08", "on Aug 3").
const PRE = "(?:\\b(?:due\\s+)?(?:by|on|before|until)\\s+|\\bdue\\s+)?";

const WEEKDAY = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
// Longest-first so "friday" never half-matches as "fri".
const WD = Object.keys(WEEKDAY).sort((a, b) => b.length - a.length).join("|");
const MONTH = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MO = Object.keys(MONTH).join("|");

// If a year-less date already passed, the speaker means the next occurrence.
const rollForward = (d, now) => (d < startOfDay(now) ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d);

function extractDue(text, now) {
  const state = { text, due: "" };
  const take = (pattern, toDate) => {
    if (state.due) return;
    const m = new RegExp(pattern, "i").exec(state.text);
    if (!m) return;
    const d = toDate(m);
    if (!d) return;
    state.due = typeof d === "string" ? d : iso(d);
    state.text = cut(state.text, m);
  };

  take(PRE + "\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b", (m) => new Date(+m[1], +m[2] - 1, +m[3]));
  // Day-first (the date inputs across the app render dd/mm/yyyy). The
  // lookarounds keep this from firing inside URLs like site.com/10/7.
  take(PRE + "(?<![\\w/.])(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?(?![\\w/]|[.]\\d)", (m) => {
    const day = +m[1], mo = +m[2] - 1;
    if (mo < 0 || mo > 11 || day < 1 || day > 31) return null;
    let y = m[3] ? +m[3] : now.getFullYear();
    if (m[3] && y < 100) y += 2000;
    const d = new Date(y, mo, day);
    return m[3] ? d : rollForward(d, now);
  });
  take(PRE + `\\b(${MO})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, (m) =>
    rollForward(new Date(now.getFullYear(), MONTH[m[1].toLowerCase()], +m[2]), now));
  take(PRE + `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MO})[a-z]*\\b`, (m) =>
    rollForward(new Date(now.getFullYear(), MONTH[m[2].toLowerCase()], +m[1]), now));
  take(PRE + "\\b(?:the\\s+)?day\\s+after\\s+tomorrow\\b", () => addDays(now, 2));
  take(PRE + "\\b(?:tomorrow|tmrw)\\b", () => addDays(now, 1));
  take(PRE + "\\b(?:today|tonight|eod|end\\s+of\\s+day)\\b", () => addDays(now, 0));
  take(PRE + "\\b(?:end\\s+of\\s+(?:the\\s+)?month|eom)\\b", () => lastDayOfMonth(ym(now)));
  take(PRE + "\\bnext\\s+week\\b", () => addDays(now, 7));
  take("\\bin\\s+(\\d+)\\s+(days?|weeks?)\\b", (m) => addDays(now, +m[1] * (m[2].toLowerCase().startsWith("w") ? 7 : 1)));
  take(`(?:\\b(?:due\\s+)?(?:by|on|before|until|this)\\s+|\\bdue\\s+)?\\b(next\\s+)?(${WD})\\b`, (m) => {
    let delta = (WEEKDAY[m[2].toLowerCase()] - now.getDay() + 7) % 7;
    if (!delta) delta = 7;            // a bare weekday always means a future one
    if (m[1]) delta += 7;             // "next friday" = the friday of next week
    return addDays(now, delta);
  });

  return { due: state.due, text: state.text };
}

/* ---- client ---- */
const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "seo", "inc", "llc", "ltd"]);

function extractClient(text, clients) {
  const sorted = [...clients].sort((a, b) => String(b.name || "").length - String(a.name || "").length);
  const find = (frag) => {
    if (!frag || frag.length < 3) return null;
    return new RegExp("(?:\\b(?:for|client)\\s+|@)?\\b" + esc(frag) + "\\b", "i").exec(text);
  };
  // Exact roster-name mention wins; fall back to a distinctive first word
  // ("Acme" → "Acme Plumbing") so spoken shorthand still resolves.
  for (const c of sorted) {
    const m = find(String(c.name || "").trim());
    if (m) return { client_id: c.id, text: cut(text, m) };
  }
  for (const c of sorted) {
    const first = String(c.name || "").trim().split(/\s+/)[0];
    if (!first || first.length < 4 || STOP_WORDS.has(first.toLowerCase())) continue;
    const m = find(first);
    if (m) return { client_id: c.id, text: cut(text, m) };
  }
  return { client_id: "", text };
}

/* ---- assignee ---- */
function extractAssignee(text, members) {
  const names = members.map((m) => String(m.name || "").trim()).filter(Boolean);
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

  // Explicit marker: "assign to X", "assignee: X", "@X". Capture up to three
  // words, then find the longest roster match among them so trailing title
  // words ("assign to Sara due tomorrow") aren't swallowed.
  const mk = /(?:\bassign(?:ed)?\s+to\s+|\bassignee[:\s]\s*|@)([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})/i.exec(text);
  if (mk) {
    const marker = mk[0].slice(0, mk[0].length - mk[1].length);
    const words = mk[1].split(/\s+/);
    const remove = (wordCount) => {
      const len = marker.length + words.slice(0, wordCount).join(" ").length;
      return text.slice(0, mk.index) + " " + text.slice(mk.index + len);
    };
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const cand = words.slice(0, n).join(" ").toLowerCase();
      const hit = names.find((x) => x.toLowerCase() === cand)
        || (n === 1 && names.find((x) => x.split(/\s+/)[0].toLowerCase() === cand));
      if (hit) return { assignee: hit, text: remove(n) };
    }
    // Not in the roster — keep it anyway; tasks accept legacy free-text names.
    return { assignee: cap(words[0]), text: remove(1) };
  }

  // No marker: a full roster name mentioned anywhere still counts.
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const m = new RegExp("(?:\\bfor\\s+)?\\b" + esc(name) + "\\b", "i").exec(text);
    if (m) return { assignee: name, text: cut(text, m) };
  }
  return { assignee: "", text };
}

/* ---- task type ---- */
// Checked in order of specificity; the keyword stays in the title on purpose
// ("Guest post on hvacblog.com" reads better with it).
const TYPE_PATTERNS = [
  ["guest", /\bguest\s*post/i],
  ["onpage", /\bon[\s-]?page\b/i],
  ["anchor", /\banchor\b/i],
  ["backlink", /\bback\s*links?\b|\blink[\s-]?build/i],
  ["schema", /\bschema\b/i],
  ["audit", /\baudit\b/i],
  ["blog", /\bblog\b/i],
];
const detectType = (text) => (TYPE_PATTERNS.find(([, re]) => re.test(text)) || ["other"])[0];

/* ---- title ---- */
function cleanTitle(s) {
  let t = String(s || "");
  t = t.replace(/^\s*(?:please\s+)?(?:add|create|make|log|open)\s+(?:a\s+|an\s+)?(?:new\s+)?task(?:\s+(?:to|for|:))?\s*/i, "");
  t = t.replace(/^\s*remind\s+(?:me|us)\s+to\s+/i, "");
  t = t.replace(/\s{2,}/g, " ");
  // Connectors orphaned by the removals: "for  by" mid-string, "for" at the end.
  let prev;
  do { prev = t; t = t.replace(/\b(?:for|to|by|on|and)\s+(?=(?:for|to|by|on|and|due|until|before)\b)/i, ""); } while (t !== prev);
  const dangler = /\s+(?:for|by|on|to|due|until|before|and|assigned?(?:\s+to)?)\s*$/i;
  while (dangler.test(t)) t = t.replace(dangler, "");
  t = t.replace(/\s+,/g, ",").replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/* ---- entry point ---- */
export function parseTaskPrompt(prompt, { clients = [], members = [], now = new Date() } = {}) {
  let text = String(prompt || "").trim();
  const c = extractClient(text, clients);
  text = c.text;
  const a = extractAssignee(text, members);
  text = a.text;
  const d = extractDue(text, now);
  text = d.text;
  return { client_id: c.client_id, type: detectType(text), title: cleanTitle(text), assignee: a.assignee, due: d.due };
}

/* ---------------- Todoist-style natural-language quick-add ----------------
   Parse a single free-text line into a structured task, entirely on the
   client (no LLM, no network) — the same rule-based approach Todoist uses.

   Recognised, in any order:
     • type      — keywords: "guest post", "backlink", "on-page", "blog"…
     • client    — `for <name>` or `#<name>` (fuzzy-matched to a client)
     • assignee  — `@<name>` or `assigned to <name>` (matched to a member)
     • status    — `!todo` / `!doing` / `!done`
     • due date  — today, tomorrow, weekday, "next fri", "in 3 days",
                   "jul 10", "10 jul", 23/01, 2026-07-10 …

   Everything left over becomes the task title. `now` is injectable so the
   date logic is deterministic in tests. */

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ALIAS = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Task-type keyword → type key, longest phrases first so "guest blog" wins
// over "blog" and "on-page seo" over "seo". Detection only — the words stay in
// the title, since they read naturally ("Guest post on hvacblog.com").
const TYPE_SYNONYMS = [
  ["guest post", "guest"], ["guest blog", "guest"], ["guestpost", "guest"],
  ["on-page seo", "onpage"], ["on page seo", "onpage"], ["on-page", "onpage"], ["on page", "onpage"], ["onpage", "onpage"],
  ["link building", "backlink"], ["link insertion", "backlink"], ["niche edit", "backlink"], ["backlink", "backlink"], ["back link", "backlink"],
  ["anchor text", "anchor"], ["anchor", "anchor"],
  ["blog post", "blog"], ["article", "blog"], ["blog", "blog"],
  ["technical audit", "audit"], ["tech audit", "audit"], ["site audit", "audit"], ["audit", "audit"],
  ["structured data", "schema"], ["schema", "schema"],
].sort((a, b) => b[0].length - a[0].length);

const STATUS_ALIAS = {
  todo: "todo", "to-do": "todo", backlog: "todo",
  doing: "doing", inprogress: "doing", "in-progress": "doing", "in progress": "doing", progress: "doing", wip: "doing", started: "doing",
  review: "review", "in-review": "review", "in review": "review", reviewing: "review",
  blocked: "blocked", block: "blocked",
  done: "done", complete: "done", completed: "done", finished: "done",
};

const collapse = (s) => s.replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim();
const escapeRe = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

/* ---------------- date parsing ----------------
   Returns { date: 'YYYY-MM-DD', match: '<substring to strip>' } for the first
   recognised expression, or null. An optional leading "due/by/on/deadline" is
   folded into the match so it gets stripped from the title too. */
export function parseDate(text, now = new Date()) {
  const today = startOfDay(now);
  const lead = "(?:\\b(?:due|by|on|deadline|due\\s+on|due\\s+by)\\s+)?";

  const tryRe = (re, fn) => {
    const m = re.exec(text);
    if (!m) return null;
    const d = fn(m);
    return d ? { date: isoOf(d), match: m[0] } : null;
  };

  // 1. ISO 2026-07-10
  let r = tryRe(new RegExp(lead + "(\\d{4})-(\\d{2})-(\\d{2})\\b", "i"), (m) => {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) ? null : d;
  });
  if (r) return r;

  // 2. Month name: "jul 10", "july 10th", "10 jul", "23 jan 2027"
  r = tryRe(new RegExp(lead + "(" + MONTHS.join("|") + ")[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b", "i"),
    (m) => monthDay(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2], m[3] && +m[3], today));
  if (r) return r;
  r = tryRe(new RegExp(lead + "(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MONTHS.join("|") + ")[a-z]*\\.?(?:,?\\s+(\\d{4}))?\\b", "i"),
    (m) => monthDay(MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1], m[3] && +m[3], today));
  if (r) return r;

  // 3. Numeric day/month: 23/01, 23/01/2027, 23-01 (day first, matching the dd/mm UI)
  r = tryRe(new RegExp(lead + "(\\d{1,2})[/\\-](\\d{1,2})(?:[/\\-](\\d{2,4}))?\\b"), (m) => {
    const day = +m[1], mon = +m[2];
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
    let year = m[3] ? +m[3] : today.getFullYear();
    if (m[3] && m[3].length === 2) year += 2000;
    const d = new Date(year, mon - 1, day);
    if (!m[3] && d < today) d.setFullYear(year + 1); // a bare past date means next year
    return d;
  });
  if (r) return r;

  // 4. "in 3 days" / "in 2 weeks"
  r = tryRe(new RegExp(lead + "in\\s+(\\d{1,3})\\s+(day|days|week|weeks)\\b", "i"), (m) =>
    addDays(today, +m[1] * (/week/i.test(m[2]) ? 7 : 1)));
  if (r) return r;

  // 5. today / tonight / tomorrow
  r = tryRe(new RegExp(lead + "(today|tonight|tomorrow|tmr|tmrw)\\b", "i"), (m) =>
    /tom|tmr/i.test(m[1]) ? addDays(today, 1) : today);
  if (r) return r;

  // 6. weekday, optionally "next"/"this"
  r = tryRe(new RegExp(lead + "(next|this)?\\s*(" + Object.keys(WEEKDAY_ALIAS).join("|") + "|" + WEEKDAYS.join("|") + ")\\b", "i"),
    (m) => weekday(m[2].toLowerCase(), /next/i.test(m[1] || ""), today));
  if (r) return r;

  return null;
}

function monthDay(monthIdx, day, year, today) {
  if (monthIdx < 0 || day < 1 || day > 31) return null;
  const d = new Date(year || today.getFullYear(), monthIdx, day);
  if (Number.isNaN(d.getTime())) return null;
  if (!year && d < today) d.setFullYear(d.getFullYear() + 1); // no year given → the next one
  return d;
}

function weekday(word, forceNext, today) {
  const target = word in WEEKDAY_ALIAS ? WEEKDAY_ALIAS[word] : WEEKDAYS.indexOf(word);
  if (target < 0) return null;
  const delta = (target - today.getDay() + 7) % 7; // 0 = today, else days until the next one
  // "next friday" = the one in the following week; bare/"this" = the coming one.
  return addDays(today, forceNext ? (delta === 0 ? 7 : delta + 7) : delta);
}

/* ---------------- client / assignee fuzzy matching ---------------- */
// Best client whose name matches `phrase` (exact › starts-with › contains ›
// first-word). Returns the client object or null — we never guess wildly.
export function matchClient(phrase, clients = []) {
  const p = String(phrase || "").trim().toLowerCase();
  if (!p) return null;
  const named = clients.filter((c) => c.name);
  const lc = (c) => c.name.toLowerCase();
  return (
    named.find((c) => lc(c) === p) ||
    named.find((c) => lc(c).startsWith(p)) ||
    named.find((c) => lc(c).includes(p)) ||
    // First-word fallback only for a single typed token, so a multi-word phrase
    // like "ridgeline due friday" can't loosely match "Ridgeline HVAC".
    (!/\s/.test(p) ? named.find((c) => lc(c).split(/\s+/)[0].startsWith(p)) : null) ||
    null
  );
}

// Best member name for `phrase`; falls back to the raw phrase (free-text
// assignees are allowed) when nothing in the roster matches.
export function matchAssignee(phrase, members = []) {
  const p = String(phrase || "").trim().toLowerCase();
  if (!p) return "";
  const names = members.map((m) => m.name).filter(Boolean);
  return (
    names.find((n) => n.toLowerCase() === p) ||
    names.find((n) => n.toLowerCase().startsWith(p)) ||
    names.find((n) => n.toLowerCase().includes(p)) ||
    names.find((n) => n.toLowerCase().replace(/[_\s.-]/g, "").startsWith(p.replace(/[_\s.-]/g, ""))) ||
    String(phrase).trim()
  );
}

function detectType(text) {
  const t = text.toLowerCase();
  for (const [phrase, key] of TYPE_SYNONYMS) {
    const re = new RegExp("\\b" + phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i");
    if (re.test(t)) return key;
  }
  return "";
}

/* ---------------- main entry ----------------
   parseQuickTask("Guest post on hvacblog.com for Ridgeline due fri @zach !doing")
     → { title, type, client_id, client_name, assignee, status, due, matched } */
export function parseQuickTask(input, { clients = [], members = [] } = {}, now = new Date()) {
  let text = String(input || "");
  const matched = { type: false, client: false, assignee: false, status: false, due: false };

  // status  !doing / !in progress / !in review  (a bang plus one or two words)
  text = text.replace(/(^|\s)!([a-z][a-z-]*)(\s+[a-z][a-z-]*)?/gi, (full, sp, w1, w2) => {
    const first = w1.toLowerCase();
    const two = w2 ? `${first} ${w2.trim().toLowerCase()}` : "";
    // Prefer the two-word status ("in progress") over the single word ("in").
    if (two && STATUS_ALIAS[two]) { matched.status = STATUS_ALIAS[two]; return sp; }
    // Otherwise only the first word was the status; leave the trailing word
    // (e.g. "!done today" → status done, "today" stays for the date parser).
    if (STATUS_ALIAS[first]) { matched.status = STATUS_ALIAS[first]; return sp + (w2 || ""); }
    return full;
  });

  // assignee  @name  (strip the token; resolve against the roster)
  let assignee = "";
  text = text.replace(/(^|\s)@([\w.-]+)/g, (full, sp, name) => {
    assignee = matchAssignee(name, members);
    matched.assignee = true;
    return sp;
  });
  // assignee  "assigned to <name>"
  if (!matched.assignee) {
    const m = /\bassigned?\s+to\s+([a-z][\w.'-]*(?:\s+[a-z][\w.'-]*)?)/i.exec(text);
    if (m) { assignee = matchAssignee(m[1], members); matched.assignee = true; text = text.replace(m[0], " "); }
  }

  // client  #name  (single token) or  "for <name…>"
  let client = null;
  text = text.replace(/(^|\s)#([\w.&-]+)/g, (full, sp, name) => {
    const c = matchClient(name, clients);
    if (c) { client = c; matched.client = true; return sp; }
    return full;
  });
  if (!client) {
    // "for <up to three words>" — try the longest phrase down to one word and
    // strip only the words that resolve to a real client, so a trailing date or
    // "Optimise page for conversions" is never eaten.
    const m = /\bfor\s+([a-z0-9][\w.&'-]*(?:\s+[a-z0-9][\w.&'-]*){0,2})/i.exec(text);
    if (m) {
      const words = m[1].split(/\s+/);
      for (let len = words.length; len >= 1 && !client; len--) {
        const phrase = words.slice(0, len).join(" ");
        const c = matchClient(phrase, clients);
        if (c) {
          client = c; matched.client = true;
          text = text.replace(new RegExp("\\bfor\\s+" + escapeRe(phrase), "i"), " ");
        }
      }
    }
  }

  // due date
  const d = parseDate(text, now);
  let due = "";
  if (d) { due = d.date; matched.due = true; text = text.replace(d.match, " "); }

  // type (detect from what remains; keep the words in the title)
  const type = detectType(text);
  if (type) matched.type = true;

  return {
    title: collapse(text),
    type: type || "",
    client_id: client ? client.id : "",
    client_name: client ? client.name : "",
    assignee,
    status: matched.status || "",
    due,
    matched,
  };
}

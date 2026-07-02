/* ---------------- formatting helpers ---------------- */
export const money = (n) => "$" + (Number(n) || 0).toLocaleString();
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const ymLabel = (s) => { if (!s) return ""; const [y, m] = s.split("-"); return new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "numeric" }); };
// Last calendar day of a 'YYYY-MM' month as 'YYYY-MM-DD' ('2026-02' → '2026-02-28').
// UTC throughout so it never shifts across timezones (also used server-side).
export const lastDayOfMonth = (month) => {
  const [y, m] = String(month).split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of the next month = last day of this one
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// Local calendar date as 'YYYY-MM-DD' (lexicographically comparable).
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// A date is past due when it's a real date strictly before today.
export const isPastDue = (dateStr) => Boolean(dateStr) && String(dateStr).slice(0, 10) < todayStr();

// Relative time for the activity feed: "just now", "2m ago", "3h ago",
// "yesterday", else a short date. `now` is injectable for tests.
export const timeAgo = (ts, now = new Date()) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.max(0, (now - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return "yesterday";
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
};

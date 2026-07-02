/* ---------------- formatting helpers ---------------- */
export const money = (n) => "$" + (Number(n) || 0).toLocaleString();
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const ymLabel = (s) => { if (!s) return ""; const [y, m] = s.split("-"); return new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "numeric" }); };

// Local calendar date as 'YYYY-MM-DD' (lexicographically comparable).
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// A date is past due when it's a real date strictly before today.
export const isPastDue = (dateStr) => Boolean(dateStr) && String(dateStr).slice(0, 10) < todayStr();

// A plain calendar date 'YYYY-MM-DD' → "Jul 2, 2026" (parsed as local, no TZ shift).
export const dateLabel = (s) => {
  if (!s) return "";
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
};

// A short, human date-time for the activity timeline: e.g. "Jul 2, 2026, 3:14 PM".
export const dateTimeLabel = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

// Compact "time ago" for feeds: "just now", "5m ago", "3h ago", "2d ago",
// falling back to a short date beyond a week.
export const timeAgo = (s) => {
  if (!s) return "";
  const then = new Date(s).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(s).toLocaleDateString("en", { month: "short", day: "numeric" });
};

// 'YYYY-MM-DDTHH:mm' in local time, for a datetime-local input default value.
export const localDateTimeInput = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

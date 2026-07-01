/* ---------------- formatting helpers ---------------- */
export const money = (n) => "$" + (Number(n) || 0).toLocaleString();
export const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const ymLabel = (s) => { if (!s) return ""; const [y, m] = s.split("-"); return new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "numeric" }); };

// Local calendar date as 'YYYY-MM-DD' (lexicographically comparable).
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// A date is past due when it's a real date strictly before today.
export const isPastDue = (dateStr) => Boolean(dateStr) && String(dateStr).slice(0, 10) < todayStr();

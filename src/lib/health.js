/* ---------------- client health score ----------------
 * A single 0–100 signal per client, derived from data already in the app:
 * money owed, overdue/blocked work, keyword momentum, and how recently the
 * client was engaged. Higher is healthier. Bands: good ≥ 70, watch 40–69,
 * risk < 40. Pure + synchronous so it can be computed per row in a list.
 *
 * Each input array should already be scoped to the one client.
 */
import { isPastDue, todayStr } from "./format";

export const HEALTH_BANDS = {
  good: { key: "good", label: "Healthy", fg: "#1f7a4d", bg: "#dff3e8" },
  watch: { key: "watch", label: "Watch", fg: "#8a5a00", bg: "#fdf1d0" },
  risk: { key: "risk", label: "At risk", fg: "#c0392b", bg: "#f7dede" },
};

const bandFor = (score) => (score >= 70 ? "good" : score >= 40 ? "watch" : "risk");

// clamp helper
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function computeHealth(client, { payments = [], deliverables = [], tasks = [], keywords = [], activities = [] } = {}) {
  const today = todayStr();
  const reasons = [];
  let score = 100;

  // A closed relationship isn't "unhealthy" — report it as neutral so lost/ended
  // clients don't dominate an at-risk view.
  if (client.status === "ended") return { score: null, band: "neutral", label: "Ended", reasons: ["Relationship ended"] };
  if (client.status === "loss") return { score: 8, band: "risk", label: "At risk", reasons: ["Marked as an SEO loss"] };

  // A high manual risk flag on the client caps the ceiling.
  if (client.risk === "high") { score -= 18; reasons.push("Flagged high risk"); }
  if (client.status === "paused") { score -= 15; reasons.push("Account paused"); }

  // Money owed: explicit overdue, or pending for a month already past.
  const overduePay = payments.filter((p) => p.status === "overdue" || (p.status === "pending" && p.month < today.slice(0, 7)));
  if (overduePay.length) { score -= clamp(overduePay.length * 15, 0, 30); reasons.push(`${overduePay.length} payment${overduePay.length > 1 ? "s" : ""} owed`); }

  // Overdue deliverables (past due & not delivered) and blocked work.
  const overdueDel = deliverables.filter((d) => isPastDue(d.due_date) && d.status !== "delivered");
  if (overdueDel.length) { score -= clamp(overdueDel.length * 8, 0, 24); reasons.push(`${overdueDel.length} overdue deliverable${overdueDel.length > 1 ? "s" : ""}`); }
  const blocked = deliverables.filter((d) => d.status === "blocked");
  if (blocked.length) { score -= clamp(blocked.length * 6, 0, 18); reasons.push(`${blocked.length} blocked`); }

  // Overdue tasks.
  const overdueTasks = tasks.filter((t) => isPastDue(t.due) && (t.status || "todo") !== "done");
  if (overdueTasks.length) { score -= clamp(overdueTasks.length * 4, 0, 16); reasons.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}`); }

  // Keyword momentum: reward net improvement, penalize net decline. Lower rank
  // number is better, so improved = current < previous.
  const ranked = keywords.filter((k) => k.current_rank != null && k.previous_rank != null);
  const improved = ranked.filter((k) => k.current_rank < k.previous_rank).length;
  const declined = ranked.filter((k) => k.current_rank > k.previous_rank).length;
  const net = improved - declined;
  if (net > 0) { score += clamp(net * 3, 0, 10); }
  else if (net < 0) { score -= clamp(-net * 4, 0, 16); reasons.push(`${declined} keyword${declined > 1 ? "s" : ""} slipping`); }

  // Overdue follow-ups: a promised next touch that's past due.
  const dueFollowups = activities.filter((a) => a.follow_up_date && String(a.follow_up_date).slice(0, 10) <= today);
  if (dueFollowups.length) { score -= clamp(dueFollowups.length * 6, 0, 12); reasons.push(`${dueFollowups.length} follow-up${dueFollowups.length > 1 ? "s" : ""} due`); }

  // Engagement: how long since the last logged touchpoint.
  const last = activities.reduce((max, a) => (a.happened_at && a.happened_at > max ? a.happened_at : max), "");
  if (last) {
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    if (days >= 60) { score -= 20; reasons.push(`No contact in ${days}d`); }
    else if (days >= 30) { score -= 10; reasons.push(`No contact in ${days}d`); }
  }

  score = Math.round(clamp(score, 0, 100));
  const band = bandFor(score);
  return { score, band, label: HEALTH_BANDS[band].label, reasons };
}

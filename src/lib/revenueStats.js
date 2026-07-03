// Month-by-month analytics for the Revenue page. All pure — computed from the
// already-loaded clients / payments / orders, so there's no extra API surface.
// Every function takes `months` (a 'YYYY-MM' list, oldest→newest) and returns
// rows aligned to it, so the charts and the ledger table stay in lockstep.

// 'YYYY-MM' for a date string or timestamp ('2026-07-03T…' and '2026-07-03'
// both start with the month key), or "" when absent.
export const ymOf = (v) => (v ? String(v).slice(0, 7) : "");

// The last `n` month keys ending at `ref`'s month, oldest first. `ref` is
// injectable so this stays testable without touching the wall clock.
export function monthKeys(n, ref = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// Recorded revenue per month from the payments ledger: collected (paid),
// pending (everything not paid) and their sum (billed).
export function revenueByMonth(payments, months) {
  const map = Object.fromEntries(months.map((m) => [m, { month: m, collected: 0, pending: 0, billed: 0 }]));
  for (const p of payments) {
    const row = map[p.month];
    if (!row) continue;
    const amt = Number(p.amount) || 0;
    row.billed += amt;
    if (p.status === "paid") row.collected += amt; else row.pending += amt;
  }
  return months.map((m) => map[m]);
}

// Client intake per month (by created_at) plus the running client total through
// each month — the "clients added" and "book size" trend. Clients created
// before the window seed the cumulative so `total` is a true count, not just
// the in-window sum.
export function clientsByMonth(clients, months) {
  const first = months[0] || "";
  const added = Object.fromEntries(months.map((m) => [m, 0]));
  let running = 0;
  for (const c of clients) {
    const m = ymOf(c.created_at);
    if (!m) continue;
    if (m in added) added[m] += 1;
    else if (first && m < first) running += 1; // predates the window
  }
  return months.map((m) => { running += added[m]; return { month: m, added: added[m], total: running }; });
}

const orderDone = (o) => o.status === "delivered" || o.status === "finished";

// Orders per month: started (by start_date), delivered (finished/delivered, by
// end_date) and the started-order value (price; 0 for non-admins, who never
// receive it). This is the "order flow" — intake vs fulfilment — over time.
export function ordersByMonth(orders, months) {
  const map = Object.fromEntries(months.map((m) => [m, { month: m, started: 0, delivered: 0, value: 0 }]));
  for (const o of orders) {
    const sm = ymOf(o.start_date);
    if (map[sm]) { map[sm].started += 1; map[sm].value += Number(o.price) || 0; }
    if (orderDone(o)) { const em = ymOf(o.end_date); if (map[em]) map[em].delivered += 1; }
  }
  return months.map((m) => map[m]);
}

// Current client pipeline, lead→loss, for the funnel bar.
export const PIPELINE = ["lead", "upcoming", "active", "paused", "ended", "loss"];
export function pipelineFunnel(clients) {
  return PIPELINE.map((status) => ({ status, count: clients.filter((c) => c.status === status).length }));
}

// Current MRR split by acquisition source (active clients only), richest first.
export function revenueBySource(clients) {
  const map = {};
  for (const c of clients) {
    if (c.status !== "active") continue;
    const s = c.source || "Other";
    map[s] = (map[s] || 0) + (Number(c.fee) || 0);
  }
  return Object.entries(map).map(([source, mrr]) => ({ source, mrr })).sort((a, b) => b.mrr - a.mrr);
}

// Full revenue-by-source breakdown across BOTH recurring client fees and one-off
// orders: per source, the active-client MRR, the order count and total order
// value (price; 0 for non-admins, who never receive it). Sorted by total
// contribution (MRR + order value) so the biggest channel leads. Covers every
// source that has either an active client or an order.
export function sourceBreakdown(clients, orders) {
  const rows = {};
  const row = (s) => (rows[s] ||= { source: s, mrr: 0, orderCount: 0, orderValue: 0 });
  for (const c of clients) {
    if (c.status !== "active") continue;
    row(c.source || "Other").mrr += Number(c.fee) || 0;
  }
  for (const o of orders) {
    const r = row(o.source || "Other");
    r.orderCount += 1;
    r.orderValue += Number(o.price) || 0;
  }
  return Object.values(rows).sort((a, b) => (b.mrr + b.orderValue) - (a.mrr + a.orderValue) || b.orderCount - a.orderCount);
}

// Whole-percent month-over-month change, or null when there's no prior base to
// compare against (avoids a meaningless "+100%" off zero).
export function deltaPct(cur, prev) {
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

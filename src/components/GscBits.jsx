import React from "react";
import { accent, disp, BDt } from "../lib/theme";

/* Shared Search Console presentation pieces, used by the client detail
   "Organic search" panel and the Websites dashboard. */

export const GSC_GREEN = "#1f9d57";
export const GSC_RED = "#c0392b";
export const GSC_GRAY = "#6b6580";

// Per-metric line color. Clicks keep the app accent (purple) they've always
// had; impressions get a distinct blue so the two read apart on one chart.
export const GSC_CLICKS = accent;
export const GSC_IMPRESSIONS = "#0ea5e9";
export const GSC_METRIC_META = {
  clicks: { key: "clicks", label: "Clicks", color: GSC_CLICKS },
  impressions: { key: "impressions", label: "Impressions", color: GSC_IMPRESSIONS },
};

// Normalize a daily row: date as 'YYYY-MM-DD', numbers as numbers.
export const gscDay = (d) => ({
  date: String(d.date).slice(0, 10),
  clicks: Number(d.clicks) || 0,
  impressions: Number(d.impressions) || 0,
  ctr: Number(d.ctr) || 0,
  position: Number(d.position) || 0,
});

// Clicks + impressions (and impression-weighted CTR/position) for the last 28
// days of data vs the 28 days before, anchored on the latest synced date (GSC
// data lags ~2 days). The previous window only counts as comparable once it
// holds at least 14 days of rows.
export function gscWindows(daily) {
  if (!daily.length) return null;
  const last = new Date(daily[daily.length - 1].date + "T00:00:00Z").getTime();
  const cur = { clicks: 0, impressions: 0, posWeight: 0 };
  const prev = { clicks: 0, impressions: 0 };
  let prevDays = 0;
  for (const d of daily) {
    const age = Math.round((last - new Date(d.date + "T00:00:00Z").getTime()) / 86400000);
    if (age < 28) { cur.clicks += d.clicks; cur.impressions += d.impressions; cur.posWeight += d.position * d.impressions; }
    else if (age < 56) { prev.clicks += d.clicks; prev.impressions += d.impressions; prevDays += 1; }
  }
  cur.ctr = cur.impressions > 0 ? cur.clicks / cur.impressions : 0;
  cur.position = cur.impressions > 0 ? cur.posWeight / cur.impressions : 0;
  return { cur, prev, comparable: prevDays >= 14 };
}

// "+12%" green / "-8%" red vs the previous window; null when not comparable.
export function pctChange(cur, prev, comparable) {
  if (!comparable || !(prev > 0)) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, color: pct > 0 ? GSC_GREEN : pct < 0 ? GSC_RED : GSC_GRAY };
}

export function GscStat({ label, value, change }) {
  return (
    <div style={{ flex: 1, minWidth: 140, border: BDt, borderRadius: 10, padding: "10px 14px", background: "#faf8f2" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: GSC_GRAY, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 3 }}>
        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: disp }}>{typeof value === "number" ? value.toLocaleString() : value}</span>
        {change && <span style={{ fontSize: 12, fontWeight: 800, color: change.color }}>{change.label} vs prev 28d</span>}
      </div>
    </div>
  );
}

// Compact axis number: 2500 → "2.5k", 51000 → "51k", small values as-is.
const fmtAxis = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

// SVG line chart of one or two daily GSC metrics — same inline-SVG style as the
// rank chart in Keywords.jsx, y-axis normal (0 at the bottom). `metrics` is a
// list of keys from GSC_METRIC_META (e.g. ["clicks"], ["clicks","impressions"]).
// Clicks and impressions differ by orders of magnitude, so each series is scaled
// to its OWN max on its OWN axis (first → left, second → right); axis labels are
// tinted to match their line so it's clear which scale belongs to which metric.
export function GscTrendChart({ daily, metrics = ["clicks"], width = 620, height = 150 }) {
  const series = metrics.map((m) => GSC_METRIC_META[m]).filter(Boolean);
  if (!series.length || daily.length < 2) return null;
  const times = daily.map((d) => new Date(d.date + "T00:00:00Z").getTime());
  const t0 = times[0], t1 = times[times.length - 1];
  const dual = series.length > 1;
  const padL = 44, padR = dual ? 50 : 12, padT = 10, padB = 24;
  const iw = width - padL - padR, ih = height - padT - padB;
  const x = (t) => padL + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * iw;

  const built = series.map((s) => {
    const max = Math.max(1, ...daily.map((d) => Number(d[s.key]) || 0));
    const y = (v) => padT + (1 - v / max) * ih;
    const path = daily.map((d, i) => `${i === 0 ? "M" : "L"}${x(times[i]).toFixed(1)},${y(Number(d[s.key]) || 0).toFixed(1)}`).join(" ");
    const ticks = [...new Set([0, Math.round(max / 2), max])];
    return { ...s, max, y, path, ticks, last: Number(daily[daily.length - 1][s.key]) || 0 };
  });
  const [left, right] = built;

  const nX = Math.max(2, Math.min(5, daily.length));
  const xTicks = Array.from({ length: nX }, (_, i) => t0 + (i / (nX - 1)) * Math.max(1, t1 - t0));
  const fmtTick = (t) => new Date(t).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {/* Gridlines + left-axis labels follow the first series' scale. */}
      {left.ticks.map((v) => (
        <g key={`y${v}`}>
          <line x1={padL} x2={width - padR} y1={left.y(v)} y2={left.y(v)} stroke="#e8e4d8" strokeWidth="1" />
          <text x={padL - 7} y={left.y(v) + 3.5} textAnchor="end" fontSize="10" fontWeight="700" fill={left.color}>{fmtAxis(v)}</text>
        </g>
      ))}
      {/* Right-axis labels (second series), aligned to the same 0/mid/max heights. */}
      {right && right.ticks.map((v) => (
        <text key={`ry${v}`} x={width - padR + 7} y={right.y(v) + 3.5} textAnchor="start" fontSize="10" fontWeight="700" fill={right.color}>{fmtAxis(v)}</text>
      ))}
      {xTicks.map((t, i) => (
        <text key={`x${i}`} x={x(t)} y={height - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill={GSC_GRAY}>{fmtTick(t)}</text>
      ))}
      {built.map((s) => (
        <g key={s.key}>
          <path d={s.path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(t1)} cy={s.y(s.last)} r="2.5" fill={s.color} />
        </g>
      ))}
    </svg>
  );
}

// Back-compat: the client-detail organic panel still asks for clicks only.
export function GscClicksChart(props) {
  return <GscTrendChart {...props} metrics={["clicks"]} />;
}

// Top-queries table shared by the client panel and the Websites dashboard.
export function GscQueriesTable({ queries, title = "Top queries" }) {
  if (!queries.length) return null;
  const th = { padding: "6px 8px", fontSize: 10.5, fontWeight: 800, color: GSC_GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div className="scroll-x" style={{ border: BDt, borderRadius: 10 }}>
        <table style={{ width: "100%", minWidth: 440, borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: BDt, background: "#faf8f2" }}>
              <th style={th}>Query</th>
              <th style={{ ...th, textAlign: "right" }}>Clicks</th>
              <th style={{ ...th, textAlign: "right" }}>Impressions</th>
              <th style={{ ...th, textAlign: "right" }}>Avg position</th>
            </tr>
          </thead>
          <tbody>
            {queries.map((q) => (
              <tr key={q.query} style={{ borderBottom: "1px solid #f0ece2" }}>
                <td style={{ padding: "6px 8px", fontWeight: 700, wordBreak: "break-word" }}>{q.query}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800 }}>{(Number(q.clicks) || 0).toLocaleString()}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: GSC_GRAY, fontWeight: 700 }}>{(Number(q.impressions) || 0).toLocaleString()}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{q.position == null ? "—" : Number(q.position).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

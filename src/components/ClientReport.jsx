import React, { useState, useEffect } from "react";
import { Printer, Save } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn, sel, input } from "../lib/theme";
import { typeLabel, deliverableStatusLabel } from "../lib/constants";
import { ym, ymLabel } from "../lib/format";
import { keywordSummary, movement } from "./Keywords";
import { scopeRows } from "../lib/scope";
import { saveReport, gscLoad } from "../lib/api";
import { Empty } from "./ui";

const arrow = (dir) => (dir === "up" ? "▲" : dir === "down" ? "▼" : dir === "new" ? "•" : "–");

// 'YYYY-MM' one month earlier ('2026-01' → '2025-12').
const prevYm = (m) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Totals for one month's gsc_daily rows: clicks, impressions and the
// impression-weighted average position. null when the month has no rows.
function gscMonthTotals(daily, month) {
  const rows = daily.filter((d) => String(d.date).slice(0, 7) === month);
  if (!rows.length) return null;
  let clicks = 0, impressions = 0, posWeight = 0, posSum = 0;
  for (const d of rows) {
    const imp = Number(d.impressions) || 0;
    clicks += Number(d.clicks) || 0;
    impressions += imp;
    posWeight += (Number(d.position) || 0) * imp;
    posSum += Number(d.position) || 0;
  }
  const position = impressions > 0 ? posWeight / impressions : posSum / rows.length;
  return { clicks, impressions, position };
}

// "12,340 (▲ +8%)" style compare against the previous month; "" without one.
function vsPrev(cur, prev) {
  if (prev == null || !(prev > 0)) return "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return ` (${pct > 0 ? "▲ +" : pct < 0 ? "▼ " : ""}${pct}% vs prev month)`;
}

export default function ClientReport({ client, keywords = [], deliverables = [], reports = [], retainers = [], onChanged }) {
  const [month, setMonth] = useState(ym(new Date()));
  const savedForMonth = reports.find((r) => r.period === month)?.summary || "";
  const [draft, setDraft] = useState(savedForMonth);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Load the saved narrative whenever the selected month changes.
  useEffect(() => {
    setDraft(reports.find((r) => r.period === month)?.summary || "");
    setMsg("");
  }, [month]);

  // Search Console data for the selected month (daily covers ~90 days, so the
  // previous month is usually in there too). Only fetched once the client is
  // linked to a GSC property; failures just hide the section.
  const [gsc, setGsc] = useState(null);
  useEffect(() => {
    setGsc(null);
    if (!String(client.gsc_property || "").trim()) return;
    let alive = true;
    gscLoad(client.id, month)
      .then((r) => { if (alive) setGsc(r); })
      .catch(() => {});
    return () => { alive = false; };
  }, [client.id, client.gsc_property, month]);

  const gscDaily = gsc?.daily || [];
  const gscMonth = gscMonthTotals(gscDaily, month);
  const gscPrev = gscMonthTotals(gscDaily, prevYm(month));
  const gscQueries = (gsc?.queries || []).slice(0, 10);

  const months = (() => {
    const set = new Set([month]);
    const now = new Date();
    for (let i = 0; i < 12; i++) set.add(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    reports.forEach((r) => set.add(r.period));
    return [...set].sort().reverse();
  })();

  const ks = keywordSummary(keywords);
  const netImprovement = keywords.reduce((s, k) => (k.current_rank != null && k.previous_rank != null ? s + (Number(k.previous_rank) - Number(k.current_rank)) : s), 0);
  const delivered = deliverables.filter((d) => d.status === "delivered").length;
  const scope = scopeRows(retainers, deliverables, client.id, month);
  const dirty = draft !== savedForMonth;

  const save = async () => {
    setBusy(true); setMsg("");
    try { await saveReport(client.id, month, draft); await onChanged("client_reports"); setMsg("Saved"); }
    catch (e) { setMsg(e?.message || "Could not save."); }
    setBusy(false);
  };

  const netLabel = netImprovement > 0 ? `+${netImprovement} positions gained`
    : netImprovement < 0 ? `${netImprovement} positions lost` : "no net change";
  const netColor = netImprovement > 0 ? "#1f9d57" : netImprovement < 0 ? "#c0392b" : "#6b6580";

  return (
    <div style={{ marginTop: 22 }}>
      {/* controls (not printed) */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", flex: 1 }}>
          Monthly report
        </div>
        <select style={{ ...sel, flex: "none", minWidth: 140 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
        </select>
        <button style={btn("#fff", ink)} onClick={() => window.print()}><Printer size={15} /> Print / Export</button>
        <button style={btn(accent, "#fff")} disabled={busy || !dirty} onClick={save}><Save size={15} /> {busy ? "Saving…" : dirty ? "Save" : "Saved"}</button>
        {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg === "Saved" ? "#1f9d57" : "#c0392b" }}>{msg}</span>}
      </div>

      {/* the printable report */}
      <div className="ga-print" style={{ background: "#fff" }}>
        <div style={{ borderBottom: BD, paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: disp, fontSize: 22 }}>{client.name}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
            SEO Monthly Report · {ymLabel(month)}
          </div>
        </div>

        {/* Keyword rankings */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", marginBottom: 8 }}>Keyword rankings</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4b4560", marginBottom: 10 }}>
            {ks.total} tracked · <b>{ks.top10}</b> in top 10 · avg rank <b>{ks.avg == null ? "—" : `#${ks.avg}`}</b> · <span style={{ color: netColor }}>{netLabel}</span>
          </div>
          {keywords.length === 0 ? <Empty>No keywords tracked for this client.</Empty> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: BDt }}>
                  <th style={{ padding: "6px 8px" }}>Keyword</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Current</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Previous</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Movement</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => {
                  const m = movement(k);
                  return (
                    <tr key={k.id} style={{ borderBottom: "1px solid #f0ece2" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>{k.keyword || "(untitled)"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800 }}>{k.current_rank == null ? "—" : `#${k.current_rank}`}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#6b6580" }}>{k.previous_rank == null ? "—" : `#${k.previous_rank}`}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, color: m.color }}>{arrow(m.dir)} {m.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Organic search (Google Search Console) — only when the month has data */}
        {gscMonth && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", marginBottom: 8 }}>Organic search</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4b4560", marginBottom: 10 }}>
              Clicks <b>{gscMonth.clicks.toLocaleString()}</b>{vsPrev(gscMonth.clicks, gscPrev?.clicks)}
              {" · "}Impressions <b>{gscMonth.impressions.toLocaleString()}</b>{vsPrev(gscMonth.impressions, gscPrev?.impressions)}
              {" · "}Avg position <b>{gscMonth.position.toFixed(1)}</b>{gscPrev ? ` (prev ${gscPrev.position.toFixed(1)})` : ""}
            </div>
            {gscQueries.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: BDt }}>
                    <th style={{ padding: "6px 8px" }}>Top queries</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Clicks</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Impressions</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Avg position</th>
                  </tr>
                </thead>
                <tbody>
                  {gscQueries.map((q) => (
                    <tr key={q.query} style={{ borderBottom: "1px solid #f0ece2" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, wordBreak: "break-word" }}>{q.query}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800 }}>{(Number(q.clicks) || 0).toLocaleString()}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#6b6580" }}>{(Number(q.impressions) || 0).toLocaleString()}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800 }}>{q.position == null ? "—" : Number(q.position).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Deliverables */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", marginBottom: 8 }}>Deliverables</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4b4560", marginBottom: 10 }}>
            <b>{delivered}</b> delivered of <b>{deliverables.length}</b>
          </div>
          {deliverables.length === 0 ? <Empty>No deliverables logged for this client.</Empty> : (
            <div style={{ border: BDt, borderRadius: 8, overflow: "hidden" }}>
              {deliverables.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #f0ece2", fontSize: 13 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, border: BDt, textTransform: "uppercase", background: tint }}>{typeLabel(d.type)}</span>
                  <span style={{ flex: 1, fontWeight: 700 }}>{d.title || typeLabel(d.type)}{Number(d.quantity) > 1 ? ` ×${d.quantity}` : ""}</span>
                  <span style={{ fontWeight: 800, color: d.status === "delivered" ? "#1f9d57" : ink }}>{deliverableStatusLabel(d.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scope vs delivered (only shown when a retainer scope is set) */}
        {scope.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", marginBottom: 8 }}>Scope delivered</div>
            <div style={{ border: BDt, borderRadius: 8, overflow: "hidden" }}>
              {scope.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #f0ece2", fontSize: 13 }}>
                  <span style={{ flex: 1, fontWeight: 700 }}>{typeLabel(r.type)}</span>
                  <span style={{ color: "#6b6580", fontWeight: 700 }}>{r.delivered} / {r.included}</span>
                  <span style={{ fontWeight: 800, minWidth: 92, textAlign: "right", color: r.state === "over" ? "#c0392b" : r.state === "complete" ? "#1f9d57" : "#6b6580" }}>
                    {r.state === "over" ? `Over +${r.delta}` : r.state === "complete" ? "Complete" : `${Math.max(0, -r.delta)} to go`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Narrative */}
        <div>
          <div style={{ fontFamily: disp, fontSize: 14, textTransform: "uppercase", marginBottom: 8 }}>Summary &amp; wins</div>
          <textarea
            className="no-print"
            style={{ ...input, minHeight: 120, resize: "vertical" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write the story clients actually read — what you did this month, the wins, and what's next…"
          />
          <div className="print-only" style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {draft || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

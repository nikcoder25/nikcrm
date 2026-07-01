import React, { useState, useEffect } from "react";
import { Printer, Save } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn, sel, input } from "../lib/theme";
import { typeLabel, deliverableStatusLabel } from "../lib/constants";
import { ym, ymLabel } from "../lib/format";
import { keywordSummary, movement } from "./Keywords";
import { saveReport } from "../lib/api";
import { Empty } from "./ui";

const arrow = (dir) => (dir === "up" ? "▲" : dir === "down" ? "▼" : dir === "new" ? "•" : "–");

export default function ClientReport({ client, keywords = [], deliverables = [], reports = [], onChanged }) {
  const [month, setMonth] = useState(ym(new Date()));
  const savedForMonth = reports.find((r) => r.period === month)?.summary || "";
  const [draft, setDraft] = useState(savedForMonth);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Load the saved narrative whenever the selected month changes.
  useEffect(() => {
    setDraft(reports.find((r) => r.period === month)?.summary || "");
    setMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

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
  const dirty = draft !== savedForMonth;

  const save = async () => {
    setBusy(true); setMsg("");
    try { await saveReport(client.id, month, draft); await onChanged(); setMsg("Saved"); }
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

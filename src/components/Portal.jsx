import React, { useEffect, useMemo, useState } from "react";
import { ink, accent, cream, tint, disp, BD, BDt, SH, SHs, sel, globalCss } from "../lib/theme";
import { STATUS_LABEL, typeLabel, deliverableStatusLabel } from "../lib/constants";
import { ym, ymLabel } from "../lib/format";
import { portalLoad } from "../lib/api";
import { scopeRows } from "../lib/scope";
import { KeywordRows, keywordSummary } from "./Keywords";
import { Center, Empty } from "./ui";

// Public, read-only client view at /portal/:token. No session, no editing —
// the API's portalLoad action only ever returns this client's portal-safe
// fields, so nothing sensitive can reach this page in the first place.

const card = { background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 22, marginBottom: 18 };
const h2 = { fontFamily: disp, fontSize: 14, textTransform: "uppercase", marginBottom: 12 };
const muted = { fontSize: 12.5, fontWeight: 700, color: "#6b6580" };

const inMonth = (dateStr, month) => Boolean(dateStr) && String(dateStr).slice(0, 7) === month;

// "Growth Atlas" -> "GA" for the header badge.
const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "GA";

function Shell({ agency, children }) {
  return (
    <div style={{ minHeight: "100vh", background: cream, color: ink, fontFamily: "'Inter',sans-serif", padding: "30px 16px" }}>
      <style>{globalCss}</style>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {children}
        <div style={{ textAlign: "center", ...muted, fontSize: 11.5, padding: "10px 0 24px" }}>
          Powered by {agency || "Growth Atlas"}
        </div>
      </div>
    </div>
  );
}

export default function Portal({ token }) {
  const [status, setStatus] = useState("loading"); // loading | invalid | error | loaded
  const [data, setData] = useState(null);
  const [month, setMonth] = useState("");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    portalLoad(token)
      .then((d) => { if (alive) { setData(d); setStatus("loaded"); } })
      .catch((e) => { if (alive) setStatus(e?.status === 404 ? "invalid" : "error"); });
    return () => { alive = false; };
  }, [token]);

  // Months that have a saved report or a deliverable due; newest first. Falls
  // back to the current month so a brand-new client still gets a sane page.
  const months = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    (data.client_reports || []).forEach((r) => { if (r.period) set.add(r.period); });
    (data.deliverables || []).forEach((d) => { if (d.due_date) set.add(String(d.due_date).slice(0, 7)); });
    if (!set.size) set.add(ym(new Date()));
    return [...set].sort().reverse();
  }, [data]);

  if (status === "loading") return <Shell><Center>Loading report…</Center></Shell>;
  if (status !== "loaded") {
    return (
      <Shell>
        <div style={{ ...card, textAlign: "center", padding: "48px 22px" }}>
          <div style={{ fontFamily: disp, fontSize: 18, marginBottom: 8 }}>
            {status === "invalid" ? "This link is invalid or has been disabled." : "Could not load this report."}
          </div>
          <div style={muted}>
            {status === "invalid" ? "Ask your SEO team for a fresh link." : "Please try again in a moment."}
          </div>
        </div>
      </Shell>
    );
  }

  const agency = data.agency?.name || "Growth Atlas";
  const client = data.client || {};
  const keywords = data.keywords || [];
  const activeMonth = months.includes(month) ? month : months[0];

  const monthDeliverables = (data.deliverables || []).filter((d) => inMonth(d.due_date, activeMonth));
  const delivered = monthDeliverables.filter((d) => d.status === "delivered").length;
  const summary = (data.client_reports || []).find((r) => r.period === activeMonth)?.summary || "";

  // scopeRows expects rows keyed by client_id / id; portalLoad strips both
  // (there is only ever one client here), so decorate with a synthetic id.
  const CID = "portal";
  const scope = scopeRows(
    (data.retainers || []).map((r) => ({ ...r, id: r.type, client_id: CID })),
    (data.deliverables || []).map((d) => ({ ...d, client_id: CID })),
    CID, activeMonth,
  );

  const ks = keywordSummary(keywords);
  const netImprovement = keywords.reduce((s, k) => (k.current_rank != null && k.previous_rank != null ? s + (Number(k.previous_rank) - Number(k.current_rank)) : s), 0);
  const netLabel = netImprovement > 0 ? `+${netImprovement} positions gained`
    : netImprovement < 0 ? `${netImprovement} positions lost` : "no net change";
  const netColor = netImprovement > 0 ? "#1f9d57" : netImprovement < 0 ? "#c0392b" : "#6b6580";
  const meta = [client.niche, client.package && `${client.package} package`, client.start_month && `since ${ymLabel(client.start_month)}`]
    .filter(Boolean).join(" · ");

  return (
    <Shell agency={agency}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 15, border: BD, boxShadow: SHs, flexShrink: 0 }}>
          {initials(agency)}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: disp, fontSize: 23, lineHeight: 1.1 }}>{client.name}</span>
            <span style={{ padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 800, border: BDt, background: client.status === "active" ? accent : "#fff", color: client.status === "active" ? "#fff" : ink }}>
              {STATUS_LABEL[client.status] || client.status}
            </span>
          </div>
          <div style={{ ...muted, marginTop: 3 }}>Prepared by {agency}{meta ? ` · ${meta}` : ""}</div>
        </div>
        <select style={{ ...sel, flex: "none", minWidth: 140 }} value={activeMonth} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
        </select>
      </div>

      {/* keyword rankings */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ ...h2, marginBottom: 0, flex: 1 }}>Keyword rankings</div>
          {keywords.length > 0 && (
            <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
              avg {ks.avg == null ? "—" : `#${ks.avg}`} · {ks.top10} in top 10
            </span>
          )}
        </div>
        {keywords.length > 0 && (
          <div style={{ ...muted, margin: "8px 0 12px" }}>
            {ks.total} tracked · <span style={{ color: netColor }}>{netLabel}</span>
          </div>
        )}
        <div style={{ border: BDt, borderRadius: 10, overflow: "hidden", marginTop: keywords.length ? 0 : 12 }}>
          <KeywordRows keywords={keywords} history={data.keyword_history || []} />
        </div>
      </div>

      {/* deliverables for the selected month */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ ...h2, marginBottom: 0, flex: 1 }}>Deliverables — {ymLabel(activeMonth)}</div>
          {monthDeliverables.length > 0 && (
            <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
              {delivered} of {monthDeliverables.length} delivered
            </span>
          )}
        </div>
        {monthDeliverables.length === 0 ? (
          <Empty>No deliverables scheduled for this month.</Empty>
        ) : (
          <div style={{ border: BDt, borderRadius: 10, overflow: "hidden" }}>
            {monthDeliverables.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f0ece2", fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, border: BDt, textTransform: "uppercase", background: tint }}>{typeLabel(d.type)}</span>
                <span style={{ flex: 1, minWidth: 140, fontWeight: 700 }}>{d.title || typeLabel(d.type)}{Number(d.quantity) > 1 ? ` ×${d.quantity}` : ""}</span>
                <span style={{ ...muted, fontSize: 12 }}>{d.due_date ? String(d.due_date).slice(0, 10) : ""}</span>
                <span style={{ fontWeight: 800, color: d.status === "delivered" ? "#1f9d57" : ink }}>{deliverableStatusLabel(d.status)}</span>
              </div>
            ))}
          </div>
        )}

        {/* retainer scope: included vs delivered (only when a scope is set) */}
        {scope.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={h2}>Scope delivered</div>
            <div style={{ border: BDt, borderRadius: 10, overflow: "hidden" }}>
              {scope.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f0ece2", fontSize: 13 }}>
                  <span style={{ flex: 1, fontWeight: 700 }}>{typeLabel(r.type)}</span>
                  <span style={{ ...muted, fontSize: 12.5 }}>{r.delivered} / {r.included}</span>
                  <span style={{ fontWeight: 800, minWidth: 92, textAlign: "right", color: r.state === "over" ? "#c0392b" : r.state === "complete" ? "#1f9d57" : "#6b6580" }}>
                    {r.state === "over" ? `Over +${r.delta}` : r.state === "complete" ? "Complete" : `${Math.max(0, -r.delta)} to go`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* monthly narrative */}
      {summary && (
        <div style={card}>
          <div style={h2}>Summary &amp; wins — {ymLabel(activeMonth)}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.65, fontWeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {summary}
          </div>
        </div>
      )}
    </Shell>
  );
}

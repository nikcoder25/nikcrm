import React, { useState, useMemo, useDeferredValue } from "react";
import { Pencil, Trash2, Download, Search, Plus } from "lucide-react";
import { ink, accent, tint, btn, iconBtn, sel, input } from "../lib/theme";
import { STATUSES, STATUS_LABEL } from "../lib/constants";
import { downloadCsv, clientsCsv } from "../lib/csv";
import { computeHealth } from "../lib/health";
import { money, ymLabel } from "../lib/format";
import { Panel, Empty, HealthBadge } from "./ui";

const GRAY = "#6b6580";
const MUTED = "#a39db5";

// Bucket a list by client_id once, so per-row lookups are O(1).
const groupBy = (rows) => {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.client_id)) m.set(r.client_id, []); m.get(r.client_id).push(r); }
  return m;
};

// Risk pill colours mirror the spreadsheet's traffic-light feel.
const RISK_STYLE = {
  low: { background: "#d7f5df", color: "#1b7a3d" },
  medium: { background: "#fdf0d5", color: "#8a5a0f" },
  high: { background: "#f7dede", color: "#c0392b" },
};

/* ---------------- Clients ---------------- */
export default function Clients({ clients, deliverables = [], payments = [], tasks = [], keywords = [], activities = [], isAdmin, onOpen, onEdit, onDelete, onAdd }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState("");
  // Deferring the query keeps typing snappy even with hundreds of rows.
  const q = useDeferredValue(query).trim().toLowerCase();

  // Compute a health score per client from data grouped once by client_id.
  const healthByClient = useMemo(() => {
    const dels = groupBy(deliverables), pays = groupBy(payments), tks = groupBy(tasks), kws = groupBy(keywords), acts = groupBy(activities);
    const m = new Map();
    for (const c of clients) {
      m.set(c.id, computeHealth(c, {
        deliverables: dels.get(c.id) || [], payments: pays.get(c.id) || [],
        tasks: tks.get(c.id) || [], keywords: kws.get(c.id) || [], activities: acts.get(c.id) || [],
      }));
    }
    return m;
  }, [clients, deliverables, payments, tasks, keywords, activities]);

  const filtered = useMemo(() => clients.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (healthFilter && (healthByClient.get(c.id)?.band || "") !== healthFilter) return false;
    if (!q) return true;
    return [c.name, c.niche, c.team_member, c.source, c.package]
      .some((v) => (v || "").toLowerCase().includes(q));
  }), [clients, q, statusFilter, healthFilter, healthByClient]);

  // Group deliverables by client once instead of filtering the whole list per row.
  const delsByClient = useMemo(() => {
    const m = new Map();
    for (const d of deliverables) {
      if (!m.has(d.client_id)) m.set(d.client_id, { total: 0, delivered: 0 });
      const g = m.get(d.client_id);
      g.total += 1;
      if (d.status === "delivered") g.delivered += 1;
    }
    return m;
  }, [deliverables]);

  const cell = { fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" };
  // All columns are fluid (minmax(0,…fr)) so the table always fits its container
  // width — no horizontal scroll. Cells clip with ellipsis when space is tight.
  const GRID = "minmax(0,1.7fr) minmax(0,0.95fr) minmax(0,1.15fr) minmax(0,1fr) minmax(0,0.95fr) minmax(0,0.85fr) minmax(0,0.7fr) minmax(0,1fr) minmax(0,0.85fr) minmax(0,0.9fr) minmax(0,0.75fr) minmax(0,0.95fr) 66px";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#a39db5" }} />
          <input
            style={{ ...input, paddingLeft: 36 }}
            placeholder="Search name, niche, team member, source…"
            aria-label="Search clients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select style={{ ...sel, flex: "none", minWidth: 130 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 130 }} value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} aria-label="Filter by health">
          <option value="">All health</option>
          <option value="good">Healthy</option>
          <option value="watch">Watch</option>
          <option value="risk">At risk</option>
        </select>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6580", whiteSpace: "nowrap" }}>
          {filtered.length} of {clients.length}
        </span>
        <button style={btn("#fff", ink)} disabled={filtered.length === 0} onClick={() => downloadCsv("clients.csv", clientsCsv(filtered))}>
          <Download size={15} /> Export CSV
        </button>
      </div>
      {clients.length === 0 ? (
        <Panel><Empty action={onAdd && <button style={btn(accent, "#fff")} onClick={onAdd}><Plus size={16} /> Add client</button>}>
          No clients yet. Add your first client to get started.
        </Empty></Panel>
      ) : filtered.length === 0 ? <Panel><Empty>No clients match your search.</Empty></Panel> : (
    <Panel>
      <div>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "12px 16px", borderBottom: "2px solid #f0ece2" }}>
            <span style={th}>Name</span>
            <span style={th}>Status</span>
            <span style={th}>Health</span>
            <span style={th}>Niche</span>
            <span style={th}>Package</span>
            <span style={th}>Source</span>
            <span style={th}>Fee</span>
            <span style={th}>Team</span>
            <span style={th}>Start</span>
            <span style={th}>Renewal</span>
            <span style={th}>Risk</span>
            <span style={th}>Deliverables</span>
            <span />
          </div>
          {filtered.map((c) => {
            const dels = delsByClient.get(c.id);
            const risk = RISK_STYLE[c.risk];
            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "11px 16px", borderBottom: "1px solid #f0ece2" }}>
                {/* Clicking the client opens the full detail view */}
                <span
                  onClick={() => onOpen(c)}
                  style={{ ...cell, fontWeight: 800, cursor: "pointer" }}
                  title={`${c.name} — view details`}
                >
                  {c.name}
                </span>
                <span style={{ minWidth: 0, padding: "4px 6px", borderRadius: 7, fontSize: 11, fontWeight: 800, textAlign: "center", border: "2px solid " + ink, background: c.status === "active" ? accent : "#fff", color: c.status === "active" ? "#fff" : ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={STATUS_LABEL[c.status] || c.status}>
                  {STATUS_LABEL[c.status] || c.status}
                </span>
                <span style={{ minWidth: 0, overflow: "hidden", display: "block" }}><HealthBadge health={healthByClient.get(c.id)} size="sm" /></span>
                <span style={{ ...cell, color: c.niche ? ink : MUTED }} title={c.niche}>{c.niche || "—"}</span>
                <span style={{ ...cell, color: c.package ? GRAY : MUTED }} title={c.package}>{c.package || "—"}</span>
                {c.source ? (
                  <span style={{ minWidth: 0, fontSize: 10.5, fontWeight: 800, background: tint, color: ink, padding: "3px 6px", borderRadius: 6, border: "2px solid " + ink, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.source}>{c.source}</span>
                ) : <span style={{ ...cell, color: MUTED }}>—</span>}
                <span style={{ ...cell, color: Number(c.fee) > 0 ? ink : MUTED }}>{Number(c.fee) > 0 ? money(c.fee) : "—"}</span>
                <span style={{ ...cell, color: c.team_member ? ink : MUTED }} title={c.team_member}>{c.team_member || "—"}</span>
                <span style={{ ...cell, color: c.start_month ? GRAY : MUTED }}>{c.start_month ? ymLabel(c.start_month) : "—"}</span>
                <span style={{ ...cell, color: c.renewal_month ? GRAY : MUTED }}>{c.renewal_month ? ymLabel(c.renewal_month) : "—"}</span>
                {risk ? (
                  <span style={{ ...risk, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "3px 6px", borderRadius: 6, fontSize: 11, fontWeight: 800, textAlign: "center", textTransform: "capitalize" }}>{c.risk}</span>
                ) : <span style={{ ...cell, color: MUTED }}>—</span>}
                {dels && dels.total > 0 ? (
                  <span title="Deliverables delivered / total" style={{ minWidth: 0, overflow: "hidden", fontSize: 11, fontWeight: 800, background: "#fff", color: ink, padding: "4px 6px", borderRadius: 7, border: "2px solid " + ink, textAlign: "center", whiteSpace: "nowrap" }}>
                    {dels.delivered}/{dels.total}
                  </span>
                ) : <span style={{ ...cell, color: MUTED }}>—</span>}
                <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                  <button style={{ ...iconBtn, padding: 5 }} title="Edit" aria-label={`Edit ${c.name}`} onClick={() => onEdit(c)}><Pencil size={13} /></button>
                  {isAdmin && <button style={{ ...iconBtn, padding: 5 }} title="Delete" aria-label={`Delete ${c.name}`} onClick={() => onDelete(c.id)}><Trash2 size={13} /></button>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
      )}
    </div>
  );
}

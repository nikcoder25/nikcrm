import React, { useState, useMemo, useDeferredValue } from "react";
import { Pencil, Trash2, ChevronRight, Download, Search } from "lucide-react";
import { ink, accent, tint, btn, iconBtn, sel, input } from "../lib/theme";
import { STATUSES, STATUS_LABEL } from "../lib/constants";
import { downloadCsv, clientsCsv } from "../lib/csv";
import { Panel, Empty } from "./ui";

/* ---------------- Clients ---------------- */
export default function Clients({ clients, deliverables = [], isAdmin, onOpen, onEdit, onDelete }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Deferring the query keeps typing snappy even with hundreds of rows.
  const q = useDeferredValue(query).trim().toLowerCase();

  const filtered = useMemo(() => clients.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (!q) return true;
    return [c.name, c.niche, c.team_member, c.source, c.package]
      .some((v) => (v || "").toLowerCase().includes(q));
  }), [clients, q, statusFilter]);

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

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#a39db5" }} />
          <input
            style={{ ...input, paddingLeft: 36 }}
            placeholder="Search name, niche, team member, source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select style={{ ...sel, flex: "none", minWidth: 130 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6580", whiteSpace: "nowrap" }}>
          {filtered.length} of {clients.length}
        </span>
        <button style={btn("#fff", ink)} disabled={filtered.length === 0} onClick={() => downloadCsv("clients.csv", clientsCsv(filtered))}>
          <Download size={15} /> Export CSV
        </button>
      </div>
      {clients.length === 0 ? <Panel><Empty>No clients yet. Tap "Add client".</Empty></Panel> :
       filtered.length === 0 ? <Panel><Empty>No clients match your search.</Empty></Panel> : (
    <Panel>
      {filtered.map((c) => {
        const dels = delsByClient.get(c.id);
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 20px", borderBottom: "2px solid #f0ece2" }}>
            {/* Clicking the client opens the full detail view */}
            <div
              onClick={() => onOpen(c)}
              style={{ flex: 1, minWidth: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
              title="View details"
            >
              <ChevronRight size={16} style={{ color: accent, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}
                  {c.source && <span style={{ fontSize: 10.5, fontWeight: 800, background: tint, color: ink, padding: "2px 9px", borderRadius: 6, marginLeft: 9, border: "2px solid " + ink }}>{c.source}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: "#6b6580", marginTop: 3, fontWeight: 600 }}>
                  {c.niche}{c.package ? ` · ${c.package}` : ""}{c.team_member ? ` · ${c.team_member}` : ""}{c.start_month ? ` · ${c.start_month}` : ""}
                </div>
              </div>
            </div>
            {dels && dels.total > 0 && (
              <span title="Deliverables delivered / total" style={{ fontSize: 11, fontWeight: 800, background: "#fff", color: ink, padding: "4px 10px", borderRadius: 7, border: "2px solid " + ink }}>
                {dels.delivered}/{dels.total} delivered
              </span>
            )}
            <span style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 800, border: "2px solid " + ink, background: c.status === "active" ? accent : "#fff", color: c.status === "active" ? "#fff" : ink }}>{STATUS_LABEL[c.status] || c.status}</span>
            <button style={iconBtn} title="Edit" onClick={() => onEdit(c)}><Pencil size={15} /></button>
            {isAdmin && <button style={iconBtn} title="Delete" onClick={() => onDelete(c.id)}><Trash2 size={15} /></button>}
          </div>
        );
      })}
    </Panel>
      )}
    </div>
  );
}

import React from "react";
import { Pencil, Trash2, ChevronRight } from "lucide-react";
import { ink, accent, tint, iconBtn } from "../lib/theme";
import { STATUS_LABEL } from "../lib/constants";
import { Panel, Empty } from "./ui";

/* ---------------- Clients ---------------- */
export default function Clients({ clients, deliverables = [], isAdmin, onOpen, onEdit, onDelete }) {
  if (clients.length === 0) return <Panel><Empty>No clients yet. Tap "Add client".</Empty></Panel>;
  return (
    <Panel>
      {clients.map((c) => {
        const dels = deliverables.filter((d) => d.client_id === c.id);
        const delivered = dels.filter((d) => d.status === "delivered").length;
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
            {dels.length > 0 && (
              <span title="Deliverables delivered / total" style={{ fontSize: 11, fontWeight: 800, background: "#fff", color: ink, padding: "4px 10px", borderRadius: 7, border: "2px solid " + ink }}>
                {delivered}/{dels.length} delivered
              </span>
            )}
            <span style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 800, border: "2px solid " + ink, background: c.status === "active" ? accent : "#fff", color: c.status === "active" ? "#fff" : ink }}>{STATUS_LABEL[c.status] || c.status}</span>
            <button style={iconBtn} title="Edit" onClick={() => onEdit(c)}><Pencil size={15} /></button>
            {isAdmin && <button style={iconBtn} title="Delete" onClick={() => onDelete(c.id)}><Trash2 size={15} /></button>}
          </div>
        );
      })}
    </Panel>
  );
}

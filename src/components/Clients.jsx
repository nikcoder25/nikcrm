import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ink, accent, tint, iconBtn } from "../lib/theme";
import { STATUS_LABEL } from "../lib/constants";
import { Panel, Empty } from "./ui";

/* ---------------- Clients ---------------- */
export default function Clients({ clients, isAdmin, onEdit, onDelete }) {
  if (clients.length === 0) return <Panel><Empty>No clients yet. Tap "Add client".</Empty></Panel>;
  return (
    <Panel>
      {clients.map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 20px", borderBottom: "2px solid #f0ece2" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}
              {c.source && <span style={{ fontSize: 10.5, fontWeight: 800, background: tint, color: ink, padding: "2px 9px", borderRadius: 6, marginLeft: 9, border: "2px solid " + ink }}>{c.source}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "#6b6580", marginTop: 3, fontWeight: 600 }}>
              {c.niche}{c.package ? ` · ${c.package}` : ""}{c.team_member ? ` · ${c.team_member}` : ""}{c.start_month ? ` · ${c.start_month}` : ""}
            </div>
          </div>
          <span style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 800, border: "2px solid " + ink, background: c.status === "active" ? accent : "#fff", color: c.status === "active" ? "#fff" : ink }}>{STATUS_LABEL[c.status] || c.status}</span>
          <button style={iconBtn} onClick={() => onEdit(c)}><Pencil size={15} /></button>
          {isAdmin && <button style={iconBtn} onClick={() => onDelete(c.id)}><Trash2 size={15} /></button>}
        </div>
      ))}
    </Panel>
  );
}

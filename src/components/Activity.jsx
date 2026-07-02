import React from "react";
import { History } from "lucide-react";
import { tint, disp, BD, BDt } from "../lib/theme";
import { timeAgo } from "../lib/format";
import { Panel, Empty } from "./ui";

/* ---------------- Activity (audit trail) ---------------- */
// Shared feed rows: "{actor} {verb} {entity_label}" + detail, a client chip
// when the client still exists, and a relative timestamp. Reused compactly
// on the Overview ("Recent activity").
export function ActivityFeed({ items, clients }) {
  const nameOf = (id) => clients.find((c) => c.id === id)?.name || "";
  if (!items.length) return <Empty>No activity yet — changes your team makes will show up here.</Empty>;
  return items.map((a) => {
    const clientName = nameOf(a.client_id);
    return (
      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: "2px solid #f0ece2", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180, fontSize: 13.5, fontWeight: 600 }}>
          <span style={{ fontWeight: 800 }}>{a.actor || "Someone"}</span>
          {" "}{a.verb}
          {a.entity_label && <> <span style={{ fontWeight: 800 }}>{a.entity_label}</span></>}
          {a.detail && <span style={{ color: "#6b6580" }}> {a.detail}</span>}
        </div>
        {clientName && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 7, border: BDt, background: tint, whiteSpace: "nowrap" }}>{clientName}</span>}
        <span style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 700, minWidth: 62, textAlign: "right" }}>{timeAgo(a.created_at)}</span>
      </div>
    );
  });
}

export default function Activity({ items, clients }) {
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px", borderBottom: BD, fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>
        <History size={16} /> Activity
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#6b6580", fontFamily: "'Inter',sans-serif", textTransform: "none" }}>last {items.length} events</span>
      </div>
      <ActivityFeed items={items} clients={clients} />
    </Panel>
  );
}

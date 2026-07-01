import React, { useMemo } from "react";
import { accent, disp, BD, BDt, SH } from "../lib/theme";
import { Panel, Empty } from "./ui";

/* ---------------- Team ---------------- */
export default function Team({ clients, tasks }) {
  const members = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.team_member && set.add(c.team_member));
    tasks.forEach((t) => t.assignee && set.add(t.assignee));
    return [...set];
  }, [clients, tasks]);
  if (members.length === 0) return <Panel><Empty>No team members assigned yet. Assign people to clients or tasks.</Empty></Panel>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(225px,1fr))", gap: 16 }}>
      {members.map((m) => {
        const active = clients.filter((c) => c.team_member === m && c.status === "active").length;
        const open = tasks.filter((t) => t.assignee === m && (t.status || "todo") !== "done").length;
        const done = tasks.filter((t) => t.assignee === m && t.status === "done").length;
        return (
          <div key={m} style={{ background: "#fff", border: BD, borderRadius: 16, padding: 20, boxShadow: SH }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 19, border: BDt, marginBottom: 12 }}>{m.charAt(0).toUpperCase()}</div>
            <div style={{ fontFamily: disp, fontSize: 16, marginBottom: 10 }}>{m}</div>
            <div style={{ fontSize: 13, color: "#4b4560", display: "flex", flexDirection: "column", gap: 6, fontWeight: 600 }}>
              <div><b>{active}</b> active clients</div>
              <div><b>{open}</b> open tasks · <b>{done}</b> done</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import React, { useState, useMemo } from "react";
import { Plus, X, Filter } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, SHs, sel, btn, moveBtn } from "../lib/theme";
import { TASK_TYPES, TASK_STATES, typeLabel } from "../lib/constants";
import { isPastDue } from "../lib/format";

/* ---------------- Task Board ---------------- */
export default function Board({ clients, tasks, onAdd, onMove, onDelete }) {
  const wp = clients.filter((c) => c.status !== "ended" && c.status !== "loss");
  const [f, setF] = useState({ client_id: "", title: "", type: "guest", assignee: "", due: "" });
  const [filterClient, setFilterClient] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const nameOf = (id) => (clients.find((c) => c.id === id)?.name) || "";
  const add = () => {
    if (!f.client_id || !f.title.trim()) return;
    onAdd({ client_id: f.client_id, title: f.title, type: f.type, assignee: f.assignee, status: "todo", due: f.due || null });
    setF({ ...f, title: "", assignee: "", due: "" });
  };
  const assignees = useMemo(() => [...new Set(tasks.map((t) => t.assignee).filter(Boolean))].sort(), [tasks]);
  const visible = useMemo(() => tasks.filter((t) =>
    (!filterClient || t.client_id === filterClient) &&
    (!filterAssignee || t.assignee === filterAssignee)
  ), [tasks, filterClient, filterAssignee]);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", background: "#fff", border: BD, borderRadius: 14, padding: 14, boxShadow: SH, marginBottom: 12 }}>
        <select style={sel} value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
          <option value="">Client...</option>
          {wp.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {TASK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input style={{ ...sel, flex: 2, minWidth: 150 }} placeholder="Task title (e.g. Guest post on hvacblog.com)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input style={sel} placeholder="Assignee" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} />
        <input type="date" style={sel} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        <button style={btn(accent, "#fff")} onClick={add}><Plus size={16} /> Add</button>
      </div>
      {/* Board filters — essential once you're juggling dozens of clients */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <Filter size={15} style={{ color: "#6b6580" }} />
        <select style={{ ...sel, flex: "none", minWidth: 160 }} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 140 }} value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
          <option value="">All assignees</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filterClient || filterAssignee) && (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6580" }}>
            {visible.length} of {tasks.length} tasks
          </span>
        )}
      </div>
      <div className="board" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {TASK_STATES.map((col) => {
          const items = visible.filter((t) => (t.status || "todo") === col.key);
          const bg = col.key === "todo" ? "#f0ece2" : col.key === "doing" ? tint : "#ded7f5";
          const idx = TASK_STATES.findIndex((s) => s.key === col.key);
          return (
            <div key={col.key} style={{ background: bg, border: BD, borderRadius: 16, padding: 14, minHeight: 180, boxShadow: SH }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: disp, fontSize: 15, textTransform: "uppercase", padding: "2px 4px 14px" }}>
                <span>{col.label}</span><span style={{ background: ink, color: "#fff", borderRadius: 20, padding: "2px 11px", fontSize: 12.5 }}>{items.length}</span>
              </div>
              {items.length === 0 && <div style={{ textAlign: "center", padding: "18px 0", opacity: 0.5, fontWeight: 700, fontSize: 12.5 }}>Nothing here</div>}
              {items.map((t) => (
                <div key={t.id} style={{ background: "#fff", border: BDt, borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: SHs }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: "2px solid " + ink, textTransform: "uppercase", background: tint }}>{typeLabel(t.type)}</span>
                    <button style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.4 }} onClick={() => onDelete(t.id)}><X size={13} /></button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, margin: "10px 0 5px" }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "#6b6580", fontWeight: 600 }}>{nameOf(t.client_id)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, padding: "3px 9px", borderRadius: 6, border: "2px solid " + ink }}>{t.assignee || "Unassigned"}</span>
                    {t.due && (() => {
                      const overdue = isPastDue(t.due) && (t.status || "todo") !== "done";
                      return <span style={{ fontSize: 11, color: overdue ? "#c0392b" : "#6b6580", fontWeight: overdue ? 800 : 700 }}>{overdue ? "⚠ " : ""}{t.due}</span>;
                    })()}
                  </div>
                  <div style={{ display: "flex", gap: 7, marginTop: 12, borderTop: "2px solid #eee", paddingTop: 11 }}>
                    {idx > 0 && <button style={moveBtn(false)} onClick={() => onMove(t.id, TASK_STATES[idx - 1].key)}>‹ {TASK_STATES[idx - 1].label}</button>}
                    {idx < 2 && <button style={moveBtn(true)} onClick={() => onMove(t.id, TASK_STATES[idx + 1].key)}>{TASK_STATES[idx + 1].label} ›</button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

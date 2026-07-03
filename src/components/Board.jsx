import React, { useMemo, useRef, useState } from "react";
import { X, Filter, Search } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, SHs, sel, moveBtn } from "../lib/theme";
import { TASK_STATES, typeLabel } from "../lib/constants";
import { isPastDue } from "../lib/format";
import { assigneeOptions } from "./ui";
import QuickAddTask from "./QuickAddTask";

/* ---------------- Task Board ---------------- */
export default function Board({ clients, tasks, members = [], onAdd, onMove, onAssign, onDelete }) {
  const wp = clients.filter((c) => c.status !== "ended" && c.status !== "loss");
  const [filterClient, setFilterClient] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const titleRef = useRef(null);

  const nameOf = (id) => (clients.find((c) => c.id === id)?.name) || "";

  // Filter options: roster names, plus any legacy assignees still on tasks.
  const assigneeNames = useMemo(() => {
    const s = new Set(members.map((m) => m.name));
    tasks.forEach((t) => t.assignee && s.add(t.assignee));
    return [...s].sort();
  }, [members, tasks]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => tasks.filter((t) =>
    (!filterClient || t.client_id === filterClient) &&
    (!filterAssignee || (filterAssignee === "__none" ? !t.assignee : t.assignee === filterAssignee)) &&
    (!q || `${t.title || ""} ${nameOf(t.client_id)} ${typeLabel(t.type)}`.toLowerCase().includes(q))
  ), [tasks, clients, filterClient, filterAssignee, q]);

  const drop = (colKey) => {
    setOverCol(null);
    if (dragId != null) {
      const t = tasks.find((x) => x.id === dragId);
      // Skip the write when the card is dropped back in its own column.
      if (t && (t.status || "todo") !== colKey) onMove(dragId, colKey);
      setDragId(null);
    }
  };

  return (
    <div>
      {/* Natural-language quick add (type or dictate a whole task in one line) */}
      <QuickAddTask clients={wp} members={members} onAdd={onAdd} inputRef={titleRef} />

      {/* Board filters — essential once you're juggling dozens of clients */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <Filter size={15} style={{ color: "#6b6580" }} aria-hidden="true" />
        <label style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 180 }}>
          <Search size={15} style={{ position: "absolute", left: 11, color: "#6b6580" }} aria-hidden="true" />
          <span style={srOnly}>Search tasks</span>
          <input style={{ ...sel, flex: 1, paddingLeft: 34 }} placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select style={{ ...sel, flex: "none", minWidth: 160 }} value={filterClient} onChange={(e) => setFilterClient(e.target.value)} aria-label="Filter by client">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 150 }} value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} aria-label="Filter by assignee">
          <option value="">All assignees</option>
          <option value="__none">Unassigned</option>
          {assigneeNames.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filterClient || filterAssignee || q) && (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6580" }}>{visible.length} of {tasks.length} tasks</span>
        )}
      </div>

      <div className="board" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {TASK_STATES.map((col) => {
          const items = visible.filter((t) => (t.status || "todo") === col.key);
          const bg = col.key === "todo" ? "#f0ece2" : col.key === "doing" ? tint : "#ded7f5";
          const idx = TASK_STATES.findIndex((s) => s.key === col.key);
          const isOver = overCol === col.key;
          return (
            <div key={col.key}
              onDragOver={(e) => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
              onDrop={() => drop(col.key)}
              style={{ background: bg, border: isOver ? `3px dashed ${accent}` : BD, borderRadius: 16, padding: 14, minHeight: 180, boxShadow: SH, transition: "border-color .1s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: disp, fontSize: 15, textTransform: "uppercase", padding: "2px 4px 14px" }}>
                <h2 style={{ fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>{col.label}</h2>
                <span style={{ background: ink, color: "#fff", borderRadius: 20, padding: "2px 11px", fontSize: 12.5 }}>{items.length}</span>
              </div>
              {items.length === 0 && (col.key === "todo" ? (
                <button onClick={() => titleRef.current?.focus()} style={{ width: "100%", textAlign: "center", padding: "18px 0", opacity: 0.55, fontWeight: 700, fontSize: 12.5, background: "none", border: "none", cursor: "pointer", color: ink }}>
                  + Add a task
                </button>
              ) : (
                <div style={{ textAlign: "center", padding: "18px 0", opacity: 0.45, fontWeight: 700, fontSize: 12.5 }}>{dragId != null ? "Drop here" : "Nothing here"}</div>
              ))}
              {items.map((t) => (
                <div key={t.id} draggable
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  style={{ background: "#fff", border: BDt, borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: SHs, cursor: "grab", opacity: dragId === t.id ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: "2px solid " + ink, textTransform: "uppercase", background: tint }}>{typeLabel(t.type)}</span>
                    <button style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.4 }} aria-label={`Delete task ${t.title}`} onClick={() => onDelete(t.id)}><X size={13} /></button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, margin: "10px 0 5px" }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "#6b6580", fontWeight: 600 }}>{nameOf(t.client_id)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <select value={t.assignee || ""} onChange={(e) => onAssign(t.id, e.target.value)} aria-label={`Assignee for ${t.title}`}
                      style={{ fontSize: 11.5, fontWeight: 800, background: tint, padding: "4px 8px", borderRadius: 6, border: "2px solid " + ink, color: ink, maxWidth: 150 }}>
                      {assigneeOptions(members, t.assignee).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
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

const srOnly = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

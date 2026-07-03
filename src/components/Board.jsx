import React, { useMemo, useRef, useState } from "react";
import { X, Filter, Search, Trash2, CalendarClock } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, SHs, sel, btn, input, lbl } from "../lib/theme";
import { TASK_STATES, TASK_TYPES, typeLabel, taskStatusLabel } from "../lib/constants";
import { isPastDue, dateLabel } from "../lib/format";
import { assigneeOptions, Modal, Field, Pick, Row } from "./ui";
import QuickAddTask from "./QuickAddTask";

// Column tints, keyed by status; anything unmapped falls back to the neutral one.
const COL_BG = { todo: "#f0ece2", doing: tint, review: "#dfeaf7", blocked: "#f7e4e4", done: "#ded7f5" };

/* ---------------- Task Board ---------------- */
export default function Board({ clients, tasks, members = [], onAdd, onUpdate, onMove, onAssign, onDelete }) {
  const wp = clients.filter((c) => c.status !== "ended" && c.status !== "loss");
  const [filterClient, setFilterClient] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [detail, setDetail] = useState(null); // task open in the detail modal
  const titleRef = useRef(null);

  const nameOf = (id) => (clients.find((c) => c.id === id)?.name) || "";

  const assigneeNames = useMemo(() => {
    const s = new Set(members.map((m) => m.name));
    tasks.forEach((t) => t.assignee && s.add(t.assignee));
    return [...s].sort();
  }, [members, tasks]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => tasks.filter((t) =>
    (!filterClient || t.client_id === filterClient) &&
    (!filterAssignee || (filterAssignee === "__none" ? !t.assignee : t.assignee === filterAssignee)) &&
    (!q || `${t.title || ""} ${t.description || ""} ${nameOf(t.client_id)} ${typeLabel(t.type)}`.toLowerCase().includes(q))
  ), [tasks, clients, filterClient, filterAssignee, q]);

  const drop = (colKey) => {
    setOverCol(null);
    if (dragId != null) {
      const t = tasks.find((x) => x.id === dragId);
      if (t && (t.status || "todo") !== colKey) onMove(dragId, colKey);
      setDragId(null);
    }
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div>
      {/* Free-form quick add — a title is all you need; everything else is optional */}
      <QuickAddTask clients={wp} members={members} onAdd={onAdd} inputRef={titleRef} />

      {/* Board filters */}
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

      {/* Columns scroll horizontally when they don't all fit; stack on mobile. */}
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div className="board" style={{ display: "grid", gridTemplateColumns: `repeat(${TASK_STATES.length}, minmax(224px, 1fr))`, gap: 16 }}>
          {TASK_STATES.map((col) => {
            const items = visible.filter((t) => (t.status || "todo") === col.key);
            const isOver = overCol === col.key;
            return (
              <div key={col.key}
                onDragOver={(e) => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
                onDrop={() => drop(col.key)}
                style={{ background: COL_BG[col.key] || "#f0ece2", border: isOver ? `3px dashed ${accent}` : BD, borderRadius: 16, padding: 14, minHeight: 180, boxShadow: SH, transition: "border-color .1s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 14px" }}>
                  <h2 style={{ fontFamily: disp, fontSize: 14.5, textTransform: "uppercase" }}>{col.label}</h2>
                  <span style={{ background: ink, color: "#fff", borderRadius: 20, padding: "2px 11px", fontSize: 12.5 }}>{items.length}</span>
                </div>
                {items.length === 0 && (col.key === "todo" ? (
                  <button onClick={() => titleRef.current?.focus()} style={{ width: "100%", textAlign: "center", padding: "18px 0", opacity: 0.55, fontWeight: 700, fontSize: 12.5, background: "none", border: "none", cursor: "pointer", color: ink }}>
                    + Add a task
                  </button>
                ) : (
                  <div style={{ textAlign: "center", padding: "18px 0", opacity: 0.45, fontWeight: 700, fontSize: 12.5 }}>{dragId != null ? "Drop here" : "Nothing here"}</div>
                ))}
                {items.map((t) => {
                  const overdue = t.due && isPastDue(t.due) && (t.status || "todo") !== "done";
                  return (
                    <div key={t.id} draggable
                      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => setDetail(t)}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setDetail(t); }}
                      title="Open task"
                      style={{ background: "#fff", border: BDt, borderRadius: 12, padding: 13, marginBottom: 12, boxShadow: SHs, cursor: "pointer", opacity: dragId === t.id ? 0.5 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: "2px solid " + ink, textTransform: "uppercase", background: tint }}>{typeLabel(t.type)}</span>
                        {t.due && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: overdue ? "#c0392b" : "#6b6580", fontWeight: overdue ? 800 : 700 }}><CalendarClock size={12} />{overdue ? "" : ""}{dateLabel(t.due)}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, margin: "10px 0 4px" }}>{t.title}</div>
                      {t.client_id && <div style={{ fontSize: 12, color: "#6b6580", fontWeight: 700 }}>{nameOf(t.client_id)}</div>}
                      {t.description && <div style={{ fontSize: 12, color: "#4b4560", fontWeight: 500, marginTop: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.description}</div>}
                      <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 11 }} onClick={stop}>
                        <select value={t.assignee || ""} onClick={stop} onChange={(e) => { stop(e); onAssign(t.id, e.target.value); }} aria-label={`Assignee for ${t.title}`}
                          style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 800, background: tint, padding: "5px 8px", borderRadius: 6, border: "2px solid " + ink, color: ink }}>
                          {assigneeOptions(members, t.assignee).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <select value={t.status || "todo"} onClick={stop} onChange={(e) => { stop(e); onMove(t.id, e.target.value); }} aria-label={`Status for ${t.title}`}
                          style={{ flex: "none", fontSize: 11.5, fontWeight: 800, background: "#fff", padding: "5px 8px", borderRadius: 6, border: "2px solid " + ink, color: ink }}>
                          {TASK_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {detail && (
        <TaskDetail
          task={detail}
          clients={clients}
          members={members}
          onClose={() => setDetail(null)}
          onSave={onUpdate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

/* ---------------- Task detail (clickable card → full editable brief) ---------------- */
function TaskDetail({ task, clients, members, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    id: task.id,
    title: task.title || "",
    description: task.description || "",
    client_id: task.client_id || "",
    type: task.type || "other",
    assignee: task.assignee || "",
    status: task.status || "todo",
    due: task.due ? String(task.due).slice(0, 10) : "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!String(f.title).trim() || busy) return;
    setBusy(true);
    try {
      await onSave({ ...f, client_id: f.client_id || null, due: f.due || null });
      onClose();
    } catch { /* Dashboard toasts the error; keep the modal open to retry */ }
    setBusy(false);
  };
  const remove = () => { onDelete(task.id); onClose(); };

  return (
    <Modal title="Task" onClose={onClose} maxWidth={560}>
      <Field label="Title" value={f.title} onChange={(v) => set("title", v)} placeholder="What needs doing" required />
      <label style={lbl}>Description / brief</label>
      <textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={f.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Everything a teammate needs to pick this up and finish it — links, scope, notes…" />
      <Row>
        <Pick label="Client" value={f.client_id} set={(v) => set("client_id", v)}
          opts={[["", "No client"], ...clients.map((c) => [c.id, c.name])]} />
        <Pick label="Type" value={f.type} set={(v) => set("type", v)} opts={TASK_TYPES.map((t) => [t.key, t.label])} />
      </Row>
      <Row>
        <Pick label="Assignee" value={f.assignee} set={(v) => set("assignee", v)} opts={assigneeOptions(members, f.assignee)} />
        <Pick label="Status" value={f.status} set={(v) => set("status", v)} opts={TASK_STATES.map((s) => [s.key, s.label])} />
      </Row>
      <Field label="Due date" value={f.due} onChange={(v) => set("due", v)} type="date" />
      <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center" }}>
        <button style={{ ...btn(accent, "#fff"), flex: 1, justifyContent: "center", opacity: busy ? 0.7 : 1 }} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button style={{ ...btn("#fff", "#c0392b") }} onClick={remove} title="Delete task"><Trash2 size={15} /> Delete</button>
      </div>
      {task.created_at && <div style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 600, marginTop: 12 }}>Status: {taskStatusLabel(f.status)} · Added {dateLabel(task.created_at)}</div>}
    </Modal>
  );
}

const srOnly = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

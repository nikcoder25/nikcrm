import React, { useState } from "react";
import { Plus, Pencil, Trash2, X, Download } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, SHs, btn, iconBtn, sel, overlay, modal, lbl, input } from "../lib/theme";
import { TASK_TYPES, typeLabel, DELIVERABLE_STATES } from "../lib/constants";
import { isPastDue } from "../lib/format";
import { downloadCsv, deliverablesCsv } from "../lib/csv";
import { Panel, Empty, Field, Pick, Row } from "./ui";

const STATUS_BG = { planned: "#f0ece2", in_progress: tint, delivered: "#d7f5df", blocked: "#f7dede" };
const isOverdue = (d) => isPastDue(d.due_date) && d.status !== "delivered";

/* ---------------- Deliverables ---------------- */
export default function Deliverables({ clients, deliverables, onCreate, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preClient, setPreClient] = useState("");

  const openAdd = (client_id = "") => { setEditing(null); setPreClient(client_id); setShowForm(true); };
  const openEdit = (d) => { setEditing(d); setPreClient(""); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); setPreClient(""); };

  const withDeliverables = clients
    .map((c) => ({ client: c, items: deliverables.filter((d) => d.client_id === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 18 }}>
        <button style={btn("#fff", ink)} disabled={deliverables.length === 0} onClick={() => downloadCsv("deliverables.csv", deliverablesCsv(deliverables, clients))}>
          <Download size={15} /> Export CSV
        </button>
        <button style={btn(accent, "#fff")} disabled={clients.length === 0} onClick={() => openAdd()}>
          <Plus size={16} /> Add deliverable
        </button>
      </div>

      {clients.length === 0 ? (
        <Panel><Empty>Add a client first, then you can track deliverables for them.</Empty></Panel>
      ) : withDeliverables.length === 0 ? (
        <Panel><Empty>No deliverables yet. Tap "Add deliverable" to start tracking what you owe each client.</Empty></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {withDeliverables.map(({ client, items }) => {
            const delivered = items.filter((d) => d.status === "delivered").length;
            return (
              <Panel key={client.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: BD, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: disp, fontSize: 16, flex: 1, minWidth: 0 }}>{client.name}</div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
                    {delivered}/{items.length} delivered
                  </span>
                  <button style={iconBtn} title="Add for this client" onClick={() => openAdd(client.id)}><Plus size={15} /></button>
                </div>
                {items.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderBottom: "2px solid #f0ece2", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: BDt, textTransform: "uppercase", background: tint }}>{typeLabel(d.type)}</span>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{d.title || typeLabel(d.type)}{Number(d.quantity) > 1 ? ` ×${d.quantity}` : ""}</div>
                      {(d.due_date || d.notes) && (
                        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: "#6b6580" }}>
                          {d.due_date && (
                            <span style={{ color: isOverdue(d) ? "#c0392b" : "#6b6580", fontWeight: isOverdue(d) ? 800 : 600 }}>
                              Due {d.due_date}{isOverdue(d) ? " · Overdue" : ""}
                            </span>
                          )}
                          {d.due_date && d.notes ? " · " : ""}{d.notes || ""}
                        </div>
                      )}
                    </div>
                    <select
                      value={d.status || "planned"}
                      onChange={(e) => onUpdate({ ...d, status: e.target.value })}
                      style={{ ...sel, flex: "none", minWidth: 130, fontWeight: 800, background: STATUS_BG[d.status] || "#fff" }}
                    >
                      {DELIVERABLE_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button style={iconBtn} title="Edit" onClick={() => openEdit(d)}><Pencil size={15} /></button>
                    <button style={iconBtn} title="Delete" onClick={() => onDelete(d.id)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </Panel>
            );
          })}
        </div>
      )}

      {showForm && (
        <DeliverableForm
          clients={clients}
          initial={editing}
          preClient={preClient}
          onClose={close}
          onSave={(d) => { (d.id ? onUpdate(d) : onCreate(d)); close(); }}
        />
      )}
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
function DeliverableForm({ clients, initial, preClient, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    client_id: preClient || "", title: "", type: "guest", status: "planned",
    quantity: 1, due_date: "", notes: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.client_id) return;
    onSave({ ...f, quantity: Number(f.quantity) || 1, due_date: f.due_date || null });
  };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>{initial ? "Edit deliverable" : "Add deliverable"}</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <Pick label="Client" value={f.client_id} set={(v) => set("client_id", v)}
          opts={[["", "Select a client…"], ...clients.map((c) => [c.id, c.name])]} />
        <Field label="Title" value={f.title} onChange={(v) => set("title", v)} placeholder="e.g. Guest post on hvacblog.com" />
        <Row>
          <Pick label="Type" value={f.type} set={(v) => set("type", v)} opts={TASK_TYPES.map((t) => [t.key, t.label])} />
          <Pick label="Status" value={f.status} set={(v) => set("status", v)} opts={DELIVERABLE_STATES.map((s) => [s.key, s.label])} />
        </Row>
        <Row>
          <Field label="Quantity" value={f.quantity} onChange={(v) => set("quantity", v)} type="number" placeholder="1" />
          <Field label="Due date" value={f.due_date || ""} onChange={(v) => set("due_date", v)} type="date" />
        </Row>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth noting…" />
        <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>
          {initial ? "Save changes" : "Add deliverable"}
        </button>
      </div>
    </div>
  );
}

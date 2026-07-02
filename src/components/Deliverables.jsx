import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Download, Loader, Search, CalendarPlus } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn, iconBtn, sel, lbl, input } from "../lib/theme";
import { TASK_TYPES, typeLabel, DELIVERABLE_STATES } from "../lib/constants";
import { isPastDue, ym, ymLabel } from "../lib/format";
import { downloadCsv, deliverablesCsv } from "../lib/csv";
import { deliverableMonth } from "../lib/scope";
import { useToast } from "../lib/toast";
import { Panel, Empty, Field, Pick, Row, Modal } from "./ui";

const STATUS_BG = { planned: "#f0ece2", in_progress: tint, delivered: "#d7f5df", blocked: "#f7dede" };
const isOverdue = (d) => isPastDue(d.due_date) && d.status !== "delivered";

/* ---------------- Deliverables ---------------- */
export default function Deliverables({ clients, deliverables, onSave, onStatus, onDelete, onGenerate }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preClient, setPreClient] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [query, setQuery] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");

  const openAdd = (client_id = "") => { setEditing(null); setPreClient(client_id); setShowForm(true); };
  const openEdit = (d) => { setEditing(d); setPreClient(""); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); setPreClient(""); };

  // Top up this month to every active client's retainer scope. onGenerate
  // (wired in Dashboard) returns { created } on success, undefined on failure
  // (the Dashboard error banner reports the failure itself).
  const generate = async () => {
    setGenMsg(""); setGenBusy(true);
    const r = await onGenerate();
    setGenBusy(false);
    if (r) setGenMsg(r.created > 0
      ? `Created ${r.created} deliverable${r.created === 1 ? "" : "s"} from retainer scopes`
      : "Nothing to create — this month already matches every retainer scope");
  };

  const nameOf = (id) => clients.find((c) => c.id === id)?.name || "";
  const q = query.trim().toLowerCase();
  const matches = (d) => !q || `${d.title || ""} ${typeLabel(d.type)} ${nameOf(d.client_id)} ${d.notes || ""}`.toLowerCase().includes(q);

  const withDeliverables = clients
    .filter((c) => !filterClient || c.id === filterClient)
    .map((c) => ({
      client: c,
      items: deliverables
        .filter((d) => d.client_id === c.id && matches(d))
        .sort((a, b) => deliverableMonth(b).localeCompare(deliverableMonth(a))),
    }))
    .filter((g) => g.items.length > 0);

  const addBtn = (
    <button style={btn(accent, "#fff")} disabled={clients.length === 0} onClick={() => openAdd(filterClient)}>
      <Plus size={16} /> Add deliverable
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <label htmlFor="del-search" style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 180 }}>
          <Search size={15} style={{ position: "absolute", left: 11, color: "#6b6580" }} aria-hidden="true" />
          <span style={srOnly}>Search deliverables</span>
          <input id="del-search" style={{ ...sel, flex: 1, paddingLeft: 34 }} placeholder="Search deliverables…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select style={{ ...sel, flex: "none", minWidth: 170 }} value={filterClient} onChange={(e) => setFilterClient(e.target.value)} aria-label="Filter by client">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {genMsg && <span style={{ fontSize: 12, fontWeight: 700, color: "#1f9d57" }}>{genMsg}</span>}
        <button style={btn("#fff", ink)} disabled={genBusy || clients.length === 0} title="Create the missing deliverables for this month from every active client's retainer scope" onClick={generate}>
          <CalendarPlus size={15} /> {genBusy ? "Generating…" : "Generate this month"}
        </button>
        <button style={btn("#fff", ink)} disabled={deliverables.length === 0} onClick={() => downloadCsv("deliverables.csv", deliverablesCsv(deliverables, clients))}>
          <Download size={15} /> Export CSV
        </button>
        {addBtn}
      </div>

      {clients.length === 0 ? (
        <Panel><Empty>Add a client first, then you can track deliverables for them.</Empty></Panel>
      ) : withDeliverables.length === 0 ? (
        <Panel><Empty action={q || filterClient ? null : addBtn}>
          {q || filterClient ? "No deliverables match your search." : "No deliverables yet. Track what you owe each client."}
        </Empty></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {withDeliverables.map(({ client, items }) => {
            const delivered = items.filter((d) => d.status === "delivered").length;
            return (
              <Panel key={client.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: BD, flexWrap: "wrap" }}>
                  <h2 style={{ fontFamily: disp, fontSize: 16, flex: 1, minWidth: 0 }}>{client.name}</h2>
                  <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
                    {delivered}/{items.length} delivered
                  </span>
                  <button style={iconBtn} title="Add for this client" aria-label={`Add deliverable for ${client.name}`} onClick={() => openAdd(client.id)}><Plus size={15} /></button>
                </div>
                {items.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderBottom: "2px solid #f0ece2", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: BDt, textTransform: "uppercase", background: tint }}>{typeLabel(d.type)}</span>
                    {deliverableMonth(d) && <span title="Counts toward this month's scope" style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: BDt, background: "#fff", color: "#6b6580" }}>{ymLabel(deliverableMonth(d))}</span>}
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
                      onChange={(e) => onStatus({ ...d, status: e.target.value })}
                      aria-label={`Status for ${d.title || typeLabel(d.type)}`}
                      style={{ ...sel, flex: "none", minWidth: 130, fontWeight: 800, background: STATUS_BG[d.status] || "#fff" }}
                    >
                      {DELIVERABLE_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button style={iconBtn} title="Edit" aria-label={`Edit ${d.title || typeLabel(d.type)}`} onClick={() => openEdit(d)}><Pencil size={15} /></button>
                    <button style={iconBtn} title="Delete" aria-label={`Delete ${d.title || typeLabel(d.type)}`} onClick={() => onDelete(d.id)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </Panel>
            );
          })}
        </div>
      )}

      {showForm && (
        <DeliverableForm clients={clients} initial={editing} preClient={preClient} onClose={close} onSave={onSave} />
      )}
    </div>
  );
}

const srOnly = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

/* ---------------- Add / edit form ---------------- */
function DeliverableForm({ clients, initial, preClient, onClose, onSave }) {
  const [f, setF] = useState(() => {
    if (initial) return { ...initial, month: initial.month || (initial.due_date ? String(initial.due_date).slice(0, 7) : ym(new Date())) };
    return { client_id: preClient || "", title: "", type: "guest", status: "planned", quantity: 1, due_date: "", notes: "", month: ym(new Date()) };
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const months = useMemo(() => {
    const s = new Set([f.month || ym(new Date())]);
    const now = new Date();
    for (let i = 0; i < 12; i++) s.add(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    return [...s].filter(Boolean).sort().reverse();
  }, [f.month]);

  const submit = async () => {
    if (busy) return;
    const errs = {};
    if (!f.client_id) errs.client_id = "Pick a client.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSave({ ...f, quantity: Number(f.quantity) || 1, due_date: f.due_date || null, month: f.month || ym(new Date()) });
      toast(initial ? "Deliverable updated" : "Deliverable added");
      onClose();
    } catch (e) {
      toast(e?.message || "Could not save deliverable.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit deliverable" : "Add deliverable"} onClose={onClose}>
      <Pick label="Client" value={f.client_id} set={(v) => set("client_id", v)} required error={errors.client_id}
        opts={[["", "Select a client…"], ...clients.map((c) => [c.id, c.name])]} />
      <Field label="Title" value={f.title} onChange={(v) => set("title", v)} placeholder="e.g. Guest post on hvacblog.com" />
      <Row>
        <Pick label="Type" value={f.type} set={(v) => set("type", v)} opts={TASK_TYPES.map((t) => [t.key, t.label])} />
        <Pick label="Status" value={f.status} set={(v) => set("status", v)} opts={DELIVERABLE_STATES.map((s) => [s.key, s.label])} />
      </Row>
      <Row>
        <Field label="Quantity" value={f.quantity} onChange={(v) => set("quantity", v)} type="number" placeholder="1" />
        <Pick label="Month" value={f.month} set={(v) => set("month", v)} opts={months.map((m) => [m, ymLabel(m)])} />
      </Row>
      <Field label="Due date" value={f.due_date || ""} onChange={(v) => set("due_date", v)} type="date" />
      <label style={lbl} htmlFor="del-notes">Notes</label>
      <textarea id="del-notes" style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth noting…" />
      <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center", opacity: busy ? 0.7 : 1 }} onClick={submit} disabled={busy}>
        {busy ? <Loader size={16} className="spin" /> : null}
        {busy ? "Saving…" : initial ? "Save changes" : "Add deliverable"}
      </button>
    </Modal>
  );
}

import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Mail, Loader, UserPlus } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, btn, iconBtn } from "../lib/theme";
import { useToast } from "../lib/toast";
import { Panel, Empty, Field, Modal } from "./ui";

/* ---------------- Team roster ---------------- */
export default function Team({ members = [], clients, tasks, onSave, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const openAdd = (prefillName = "") => { setEditing(prefillName ? { name: prefillName, role: "", email: "" } : null); setShowForm(true); };
  const openEdit = (m) => { setEditing(m); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); };

  // Assignee names that appear on clients/tasks but aren't in the roster yet —
  // surfaced so nothing that was free-typed before gets lost.
  const unregistered = useMemo(() => {
    const roster = new Set(members.map((m) => m.name));
    const found = new Set();
    clients.forEach((c) => c.team_member && !roster.has(c.team_member) && found.add(c.team_member));
    tasks.forEach((t) => t.assignee && !roster.has(t.assignee) && found.add(t.assignee));
    return [...found];
  }, [members, clients, tasks]);

  const del = (m) => { if (window.confirm(`Remove ${m.name} from the roster? Their existing assignments stay as-is.`)) onDelete(m.id); };

  const addBtn = <button style={btn(accent, "#fff")} onClick={() => openAdd()}><Plus size={16} /> Add team member</button>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>{addBtn}</div>

      {members.length === 0 ? (
        <Panel><Empty action={addBtn}>No team members yet. Add people so you can assign them to clients and tasks.</Empty></Panel>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          {members.map((m) => {
            const activeClients = clients.filter((c) => c.team_member === m.name && c.status === "active");
            const open = tasks.filter((t) => t.assignee === m.name && (t.status || "todo") !== "done").length;
            const done = tasks.filter((t) => t.assignee === m.name && t.status === "done").length;
            return (
              <div key={m.id} style={{ background: "#fff", border: BD, borderRadius: 16, padding: 20, boxShadow: SH }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 19, border: BDt, flexShrink: 0 }}>{m.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontFamily: disp, fontSize: 16, lineHeight: 1.1 }}>{m.name}</h2>
                    {m.role && <div style={{ fontSize: 12, color: "#6b6580", fontWeight: 700, marginTop: 2 }}>{m.role}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={iconBtn} title="Edit" aria-label={`Edit ${m.name}`} onClick={() => openEdit(m)}><Pencil size={14} /></button>
                    <button style={iconBtn} title="Remove" aria-label={`Remove ${m.name}`} onClick={() => del(m)}><Trash2 size={14} /></button>
                  </div>
                </div>
                {m.email && (
                  <a href={`mailto:${m.email}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: accent, fontWeight: 700, marginTop: 10, textDecoration: "none" }}>
                    <Mail size={13} /> {m.email}
                  </a>
                )}
                <div style={{ fontSize: 13, color: "#4b4560", display: "flex", flexDirection: "column", gap: 6, fontWeight: 600, marginTop: 12, borderTop: "2px solid #f0ece2", paddingTop: 12 }}>
                  <div><b>{activeClients.length}</b> active client{activeClients.length === 1 ? "" : "s"}</div>
                  <div><b>{open}</b> open task{open === 1 ? "" : "s"} · <b>{done}</b> done</div>
                  {activeClients.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
                      {activeClients.map((c) => (
                        <span key={c.id} style={{ fontSize: 10.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 6, padding: "2px 8px" }}>{c.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unregistered.length > 0 && (
        <Panel>
          <div style={{ padding: "14px 20px", borderBottom: BD, fontFamily: disp, fontSize: 14, textTransform: "uppercase" }}>Unregistered assignees</div>
          <div style={{ padding: "12px 20px", fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>
            These names are assigned to clients or tasks but aren't in the roster yet.
          </div>
          {unregistered.map((name) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderTop: "2px solid #f0ece2" }}>
              <span style={{ flex: 1, fontWeight: 800, fontSize: 13.5 }}>{name}</span>
              <button style={btn("#fff", ink)} onClick={() => openAdd(name)}><UserPlus size={14} /> Add to roster</button>
            </div>
          ))}
        </Panel>
      )}

      {(members.length > 0 && unregistered.length > 0) && <div style={{ height: 18 }} />}

      {showForm && <TeamForm initial={editing && editing.id ? editing : null} prefill={editing && !editing.id ? editing : null} onClose={close} onSave={onSave} />}
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
function TeamForm({ initial, prefill, onClose, onSave }) {
  const [f, setF] = useState(initial || prefill || { name: "", role: "", email: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    if (busy) return;
    const errs = {};
    if (!f.name.trim()) errs.name = "Name is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSave({ ...f, name: f.name.trim() });
      toast(initial ? "Team member updated" : "Team member added");
      onClose();
    } catch (e) {
      toast(e?.message || "Could not save team member.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit team member" : "Add team member"} onClose={onClose}>
      <Field label="Name" value={f.name} onChange={(v) => set("name", v)} placeholder="e.g. Vivek" required error={errors.name} />
      <Field label="Role" value={f.role} onChange={(v) => set("role", v)} placeholder="e.g. Link builder (optional)" />
      <Field label="Email" value={f.email} onChange={(v) => set("email", v)} placeholder="name@example.com (optional)" type="email" />
      <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center", opacity: busy ? 0.7 : 1 }} onClick={submit} disabled={busy}>
        {busy ? <Loader size={16} className="spin" /> : null}
        {busy ? "Saving…" : initial ? "Save changes" : "Add team member"}
      </button>
    </Modal>
  );
}

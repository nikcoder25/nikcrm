import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Loader } from "lucide-react";
import * as api from "../lib/api";
import { ink, accent, tint, disp, BD, BDt, SH, btn, iconBtn, overlay, modal } from "../lib/theme";
import { Panel, Empty, Field, Pick, Row } from "./ui";

/* ---------------- Team ---------------- */
export default function Team({ clients, tasks, isAdmin }) {
  const members = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.team_member && set.add(c.team_member));
    tasks.forEach((t) => t.assignee && set.add(t.assignee));
    return [...set];
  }, [clients, tasks]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {members.length === 0 ? (
        <Panel><Empty>No team members assigned yet. Assign people to clients or tasks.</Empty></Panel>
      ) : (
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
      )}
      {isAdmin && <UserAccounts />}
    </div>
  );
}

/* ---------------- User accounts (admins only) ----------------
   Self-contained: loads and mutates via the api module directly instead of
   going through the Dashboard's global datasets — non-admins never fetch the
   user list at all. */
function UserAccounts() {
  const [users, setUsers] = useState(null); // null = still loading
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const refresh = async () => {
    try {
      const data = await api.userList();
      setUsers(data.users || []);
      setErr("");
    } catch (e) {
      setErr(e.message || "Could not load user accounts.");
      setUsers((u) => u || []);
    }
  };
  useEffect(() => { refresh(); }, []);

  const mutate = async (id, fn) => {
    setBusyId(id); setErr("");
    try { await fn(); await refresh(); }
    catch (e) { setErr(e.message || "Something went wrong."); }
    setBusyId(null);
  };
  const toggleActive = (u) => mutate(u.id, () =>
    api.saveUser({ id: u.id, name: u.name, email: u.email, role: u.role, active: !u.active }));
  const remove = (u) => {
    if (!window.confirm(`Delete the account for ${u.name} (${u.email})? They won't be able to sign in with it anymore. This cannot be undone.`)) return;
    mutate(u.id, () => api.deleteUser(u.id));
  };

  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: BDt, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: disp, fontSize: 16 }}>User accounts</div>
          <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600, marginTop: 2 }}>
            Personal logins (email + password). The shared team password keeps working alongside these.
          </div>
        </div>
        <button style={{ ...btn(accent, "#fff"), padding: "8px 13px", fontSize: 12.5 }} onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add user
        </button>
      </div>
      {err && (
        <div style={{ margin: "14px 20px 0", background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600, color: ink }}>{err}</div>
      )}
      {users === null ? (
        <Empty>Loading user accounts…</Empty>
      ) : users.length === 0 ? (
        <Empty>No personal accounts yet. Add one to let a teammate sign in with their own email and password.</Empty>
      ) : (
        <div>
          {users.map((u, i) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderTop: i === 0 ? "none" : `2px dashed ${ink}22`, opacity: u.active ? 1 : 0.55, flexWrap: "wrap" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: u.active ? accent : "#a39db5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 15, border: BDt, flexShrink: 0 }}>
                {(u.name || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{u.name}</div>
                <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>{u.email}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", padding: "4px 9px", borderRadius: 7, border: BDt, background: u.role === "admin" ? ink : "#fff", color: u.role === "admin" ? "#fff" : ink }}>
                {u.role === "admin" ? "Admin" : "Member"}
              </span>
              <button onClick={() => toggleActive(u)} disabled={busyId === u.id}
                style={{ ...btn(u.active ? "#fff" : accent, u.active ? ink : "#fff"), padding: "6px 11px", fontSize: 12, boxShadow: "none", border: BDt }}>
                {busyId === u.id ? <Loader size={13} className="spin" /> : u.active ? "Deactivate" : "Activate"}
              </button>
              <button title="Delete account" onClick={() => remove(u)} disabled={busyId === u.id} style={iconBtn}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); refresh(); }} />}
    </Panel>
  );
}

function AddUserModal({ onClose, onAdded }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "member" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      await api.saveUser(f);
      onAdded();
    } catch (e) { setErr(e.message || "Could not create the user."); }
    setBusy(false);
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>Add user</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <Field label="Name" value={f.name} onChange={(v) => set("name", v)} placeholder="e.g. Vivek" />
        <Field label="Email" value={f.email} onChange={(v) => set("email", v)} placeholder="vivek@agency.com" type="email" />
        <Row>
          <Field label="Password" value={f.password} onChange={(v) => set("password", v)} placeholder="min 8 characters" type="password" />
          <Pick label="Role" value={f.role} set={(v) => set("role", v)} opts={[["member", "Member"], ["admin", "Admin"]]} />
        </Row>
        {err && <p style={{ color: ink, background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 12, fontWeight: 600 }}>{err}</p>}
        <button disabled={busy} style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>
          {busy ? <Loader size={16} className="spin" /> : "Create account"}
        </button>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { FolderKanban, CheckSquare, Users, Plus, LogOut, DollarSign, ClipboardList, Search, LayoutDashboard } from "lucide-react";
import * as api from "../lib/api";
import { ink, accent, cream, disp, BD, BDt, SHs, tint, btn, globalCss } from "../lib/theme";
import { ym } from "../lib/format";
import { Center } from "./ui";
import Overview from "./Overview";
import Clients from "./Clients";
import Board from "./Board";
import Deliverables from "./Deliverables";
import Keywords from "./Keywords";
import Revenue from "./Revenue";
import Team from "./Team";
import ClientForm from "./ClientForm";
import ClientDetail from "./ClientDetail";

/* ---------------- Dashboard ---------------- */
export default function Dashboard({ session, onSignOut }) {
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [resources, setResources] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [reports, setReports] = useState([]);
  const [revMonth, setRevMonth] = useState(ym(new Date()));
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null); // client whose detail view is open

  const isAdmin = session.role === "admin";
  const detailClient = detailId ? clients.find((c) => c.id === detailId) : null;

  // A 401 means our stored password is no longer valid (e.g. it was rotated).
  // Drop the stale session and bounce to the login screen instead of leaving
  // the user stuck behind a permanent error banner.
  const handleErr = (e, fallback) => {
    if (e?.status === 401) { onSignOut(); return; }
    setError(e?.message || fallback);
  };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const { clients, tasks, payments, resources, deliverables, keywords, client_reports } = await api.load();
      setClients(clients || []);
      setTasks(tasks || []);
      setPayments(payments || []);
      setResources(resources || []);
      setDeliverables(deliverables || []);
      setKeywords(keywords || []);
      setReports(client_reports || []);
    } catch (e) {
      handleErr(e, "Could not reach the database.");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Wrap each mutation so a failure surfaces instead of silently doing nothing.
  const run = async (fn) => {
    try { await fn(); await load(); }
    catch (e) { handleErr(e, "Something went wrong."); }
  };

  const saveClient = (c) => run(async () => {
    await api.saveClient(c.id ? c : { ...c, created_by: session.name });
    setShowForm(false); setEditing(null);
  });
  const delClient = (id) => run(async () => { await api.deleteClient(id); setDetailId(null); });
  const addTask = (t) => run(() => api.addTask(t));
  const moveTask = (id, status) => run(() => api.moveTask(id, status));
  const delTask = (id) => run(() => api.deleteTask(id));
  const setPayment = (client_id, month, patch) => run(() => api.setPayment(client_id, month, patch));
  const createDeliverable = (d) => run(() => api.createDeliverable(d));
  const updateDeliverable = (d) => run(() => api.updateDeliverable(d));
  const delDeliverable = (id) => run(() => api.deleteDeliverable(id));
  const createKeyword = (k) => run(() => api.createKeyword(k));
  const updateKeyword = (k) => run(() => api.updateKeyword(k));
  const delKeyword = (id) => run(() => api.deleteKeyword(id));

  const NAV = [
    { k: "overview", l: "Overview", i: LayoutDashboard },
    { k: "clients", l: "Clients", i: FolderKanban },
    { k: "tasks", l: "Task Board", i: CheckSquare },
    { k: "deliverables", l: "Deliverables", i: ClipboardList },
    { k: "keywords", l: "Keywords", i: Search },
    { k: "revenue", l: "Revenue", i: DollarSign },
    { k: "team", l: "Team", i: Users },
  ];

  return (
    <div className="shell" style={{ display: "flex", minHeight: "100vh", background: cream, color: ink, fontFamily: "'Inter',sans-serif" }}>
      <style>{globalCss}</style>
      <aside className="side" style={{ width: 244, flexShrink: 0, background: "#241146", color: "#f4eeff", padding: "22px 16px", display: "flex", flexDirection: "column", borderRight: BD, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, paddingBottom: 18, borderBottom: "3px dashed rgba(255,255,255,.25)", marginBottom: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: "#fff", color: ink, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 16, border: BD, boxShadow: SHs }}>GA</div>
          <div><div style={{ fontFamily: disp, fontSize: 17, color: "#fff" }}>Growth Atlas</div><div style={{ fontSize: 10.5, color: "#c9bdf0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>SEO Ops</div></div>
        </div>
        <nav className="nav" style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
          {NAV.map((n) => {
            const I = n.i, on = tab === n.k;
            return <button key={n.k} className="ni" onClick={() => setTab(n.k)}
              style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 13px", borderRadius: 11, border: on ? BD : "3px solid transparent", background: on ? "#fff" : "transparent", color: on ? ink : "#c9bdf0", fontWeight: on ? 800 : 700, fontSize: 14.5, cursor: "pointer", textAlign: "left", boxShadow: on ? "4px 4px 0 rgba(0,0,0,.4)" : "none" }}>
              <I size={17} /> <span>{n.l}</span>
            </button>;
          })}
        </nav>
        <div style={{ borderTop: "3px dashed rgba(255,255,255,.25)", paddingTop: 14 }}>
          <div style={{ background: accent, border: BD, borderRadius: 10, padding: "9px 11px", boxShadow: SHs, marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 800 }}>Signed in</div>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 800, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.name}</div>
            <div style={{ fontSize: 11, color: "#e9deff", fontWeight: 700, marginTop: 1 }}>{isAdmin ? "Admin" : "Member"}</div>
          </div>
          <button onClick={onSignOut} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center", padding: "9px", borderRadius: 9, border: BDt, background: "#fff", color: ink, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: BD, flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontFamily: disp, fontSize: 26, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{NAV.find((n) => n.k === tab)?.l}</div>
          {tab === "clients" && <button style={btn(accent, "#fff")} onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> Add client</button>}
        </header>

        <div style={{ padding: 28 }}>
          {error && (
            <div style={{ background: tint, border: BD, borderRadius: 12, padding: "14px 18px", marginBottom: 20, fontWeight: 600, fontSize: 13.5, color: ink }}>
              {error}
              <button onClick={load} style={{ ...btn("#fff", ink), marginLeft: 14, padding: "5px 12px", fontSize: 12 }}>Retry</button>
            </div>
          )}
          {loading ? <Center>Loading your board...</Center> :
            tab === "overview" ? <Overview clients={clients} tasks={tasks} deliverables={deliverables} payments={payments} keywords={keywords} /> :
            tab === "clients" ? <Clients clients={clients} deliverables={deliverables} isAdmin={isAdmin} onOpen={(c) => setDetailId(c.id)} onEdit={(c) => { setEditing(c); setShowForm(true); }} onDelete={delClient} /> :
            tab === "tasks" ? <Board clients={clients} tasks={tasks} onAdd={addTask} onMove={moveTask} onDelete={delTask} /> :
            tab === "deliverables" ? <Deliverables clients={clients} deliverables={deliverables} onCreate={createDeliverable} onUpdate={updateDeliverable} onDelete={delDeliverable} /> :
            tab === "keywords" ? <Keywords clients={clients} keywords={keywords} onCreate={createKeyword} onUpdate={updateKeyword} onDelete={delKeyword} /> :
            tab === "revenue" ? <Revenue clients={clients} payments={payments} month={revMonth} setMonth={setRevMonth} onSet={setPayment} /> :
            <Team clients={clients} tasks={tasks} />}
        </div>
      </main>

      {detailClient && (
        <ClientDetail
          client={detailClient}
          resources={resources.filter((r) => r.client_id === detailClient.id)}
          keywords={keywords.filter((k) => k.client_id === detailClient.id)}
          deliverables={deliverables.filter((d) => d.client_id === detailClient.id)}
          reports={reports.filter((r) => r.client_id === detailClient.id)}
          isAdmin={isAdmin}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setEditing(c); setShowForm(true); }}
          onDeleteClient={delClient}
          onChanged={load}
        />
      )}

      {showForm && <ClientForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={saveClient} />}
    </div>
  );
}

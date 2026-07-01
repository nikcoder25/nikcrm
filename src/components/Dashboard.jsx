import React, { useEffect, useState } from "react";
import { FolderKanban, CheckSquare, Users, Plus, LogOut, DollarSign } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { ink, accent, cream, disp, BD, BDt, SHs, btn, globalCss } from "../lib/theme";
import { ym } from "../lib/format";
import { Center } from "./ui";
import Clients from "./Clients";
import Board from "./Board";
import Revenue from "./Revenue";
import Team from "./Team";
import ClientForm from "./ClientForm";

/* ---------------- Dashboard ---------------- */
export default function Dashboard({ session }) {
  const [profile, setProfile] = useState(null);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [revMonth, setRevMonth] = useState(ym(new Date()));
  const [tab, setTab] = useState("clients");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const isAdmin = profile?.role === "admin";
  const uid = session.user.id;

  const load = async () => {
    setLoading(true);
    const [{ data: prof }, { data: cl }, { data: tk }, { data: py }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("payments").select("*"),
    ]);
    setProfile(prof || { full_name: session.user.email, role: "member" });
    setClients(cl || []);
    setTasks(tk || []);
    setPayments(py || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveClient = async (c) => {
    if (c.id) {
      const { id, ...rest } = c;
      await supabase.from("clients").update(rest).eq("id", id);
    } else {
      await supabase.from("clients").insert({ ...c, created_by: uid });
    }
    setShowForm(false); setEditing(null); load();
  };
  const delClient = async (id) => { await supabase.from("clients").delete().eq("id", id); load(); };
  const addTask = async (t) => { await supabase.from("tasks").insert(t); load(); };
  const moveTask = async (id, status) => { await supabase.from("tasks").update({ status }).eq("id", id); load(); };
  const delTask = async (id) => { await supabase.from("tasks").delete().eq("id", id); load(); };
  const setPayment = async (client_id, month, patch) => {
    const paid_date = patch.status === "paid" ? new Date().toISOString().slice(0, 10) : null;
    await supabase.from("payments").upsert({ client_id, month, ...patch, paid_date }, { onConflict: "client_id,month" });
    load();
  };

  const NAV = [
    { k: "clients", l: "Clients", i: FolderKanban },
    { k: "tasks", l: "Task Board", i: CheckSquare },
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
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 800, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.full_name || session.user.email}</div>
            <div style={{ fontSize: 11, color: "#e9deff", fontWeight: 700, marginTop: 1 }}>{isAdmin ? "Admin" : "Member"}</div>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center", padding: "9px", borderRadius: 9, border: BDt, background: "#fff", color: ink, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
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
          {loading ? <Center>Loading your board...</Center> :
            tab === "clients" ? <Clients clients={clients} isAdmin={isAdmin} onEdit={(c) => { setEditing(c); setShowForm(true); }} onDelete={delClient} /> :
            tab === "tasks" ? <Board clients={clients} tasks={tasks} onAdd={addTask} onMove={moveTask} onDelete={delTask} /> :
            tab === "revenue" ? <Revenue clients={clients} payments={payments} month={revMonth} setMonth={setRevMonth} onSet={setPayment} /> :
            <Team clients={clients} tasks={tasks} />}
        </div>
      </main>

      {showForm && <ClientForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={saveClient} />}
    </div>
  );
}

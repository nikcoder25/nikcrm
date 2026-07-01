import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Plus, Trash2, Pencil, X, LogOut, Loader,
  DollarSign, TrendingUp, Wallet, Check
} from "lucide-react";

/* ---------------- theme (black + violet + cream) ---------------- */
const ink = "#17161c", accent = "#6d28d9", cream = "#f6efe0", tint = "#ece7fb";
const disp = "'Archivo Black','Space Grotesk',sans-serif";
const BD = `3px solid ${ink}`, BDt = `2.5px solid ${ink}`, SH = `5px 5px 0 ${ink}`, SHs = `3px 3px 0 ${ink}`;

const STATUSES = ["lead", "upcoming", "active", "paused", "ended", "loss"];
const STATUS_LABEL = { lead: "Lead", upcoming: "Upcoming", active: "Active", paused: "Paused", ended: "Ended", loss: "SEO Loss" };
const SOURCES = ["Direct", "Fiverr", "Referral", "Other"];
const PACKAGES = ["Basic", "Standard", "Premium", "Custom"];
const TASK_TYPES = [
  { key: "guest", label: "Guest Post" }, { key: "onpage", label: "On-Page SEO" },
  { key: "backlink", label: "Backlink" }, { key: "anchor", label: "Anchor Text" },
  { key: "blog", label: "Blog Post" }, { key: "audit", label: "Technical Audit" },
  { key: "schema", label: "Schema" }, { key: "other", label: "Other" },
];
const typeLabel = (k) => (TASK_TYPES.find((t) => t.key === k) || TASK_TYPES[7]).label;
const TASK_STATES = [{ key: "todo", label: "To Do" }, { key: "doing", label: "In Progress" }, { key: "done", label: "Done" }];
const PAY_STATES = [{ key: "pending", label: "Pending" }, { key: "paid", label: "Paid" }, { key: "overdue", label: "Overdue" }];
const money = (n) => "$" + (Number(n) || 0).toLocaleString();
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const ymLabel = (s) => { if (!s) return ""; const [y, m] = s.split("-"); return new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "numeric" }); };

/* ================================================================ */
export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <Center>Loading...</Center>;
  return session ? <Dashboard session={session} /> : <Login />;
}

/* ---------------- Login / Signup ---------------- */
function Login() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name } } });
        if (error) throw error;
        setMsg("Account created. If email confirmation is on, check your inbox, then log in.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
    } catch (e) { setErr(e.message || "Something went wrong"); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter',sans-serif", color: ink }}>
      <style>{globalCss}</style>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", border: BD, borderRadius: 18, boxShadow: "8px 8px 0 " + ink, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 17, border: BD, boxShadow: SHs }}>GA</div>
          <div>
            <div style={{ fontFamily: disp, fontSize: 20 }}>Growth Atlas</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>SEO Operations</div>
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: "#6b6580", margin: "10px 0 18px", fontWeight: 500 }}>
          {mode === "login" ? "Log in to your team's board." : "Create your account to join the team."}
        </p>
        {mode === "signup" && <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Vivek" />}
        <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
        <Field label="Password" value={pw} onChange={setPw} placeholder="min 6 characters" type="password" />
        {err && <p style={{ color: ink, background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 12, fontWeight: 600 }}>{err}</p>}
        {msg && <p style={{ color: accent, fontSize: 13, marginTop: 12, fontWeight: 700 }}>{msg}</p>}
        <button onClick={submit} disabled={busy} style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 18, justifyContent: "center" }}>
          {busy ? <Loader size={16} className="spin" /> : (mode === "login" ? "Log in" : "Sign up")}
        </button>
        <p style={{ textAlign: "center", fontSize: 13, marginTop: 16, color: "#6b6580", fontWeight: 500 }}>
          {mode === "login" ? "New here? " : "Have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }} style={{ background: "none", border: "none", color: accent, fontWeight: 800, cursor: "pointer" }}>
            {mode === "login" ? "Create account" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ session }) {
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
          <div><div style={{ fontFamily: disp, fontSize: 17, color: "#fff" }}>Growth Atlas</div><div style={{ fontSize: 10.5, color: "#fde047", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#c9bdf0" }}>SEO Ops</div></div>
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

/* ---------------- Clients ---------------- */
function Clients({ clients, isAdmin, onEdit, onDelete }) {
  if (clients.length === 0) return <Panel><Empty>No clients yet. Tap "Add client".</Empty></Panel>;
  return (
    <Panel>
      {clients.map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 20px", borderBottom: "2px solid #f0ece2" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}
              {c.source && <span style={{ fontSize: 10.5, fontWeight: 800, background: tint, color: ink, padding: "2px 9px", borderRadius: 6, marginLeft: 9, border: "2px solid " + ink }}>{c.source}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "#6b6580", marginTop: 3, fontWeight: 600 }}>
              {c.niche}{c.package ? ` · ${c.package}` : ""}{c.team_member ? ` · ${c.team_member}` : ""}{c.start_month ? ` · ${c.start_month}` : ""}
            </div>
          </div>
          <span style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11.5, fontWeight: 800, border: "2px solid " + ink, background: c.status === "active" ? accent : "#fff", color: c.status === "active" ? "#fff" : ink }}>{STATUS_LABEL[c.status] || c.status}</span>
          <button style={iconBtn} onClick={() => onEdit(c)}><Pencil size={15} /></button>
          {isAdmin && <button style={iconBtn} onClick={() => onDelete(c.id)}><Trash2 size={15} /></button>}
        </div>
      ))}
    </Panel>
  );
}

/* ---------------- Task Board ---------------- */
function Board({ clients, tasks, onAdd, onMove, onDelete }) {
  const wp = clients.filter((c) => c.status !== "ended" && c.status !== "loss");
  const [f, setF] = useState({ client_id: "", title: "", type: "guest", assignee: "", due: "" });
  const nameOf = (id) => (clients.find((c) => c.id === id)?.name) || "";
  const add = () => {
    if (!f.client_id || !f.title.trim()) return;
    onAdd({ client_id: f.client_id, title: f.title, type: f.type, assignee: f.assignee, status: "todo", due: f.due || null });
    setF({ ...f, title: "", assignee: "", due: "" });
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", background: "#fff", border: BD, borderRadius: 14, padding: 14, boxShadow: SH, marginBottom: 20 }}>
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
      <div className="board" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {TASK_STATES.map((col) => {
          const items = tasks.filter((t) => (t.status || "todo") === col.key);
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
                    {t.due && <span style={{ fontSize: 11, color: "#6b6580", fontWeight: 700 }}>{t.due}</span>}
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

/* ---------------- Team ---------------- */
function Team({ clients, tasks }) {
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

/* ---------------- Revenue ---------------- */
function Revenue({ clients, payments, month, setMonth, onSet }) {
  const active = clients.filter((c) => c.status === "active");
  const payOf = (cid) => payments.find((p) => p.client_id === cid && p.month === month);
  const mrr = active.reduce((s, c) => s + (Number(c.fee) || 0), 0);

  const monthPays = active.map((c) => {
    const p = payOf(c.id);
    return { client: c, amount: p ? Number(p.amount) : Number(c.fee) || 0, status: p ? p.status : "pending" };
  });
  const collected = monthPays.filter((x) => x.status === "paid").reduce((s, x) => s + x.amount, 0);
  const pending = monthPays.filter((x) => x.status !== "paid").reduce((s, x) => s + x.amount, 0);

  const bySource = {};
  active.forEach((c) => { const s = c.source || "Other"; bySource[s] = (bySource[s] || 0) + (Number(c.fee) || 0); });

  const months = (() => {
    const set = new Set([month]);
    const now = new Date();
    for (let i = 0; i < 6; i++) set.add(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    payments.forEach((p) => set.add(p.month));
    return [...set].sort().reverse();
  })();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <select style={{ ...sel, flex: "none", minWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginBottom: 16 }}>
        <RevCard icon={DollarSign} label="Monthly Recurring" val={money(mrr)} hint={`${active.length} active clients`} />
        <RevCard icon={Check} label={`Collected · ${ymLabel(month)}`} val={money(collected)} hint="marked paid" />
        <RevCard icon={Wallet} label={`Pending · ${ymLabel(month)}`} val={money(pending)} hint="not yet paid" />
      </div>

      <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: disp, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Revenue by source</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
          {Object.keys(bySource).length === 0 ? <span style={{ color: "#6b6580", fontWeight: 600 }}>No active revenue.</span> :
            Object.entries(bySource).map(([s, v]) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: s === "Fiverr" ? accent : ink, border: "2px solid " + ink }} />
                <div><div style={{ fontWeight: 800, fontSize: 14 }}>{s}</div><div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 700 }}>{money(v)}/mo</div></div>
              </div>
            ))}
        </div>
      </div>

      <Panel>
        <div style={{ padding: "16px 20px", fontFamily: disp, fontSize: 15, textTransform: "uppercase", borderBottom: BD }}>Payments · {ymLabel(month)}</div>
        {active.length === 0 ? <Empty>No active clients.</Empty> : monthPays.map(({ client, amount, status }) => (
          <div key={client.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "2px solid #f0ece2" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{client.name}</div>
              <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>{client.source} · {money(client.fee)}/mo</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {PAY_STATES.map((ps) => (
                <button key={ps.key} onClick={() => onSet(client.id, month, { amount: Number(client.fee) || 0, status: ps.key })}
                  style={{ padding: "7px 12px", borderRadius: 8, border: BDt, cursor: "pointer", fontSize: 12, fontWeight: 800,
                    background: status === ps.key ? (ps.key === "paid" ? accent : ink) : "#fff",
                    color: status === ps.key ? "#fff" : ink }}>
                  {ps.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
function RevCard({ icon: I, label, val, hint }) {
  return (
    <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 20, display: "flex", gap: 15, alignItems: "center" }}>
      <div style={{ width: 50, height: 50, borderRadius: 13, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: BDt }}><I size={22} /></div>
      <div>
        <div style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 900, fontFamily: disp, margin: "4px 0 2px" }}>{val}</div>
        <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>{hint}</div>
      </div>
    </div>
  );
}

/* ---------------- Client form ---------------- */
function ClientForm({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    name: "", niche: "", status: "active", source: "Direct", package: "Standard",
    fee: "", team_member: "", start_month: "", renewal_month: "", risk: "low", notes: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => { if (!f.name.trim()) return; onSave({ ...f, fee: Number(f.fee) || 0 }); };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>{initial ? "Edit client" : "Add client"}</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <Field label="Client name" value={f.name} onChange={(v) => set("name", v)} placeholder="e.g. Ridgeline HVAC" />
        <Row>
          <Field label="Niche" value={f.niche} onChange={(v) => set("niche", v)} placeholder="HVAC, Paving..." />
          <Field label="Team member" value={f.team_member} onChange={(v) => set("team_member", v)} placeholder="Assigned to" />
        </Row>
        <Row>
          <Pick label="Status" value={f.status} set={(v) => set("status", v)} opts={STATUSES.map((s) => [s, STATUS_LABEL[s]])} />
          <Pick label="Source" value={f.source} set={(v) => set("source", v)} opts={SOURCES.map((s) => [s, s])} />
        </Row>
        <Row>
          <Pick label="Package" value={f.package} set={(v) => set("package", v)} opts={PACKAGES.map((s) => [s, s])} />
          <Field label="Monthly fee" value={f.fee} onChange={(v) => set("fee", v)} placeholder="0" type="number" />
        </Row>
        <Row>
          <Field label="Start month" value={f.start_month} onChange={(v) => set("start_month", v)} type="month" />
          <Field label="Renewal month" value={f.renewal_month} onChange={(v) => set("renewal_month", v)} type="month" />
        </Row>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes, special requests..." />
        <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>{initial ? "Save changes" : "Add client"}</button>
      </div>
    </div>
  );
}

/* ---------------- little UI helpers ---------------- */
function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (<div style={{ flex: 1 }}><label style={lbl}>{label}</label>
    <input style={input} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>);
}
function Pick({ label, value, set, opts }) {
  return (<div style={{ flex: 1 }}><label style={lbl}>{label}</label>
    <select style={input} value={value} onChange={(e) => set(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>);
}
const Row = ({ children }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
const Panel = ({ children }) => <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, overflow: "hidden" }}>{children}</div>;
const Empty = ({ children }) => <div style={{ padding: "48px 20px", textAlign: "center", color: ink, opacity: 0.5, fontWeight: 700 }}>{children}</div>;
const Center = ({ children }) => <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: ink, opacity: 0.6, fontWeight: 700 }}>{children}</div>;

const btn = (bg, fg) => ({ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 9, border: BD, background: bg, color: fg, fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: SHs });
const moveBtn = (fwd) => ({ flex: 1, padding: "7px 8px", borderRadius: 8, border: BDt, background: fwd ? accent : "#fff", color: fwd ? "#fff" : ink, fontSize: 11.5, fontWeight: 800, cursor: "pointer" });
const iconBtn = { background: "#fff", border: BDt, borderRadius: 8, padding: 7, cursor: "pointer", color: ink, display: "flex" };
const sel = { padding: "10px", borderRadius: 9, border: BDt, background: "#fff", fontSize: 13, color: ink, fontWeight: 600, flex: 1, minWidth: 100 };
const lbl = { display: "block", fontSize: 12.5, fontWeight: 800, color: ink, margin: "13px 0 6px", textTransform: "uppercase", letterSpacing: "0.03em" };
const input = { width: "100%", padding: "11px 12px", borderRadius: 9, border: BDt, fontSize: 14, boxSizing: "border-box", color: ink, fontWeight: 600, fontFamily: "inherit" };
const overlay = { position: "fixed", inset: 0, background: "rgba(23,22,28,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 };
const modal = { background: "#fff", borderRadius: 18, padding: 26, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", border: BD, boxShadow: "8px 8px 0 " + ink };

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&family=Archivo+Black&display=swap');
  * { margin: 0; box-sizing: border-box; }
  ::placeholder { color: #a39db5; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: ${accent}; }
  .spin { animation: rot .8s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg); } }
  @media (max-width: 720px) {
    .shell { flex-direction: column; }
    .side { width: 100% !important; height: auto !important; position: static !important; flex-direction: row !important; align-items: center; overflow-x: auto; border-right: none !important; border-bottom: ${BD} !important; }
    .nav { flex-direction: row !important; }
    .ni span { display: none; }
    .board { grid-template-columns: 1fr !important; }
  }
`;

import React, { useEffect, useState } from "react";
import { FolderKanban, CheckSquare, Users, Plus, LogOut, DollarSign, ClipboardList, Search, LayoutDashboard, History, Link2, Sparkles } from "lucide-react";
import * as api from "../lib/api";
import { ink, accent, cream, disp, BD, BDt, SHs, tint, btn, globalCss } from "../lib/theme";
import { ym } from "../lib/format";
import { useRouter, clientIdFromPath, clientPath } from "../lib/router";
import { Center, Panel, Empty } from "./ui";
import Overview from "./Overview";
import Activity from "./Activity";
import Clients from "./Clients";
import Board from "./Board";
import Deliverables from "./Deliverables";
import Backlinks from "./Backlinks";
import Keywords from "./Keywords";
import AiVisibility from "./AiVisibility";
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
  const [backlinks, setBacklinks] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [keywordHistory, setKeywordHistory] = useState([]);
  const [aiCitations, setAiCitations] = useState([]);
  const [, setAiCitationHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [retainers, setRetainers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [revMonth, setRevMonth] = useState(ym(new Date()));
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  // The open client detail lives in the URL (/clients/:id) so it's linkable and
  // survives a refresh, instead of being a modal driven by local state.
  const { path, navigate } = useRouter();
  const detailId = clientIdFromPath(path);

  const isAdmin = session.role === "admin";
  const detailClient = detailId ? clients.find((c) => String(c.id) === String(detailId)) : null;

  const openClient = (c) => navigate(clientPath(c.id));
  const backToClients = () => { setTab("clients"); navigate("/"); };

  // A 401 means our stored password is no longer valid (e.g. it was rotated).
  // Drop the stale session and bounce to the login screen instead of leaving
  // the user stuck behind a permanent error banner.
  const handleErr = (e, fallback) => {
    if (e?.status === 401) { onSignOut(); return; }
    setError(e?.message || fallback);
  };

  // Dataset name (as the API returns it) → state slice setter. Used by both
  // the full refresh and the per-entity refresh so they can't drift apart.
  const SETTERS = {
    clients: setClients,
    tasks: setTasks,
    payments: setPayments,
    resources: setResources,
    deliverables: setDeliverables,
    backlinks: setBacklinks,
    keywords: setKeywords,
    keyword_history: setKeywordHistory,
    ai_citations: setAiCitations,
    ai_citation_history: setAiCitationHistory,
    client_reports: setReports,
    client_retainers: setRetainers,
    activity: setActivity,
  };

  // Fetch fresh data WITHOUT toggling the loading flag, so refreshes after a
  // mutation don't unmount the whole screen into a "Loading…" flash. The
  // full-screen loader is reserved for the very first load.
  const refresh = async () => {
    try {
      const data = await api.load();
      for (const key of Object.keys(SETTERS)) SETTERS[key](data[key] || []);
    } catch (e) {
      handleErr(e, "Could not reach the database.");
    }
  };

  // Per-entity refresh: after a mutation, re-fetch only the datasets it
  // touched (e.g. ["tasks"]) instead of the whole database. The 60s background
  // sync still does a full refresh, so the other slices never go stale.
  const refreshSome = async (sets) => {
    try {
      const data = await api.loadSome(sets);
      for (const key of sets) SETTERS[key]?.(data[key] || []);
    } catch (e) {
      handleErr(e, "Could not reach the database.");
    }
  };
  const load = async () => { setLoading(true); setError(""); await refresh(); setLoading(false); };
  useEffect(() => { load(); }, []);

  // Background sync so teammates' changes show up without any interaction.
  // Skipped while the tab is hidden to avoid pointless requests.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Wrap each mutation so a failure surfaces instead of silently doing nothing.
  // The follow-up refresh happens in place (no loading flash): pass `sets` with
  // the datasets the mutation touches for a narrow re-fetch, or omit it for a
  // full refresh (client save/delete cascade too widely to enumerate). On
  // failure we always do a FULL refresh, so any optimistic local change rolls
  // back to server truth. Returns the API result (undefined on failure) so
  // callers like the bulk-add modal can report success counts.
  const run = async (fn, sets) => {
    setError("");
    try { const result = await fn(); await (sets ? refreshSome(sets) : refresh()); return result; }
    catch (e) {
      handleErr(e, "Something went wrong.");
      if (e?.status !== 401) await refresh();
      return undefined;
    }
  };

  const saveClient = (c) => run(async () => {
    await api.saveClient(c.id ? c : { ...c, created_by: session.name });
    setShowForm(false); setEditing(null);
  });
  const delClient = (id) => {
    const c = clients.find((x) => String(x.id) === String(id));
    if (!window.confirm(`Delete client "${c?.name || "this client"}"? All their tasks, payments, keywords, deliverables and files go with them. This cannot be undone.`)) return;
    run(async () => { await api.deleteClient(id); backToClients(); });
  };
  const addTask = (t) => run(() => api.addTask(t), ["tasks"]);
  const delTask = (id) => { if (window.confirm("Delete this task?")) run(() => api.deleteTask(id), ["tasks"]); };
  const createDeliverable = (d) => run(() => api.createDeliverable(d), ["deliverables"]);
  const delDeliverable = (id) => { if (window.confirm("Delete this deliverable?")) run(() => api.deleteDeliverable(id), ["deliverables"]); };
  // Top up this month's deliverables to every active client's retainer scope.
  const generateDeliverables = () => run(() => api.generateMonthDeliverables({ all: true, month: ym(new Date()) }), ["deliverables"]);
  const createBacklink = (b) => run(() => api.createBacklink({ ...b, created_by: session.name }), ["backlinks"]);
  const delBacklink = (id) => { if (window.confirm("Delete this backlink?")) run(() => api.deleteBacklink(id), ["backlinks"]); };
  const createAiCitation = (c) => run(() => api.createAiCitation(c), ["ai_citations", "ai_citation_history"]);
  const delAiCitation = (id) => { if (window.confirm("Delete this prompt and its check history?")) run(() => api.deleteAiCitation(id), ["ai_citations", "ai_citation_history"]); };
  const createKeyword = (k) => run(() => api.createKeyword(k), ["keywords", "keyword_history"]);
  const updateKeyword = (k) => run(() => api.updateKeyword(k), ["keywords", "keyword_history"]);
  const delKeyword = (id) => { if (window.confirm("Delete this keyword and its rank history?")) run(() => api.deleteKeyword(id), ["keywords", "keyword_history"]); };
  const bulkAddKeywords = (p) => run(() => api.bulkAddKeywords(p), ["keywords", "keyword_history"]);
  // Bulk delete is confirmed inside Keywords.jsx (it knows the selection count).
  const bulkDeleteKeywords = (ids) => run(() => api.bulkDeleteKeywords(ids), ["keywords", "keyword_history"]);

  // High-frequency status changes are applied to local state IMMEDIATELY
  // (optimistic), then synced to the server; the background refresh restores
  // server truth. On failure, handleErr shows the error and refresh resyncs.
  const moveTask = (id, status) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    run(() => api.moveTask(id, status), ["tasks"]);
  };
  const updateDeliverable = (d) => {
    setDeliverables((ds) => ds.map((x) => (x.id === d.id ? { ...x, ...d } : x)));
    run(() => api.updateDeliverable(d), ["deliverables"]);
  };
  const updateBacklink = (b) => {
    setBacklinks((bs) => bs.map((x) => (x.id === b.id ? { ...x, ...b } : x)));
    run(() => api.updateBacklink(b), ["backlinks"]);
  };
  const updateAiCitation = (c) => {
    setAiCitations((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
    run(() => api.updateAiCitation(c), ["ai_citations", "ai_citation_history"]);
  };
  const starKeyword = (id, starred) => {
    setKeywords((ks) => ks.map((k) => (k.id === id ? { ...k, starred } : k)));
    run(() => api.starKeyword(id, starred), ["keywords", "keyword_history"]);
  };
  const setPayment = (client_id, month, patch) => {
    setPayments((ps) => {
      const i = ps.findIndex((p) => p.client_id === client_id && p.month === month);
      if (i >= 0) { const next = [...ps]; next[i] = { ...next[i], ...patch }; return next; }
      return [...ps, { id: `tmp-${client_id}-${month}`, client_id, month, ...patch }];
    });
    run(() => api.setPayment(client_id, month, patch), ["payments"]);
  };

  const NAV = [
    { k: "overview", l: "Overview", i: LayoutDashboard },
    { k: "clients", l: "Clients", i: FolderKanban },
    { k: "tasks", l: "Task Board", i: CheckSquare },
    { k: "deliverables", l: "Deliverables", i: ClipboardList },
    { k: "backlinks", l: "Backlinks", i: Link2 },
    { k: "keywords", l: "Keywords", i: Search },
    { k: "ai", l: "AI Visibility", i: Sparkles },
    { k: "revenue", l: "Revenue", i: DollarSign },
    { k: "activity", l: "Activity", i: History },
    { k: "team", l: "Team", i: Users },
  ];

  const errorBanner = error && (
    <div style={{ background: tint, border: BD, borderRadius: 12, padding: "14px 18px", margin: "20px 28px 0", fontWeight: 600, fontSize: 13.5, color: ink }}>
      {error}
      <button onClick={load} style={{ ...btn("#fff", ink), marginLeft: 14, padding: "5px 12px", fontSize: 12 }}>Retry</button>
    </div>
  );

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
            return <button key={n.k} className="ni" onClick={() => { setTab(n.k); if (detailId) navigate("/"); }}
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
        {errorBanner}
        {detailId ? (
          <div style={{ padding: 28 }}>
            {loading ? <Center>Loading client…</Center> :
              detailClient ? (
                <ClientDetail
                  client={detailClient}
                  resources={resources.filter((r) => r.client_id === detailClient.id)}
                  keywords={keywords.filter((k) => k.client_id === detailClient.id)}
                  keywordHistory={keywordHistory}
                  deliverables={deliverables.filter((d) => d.client_id === detailClient.id)}
                  backlinks={backlinks.filter((b) => b.client_id === detailClient.id)}
                  aiCitations={aiCitations.filter((c) => c.client_id === detailClient.id)}
                  reports={reports.filter((r) => r.client_id === detailClient.id)}
                  retainers={retainers.filter((r) => r.client_id === detailClient.id)}
                  isAdmin={isAdmin}
                  onBack={backToClients}
                  onEdit={(c) => { setEditing(c); setShowForm(true); }}
                  onDeleteClient={delClient}
                  onChanged={(...sets) => (sets.length ? refreshSome(sets) : refresh())}
                />
              ) : (
                <Panel>
                  <Empty>
                    This client could not be found.
                    <div style={{ marginTop: 16 }}>
                      <button style={{ ...btn(accent, "#fff"), display: "inline-flex" }} onClick={backToClients}>Back to clients</button>
                    </div>
                  </Empty>
                </Panel>
              )}
          </div>
        ) : (
          <>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: BD, flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontFamily: disp, fontSize: 26, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{NAV.find((n) => n.k === tab)?.l}</div>
              {tab === "clients" && <button style={btn(accent, "#fff")} onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> Add client</button>}
            </header>

            <div style={{ padding: 28 }}>
              {loading ? <Center>Loading your board...</Center> :
                tab === "overview" ? <Overview clients={clients} tasks={tasks} deliverables={deliverables} payments={payments} keywords={keywords} retainers={retainers} activity={activity} /> :
                tab === "clients" ? <Clients clients={clients} deliverables={deliverables} isAdmin={isAdmin} onOpen={openClient} onEdit={(c) => { setEditing(c); setShowForm(true); }} onDelete={delClient} /> :
                tab === "tasks" ? <Board clients={clients} tasks={tasks} onAdd={addTask} onMove={moveTask} onDelete={delTask} /> :
                tab === "deliverables" ? <Deliverables clients={clients} deliverables={deliverables} onCreate={createDeliverable} onUpdate={updateDeliverable} onDelete={delDeliverable} onGenerate={generateDeliverables} /> :
                tab === "backlinks" ? <Backlinks clients={clients} backlinks={backlinks} onCreate={createBacklink} onUpdate={updateBacklink} onDelete={delBacklink} /> :
                tab === "keywords" ? <Keywords clients={clients} keywords={keywords} history={keywordHistory} onCreate={createKeyword} onUpdate={updateKeyword} onDelete={delKeyword} onBulkAdd={bulkAddKeywords} onBulkDelete={bulkDeleteKeywords} onStar={starKeyword} /> :
                tab === "ai" ? <AiVisibility clients={clients} citations={aiCitations} onCreate={createAiCitation} onUpdate={updateAiCitation} onDelete={delAiCitation} /> :
                tab === "revenue" ? <Revenue clients={clients} payments={payments} month={revMonth} setMonth={setRevMonth} onSet={setPayment} /> :
                tab === "activity" ? <Activity items={activity} clients={clients} /> :
                <Team clients={clients} tasks={tasks} isAdmin={isAdmin} />}
            </div>
          </>
        )}
      </main>

      {showForm && <ClientForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={saveClient} />}
    </div>
  );
}

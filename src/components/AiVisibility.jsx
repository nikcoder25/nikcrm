import React, { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Download, Search, Sparkles, Check, Bot, Percent } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn, iconBtn, sel, overlay, modal, lbl, input } from "../lib/theme";
import { AI_ENGINES, aiEngineLabel } from "../lib/constants";
import { downloadCsv, aiCitationsCsv } from "../lib/csv";
import { Panel, Empty, Field, Pick, Row, RevCard } from "./ui";

const GREEN = "#1f9d57";
const RED = "#c0392b";
const GRAY = "#6b6580";

// "Jul 2 2:19 AM" — when the citation was last checked.
const fmtChecked = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(",", "");
};

// Summary stats across a set of citations (also used by ClientReport).
export function aiCitationSummary(citations) {
  const checked = citations.filter((c) => c.cited != null);
  const cited = checked.filter((c) => c.cited === true).length;
  const pct = checked.length ? Math.round((cited / checked.length) * 100) : null;
  const byEngine = AI_ENGINES
    .map((e) => {
      const items = citations.filter((c) => (c.engine || "chatgpt") === e.key);
      return { key: e.key, label: e.label, total: items.length, cited: items.filter((c) => c.cited === true).length };
    })
    .filter((e) => e.total > 0);
  return { total: citations.length, checked: checked.length, cited, pct, byEngine };
}

// ✓ green / ✗ red / — unknown; clicking cycles cited yes→no (unknown starts at yes).
function CitedToggle({ citation, onUpdate }) {
  const c = citation.cited;
  const style = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
    borderRadius: 8, border: BDt, cursor: "pointer", fontWeight: 900,
    background: c === true ? "#d7f5df" : c === false ? "#f7dede" : "#fff",
    color: c === true ? GREEN : c === false ? RED : "#a39db5",
  };
  return (
    <button
      style={style}
      title={c === true ? "Cited — click to mark not cited" : c === false ? "Not cited — click to mark cited" : "Not checked yet — click to mark cited"}
      onClick={() => onUpdate({ ...citation, cited: c !== true })}
    >
      {c === true ? <Check size={15} /> : c === false ? <X size={15} /> : "—"}
    </button>
  );
}

/* ---------------- AI Visibility (AEO tracking) ---------------- */
export default function AiVisibility({ clients, citations, onCreate, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preClient, setPreClient] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterEngine, setFilterEngine] = useState("");
  const [search, setSearch] = useState("");

  const openAdd = (client_id = "") => { setEditing(null); setPreClient(client_id); setShowForm(true); };
  const openEdit = (c) => { setEditing(c); setPreClient(""); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); setPreClient(""); };

  const q = search.trim().toLowerCase();
  const matches = (c) =>
    (!filterEngine || (c.engine || "chatgpt") === filterEngine)
    && (!q || [c.prompt, c.url, c.notes].some((v) => String(v || "").toLowerCase().includes(q)));

  const groups = useMemo(() => clients
    .filter((c) => !filterClient || c.id === filterClient)
    .map((c) => ({ client: c, items: citations.filter((x) => x.client_id === c.id).filter(matches) }))
    .filter((g) => g.items.length > 0), [clients, citations, filterClient, filterEngine, q]);

  const s = aiCitationSummary(citations);
  const GRID = "minmax(180px,2.2fr) 130px 40px 56px minmax(110px,1.2fr) 92px 74px";
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };
  const cell = { fontSize: 12.5, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 14 }}>
        <RevCard icon={Sparkles} label="Prompts tracked" val={String(s.total)} hint={`${s.checked} checked`} />
        <RevCard icon={Check} label="Cited" val={String(s.cited)} hint="prompts citing the client" />
        <RevCard icon={Percent} label="Citation rate" val={s.pct == null ? "—" : `${s.pct}%`} hint="of checked prompts" />
      </div>

      {s.byEngine.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {s.byEngine.map((e) => (
            <span key={e.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, background: "#fff", border: BDt, borderRadius: 8, padding: "5px 11px" }}>
              <Bot size={13} style={{ color: accent }} /> {e.label}
              <span style={{ color: e.cited > 0 ? GREEN : GRAY }}>{e.cited}/{e.total} cited</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <select style={{ ...sel, flex: "none", minWidth: 170 }} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 140 }} value={filterEngine} onChange={(e) => setFilterEngine(e.target.value)}>
          <option value="">All engines</option>
          {AI_ENGINES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#a39db5" }} />
          <input style={{ ...input, padding: "9px 12px 9px 32px", fontSize: 12.5 }} placeholder="Search prompts, URLs or notes" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span style={{ flex: 1 }} />
        <button style={btn("#fff", ink)} disabled={citations.length === 0} onClick={() => downloadCsv("ai-visibility.csv", aiCitationsCsv(citations, clients))}>
          <Download size={15} /> Export CSV
        </button>
        <button style={btn(accent, "#fff")} disabled={clients.length === 0} onClick={() => openAdd(filterClient)}>
          <Plus size={16} /> Add prompt
        </button>
      </div>

      {clients.length === 0 ? (
        <Panel><Empty>Add a client first, then you can track whether AI answers cite them.</Empty></Panel>
      ) : citations.length === 0 ? (
        <Panel><Empty>No prompts yet. Tap "Add prompt" to track whether ChatGPT, Perplexity or Google AI cite each client.</Empty></Panel>
      ) : groups.length === 0 ? (
        <Panel><Empty>No prompts match these filters.</Empty></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map(({ client, items }) => {
            const cited = items.filter((c) => c.cited === true).length;
            return (
              <Panel key={client.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: BD, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: disp, fontSize: 16, flex: 1, minWidth: 0 }}>{client.name}</div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
                    {cited}/{items.length} cited
                  </span>
                  <button style={iconBtn} title="Add for this client" onClick={() => openAdd(client.id)}><Plus size={15} /></button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 800 }}>
                    <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "9px 20px", borderBottom: "2px solid #f0ece2" }}>
                      <span style={th}>Prompt</span>
                      <span style={th}>Engine</span>
                      <span style={th}>Cited</span>
                      <span style={{ ...th, textAlign: "right" }}>Pos</span>
                      <span style={th}>Cited URL</span>
                      <span style={th}>Last checked</span>
                      <span />
                    </div>
                    {items.map((c) => (
                      <div key={c.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "11px 20px", borderBottom: "1px solid #f0ece2" }}>
                        <span style={{ ...cell, fontWeight: 800 }} title={c.prompt}>{c.prompt || "(untitled)"}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: BDt, textTransform: "uppercase", background: tint, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                          {aiEngineLabel(c.engine)}
                        </span>
                        <CitedToggle citation={c} onUpdate={onUpdate} />
                        <span style={{ ...cell, fontFamily: disp, fontWeight: 900, textAlign: "right" }}>{c.position == null ? "—" : `#${c.position}`}</span>
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" title={c.url}
                            style={{ ...cell, color: GRAY, textDecoration: "none" }}>
                            {String(c.url).replace(/^https?:\/\//, "")}
                          </a>
                        ) : <span style={{ ...cell, color: "#a39db5" }}>—</span>}
                        <span style={{ ...cell, color: GRAY }}>{fmtChecked(c.checked_at)}</span>
                        <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          <button style={{ ...iconBtn, padding: 5 }} title="Edit" onClick={() => openEdit(c)}><Pencil size={13} /></button>
                          <button style={{ ...iconBtn, padding: 5 }} title="Delete" onClick={() => onDelete(c.id)}><Trash2 size={13} /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {showForm && (
        <AiCitationForm
          clients={clients}
          initial={editing}
          preClient={preClient}
          onClose={close}
          onSave={(c) => { (c.id ? onUpdate(c) : onCreate(c)); close(); }}
        />
      )}
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
const CITED_OPTS = [["", "Not checked yet"], ["yes", "Yes — cited"], ["no", "No — not cited"]];

function AiCitationForm({ clients, initial, preClient, onClose, onSave }) {
  const [f, setF] = useState(initial ? {
    ...initial,
    cited: initial.cited == null ? "" : initial.cited ? "yes" : "no",
  } : {
    client_id: preClient || "", prompt: "", engine: "chatgpt", cited: "",
    position: "", url: "", notes: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.client_id || !String(f.prompt || "").trim()) return;
    onSave({
      ...f,
      cited: f.cited === "" ? null : f.cited === "yes",
      position: f.position === "" ? null : f.position,
    });
  };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>{initial ? "Edit prompt" : "Add prompt"}</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <Pick label="Client" value={f.client_id} set={(v) => set("client_id", v)}
          opts={[["", "Select a client…"], ...clients.map((c) => [c.id, c.name])]} />
        <Field label="Prompt" value={f.prompt} onChange={(v) => set("prompt", v)} placeholder="e.g. best hvac company in austin" />
        <Row>
          <Pick label="Engine" value={f.engine || "chatgpt"} set={(v) => set("engine", v)} opts={AI_ENGINES.map((e) => [e.key, e.label])} />
          <Pick label="Cited?" value={f.cited} set={(v) => set("cited", v)} opts={CITED_OPTS} />
        </Row>
        <Row>
          <Field label="Position" value={f.position ?? ""} onChange={(v) => set("position", v)} type="number" placeholder="e.g. 1 (blank = n/a)" />
          <Field label="Cited URL" value={f.url || ""} onChange={(v) => set("url", v)} placeholder="https://… (optional)" />
        </Row>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...input, minHeight: 56, resize: "vertical" }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth noting…" />
        {initial && <p style={{ fontSize: 11.5, color: GRAY, fontWeight: 600, marginTop: 10 }}>Changing cited or position stamps "last checked" and appends a history point.</p>}
        <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 18, justifyContent: "center" }} onClick={submit}>
          {initial ? "Save changes" : "Add prompt"}
        </button>
      </div>
    </div>
  );
}

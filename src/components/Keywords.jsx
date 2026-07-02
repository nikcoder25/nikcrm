import React, { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, ArrowUp, ArrowDown, Minus, ExternalLink, Search, Target, Download } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn, iconBtn, sel, overlay, modal, lbl, input } from "../lib/theme";
import { downloadCsv, keywordsCsv } from "../lib/csv";
import { Panel, Empty, Field, Row, RevCard } from "./ui";

// Movement vs the previous recorded rank. Lower rank number is better, so a
// smaller current_rank than previous means the keyword improved (moved up).
export function movement(kw) {
  const c = kw.current_rank, p = kw.previous_rank;
  if (c == null) return { dir: "none", label: "Untracked", color: "#6b6580" };
  if (p == null) return { dir: "new", label: "New", color: "#6b6580" };
  if (c < p) return { dir: "up", label: `+${p - c}`, color: "#1f9d57" };   // improved
  if (c > p) return { dir: "down", label: `-${c - p}`, color: "#c0392b" };  // dropped
  return { dir: "same", label: "0", color: "#6b6580" };
}

function MoveChip({ kw }) {
  const m = movement(kw);
  const Icon = m.dir === "up" ? ArrowUp : m.dir === "down" ? ArrowDown : Minus;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800, color: m.color, minWidth: 74 }}>
      {(m.dir === "none" || m.dir === "new") ? null : <Icon size={14} />}
      {m.label}
    </span>
  );
}

const rankLabel = (r) => (r == null ? "—" : `#${r}`);

// SVG line chart of rank over time. Lower rank (better) is drawn higher.
function RankChart({ points, width = 104, height = 28, dots = false }) {
  const pts = points.filter((p) => p.rank != null).map((p) => Number(p.rank));
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), pad = 4;
  const x = (i) => pad + (i / (pts.length - 1)) * (width - 2 * pad);
  const y = (r) => (max === min ? height / 2 : pad + ((r - min) / (max - min)) * (height - 2 * pad));
  const d = pts.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
  const improved = pts[pts.length - 1] <= pts[0]; // rank went down or equal = improved/steady
  const color = improved ? "#1f9d57" : "#c0392b";
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {dots && pts.map((r, i) => <circle key={i} cx={x(i)} cy={y(r)} r="3" fill={color} />)}
      {!dots && <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="2.5" fill={color} />}
    </svg>
  );
}

function KeywordHistoryModal({ keyword, points, onClose }) {
  const pts = points.filter((p) => p.rank != null);
  return (
    <div style={overlay} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div style={{ ...modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 18, marginBottom: 4 }}>
          <span>Rank history</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#4b4560", marginBottom: 14 }}>{keyword.keyword}</div>
        {pts.length < 2 ? (
          <Empty>Not enough history yet — change this keyword's rank a couple of times to build the chart.</Empty>
        ) : (
          <>
            <div style={{ border: BDt, borderRadius: 12, padding: 16, background: "#faf8f2", marginBottom: 14 }}>
              <RankChart points={pts} width={496} height={170} dots />
            </div>
            <div style={{ border: BDt, borderRadius: 10, overflow: "hidden" }}>
              {[...pts].reverse().map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid #f0ece2", fontSize: 13, fontWeight: 700 }}>
                  <span style={{ color: "#6b6580" }}>{String(p.recorded_at).slice(0, 10)}</span>
                  <span>#{p.rank}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Shared per-client keyword table. Used in the Keywords tab and in ClientDetail.
export function KeywordRows({ keywords, history = [], onEdit, onDelete }) {
  const [histKw, setHistKw] = useState(null);
  const byKw = useMemo(() => {
    const m = new Map();
    for (const h of history) { if (!m.has(h.keyword_id)) m.set(h.keyword_id, []); m.get(h.keyword_id).push(h); }
    return m;
  }, [history]);
  if (!keywords.length) return <Empty>No keywords tracked yet.</Empty>;
  return (
    <div>
      {keywords.map((k) => {
        const pts = byKw.get(k.id) || [];
        const hasChart = pts.filter((p) => p.rank != null).length >= 2;
        return (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "2px solid #f0ece2", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{k.keyword || "(untitled)"}</div>
              {k.target_url && (
                <a href={k.target_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#6b6580", fontWeight: 700, marginTop: 2, textDecoration: "none", maxWidth: 260, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  <Target size={12} /> {k.target_url.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, fontFamily: disp, minWidth: 42, textAlign: "right" }}>{rankLabel(k.current_rank)}</span>
            <MoveChip kw={k} />
            {hasChart
              ? <button title="Rank history" onClick={() => setHistKw(k)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", width: 104 }}><RankChart points={pts} /></button>
              : <span style={{ width: 104, fontSize: 11, color: "#a39db5", fontWeight: 700, textAlign: "center" }}>—</span>}
            <button style={iconBtn} title="Edit" onClick={() => onEdit(k)}><Pencil size={15} /></button>
            <button style={iconBtn} title="Delete" onClick={() => onDelete(k.id)}><Trash2 size={15} /></button>
          </div>
        );
      })}
      {histKw && <KeywordHistoryModal keyword={histKw} points={byKw.get(histKw.id) || []} onClose={() => setHistKw(null)} />}
    </div>
  );
}

// Add / edit modal. Reused by the tab and the client detail view.
export function KeywordForm({ clients, initial, preClient, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    client_id: preClient || "", keyword: "", current_rank: "", target_url: "", notes: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.client_id || !f.keyword.trim()) return;
    onSave({ ...f, current_rank: f.current_rank === "" ? null : f.current_rank });
  };
  const lockClient = Boolean(preClient) && !initial;
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>{initial ? "Edit keyword" : "Add keyword"}</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        {!lockClient && (
          <div><label style={lbl}>Client</label>
            <select style={input} value={f.client_id} onChange={(e) => set("client_id", e.target.value)}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <Field label="Keyword" value={f.keyword} onChange={(v) => set("keyword", v)} placeholder="e.g. emergency ac repair austin" />
        <Row>
          <Field label="Current rank" value={f.current_rank ?? ""} onChange={(v) => set("current_rank", v)} type="number" placeholder="e.g. 7 (blank = untracked)" />
          <Field label="Target URL" value={f.target_url} onChange={(v) => set("target_url", v)} placeholder="https://…" />
        </Row>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...input, minHeight: 56, resize: "vertical" }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth noting…" />
        {initial && <p style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 600, marginTop: 10 }}>Changing the rank rolls the old value into “previous” so movement stays accurate.</p>}
        <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 18, justifyContent: "center" }} onClick={submit}>
          {initial ? "Save changes" : "Add keyword"}
        </button>
      </div>
    </div>
  );
}

// Summary stats across a set of keywords.
export function keywordSummary(keywords) {
  const ranked = keywords.filter((k) => k.current_rank != null);
  const avg = ranked.length ? Math.round(ranked.reduce((s, k) => s + Number(k.current_rank), 0) / ranked.length) : null;
  const top10 = ranked.filter((k) => Number(k.current_rank) <= 10).length;
  return { total: keywords.length, ranked: ranked.length, avg, top10 };
}

/* ---------------- Keywords tab ---------------- */
export default function Keywords({ clients, keywords, history = [], onCreate, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preClient, setPreClient] = useState("");
  const [filterClient, setFilterClient] = useState("");

  const openAdd = (client_id = "") => { setEditing(null); setPreClient(client_id); setShowForm(true); };
  const openEdit = (k) => { setEditing(k); setPreClient(""); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); setPreClient(""); };

  const visibleKeywords = filterClient ? keywords.filter((k) => k.client_id === filterClient) : keywords;
  const s = keywordSummary(visibleKeywords);
  const groups = clients
    .filter((c) => !filterClient || c.id === filterClient)
    .map((c) => ({ client: c, items: keywords.filter((k) => k.client_id === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 18 }}>
        <RevCard icon={Search} label="Keywords tracked" val={String(s.total)} hint={`${s.ranked} with a rank`} />
        <RevCard icon={Target} label="Average rank" val={s.avg == null ? "—" : `#${s.avg}`} hint="across ranked keywords" />
        <RevCard icon={ArrowUp} label="In top 10" val={String(s.top10)} hint="rank 1–10" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select style={{ ...sel, flex: "none", minWidth: 170 }} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button style={btn("#fff", ink)} disabled={visibleKeywords.length === 0} onClick={() => downloadCsv("keywords.csv", keywordsCsv(visibleKeywords, clients))}><Download size={15} /> Export CSV</button>
        <button style={btn(accent, "#fff")} disabled={clients.length === 0} onClick={() => openAdd(filterClient)}><Plus size={16} /> Add keyword</button>
      </div>

      {clients.length === 0 ? (
        <Panel><Empty>Add a client first, then you can track their keyword ranks.</Empty></Panel>
      ) : groups.length === 0 ? (
        <Panel><Empty>No keywords yet. Tap "Add keyword" to start tracking ranks.</Empty></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map(({ client, items }) => {
            const gs = keywordSummary(items);
            return (
              <Panel key={client.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: BD, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: disp, fontSize: 16, flex: 1, minWidth: 0 }}>{client.name}</div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
                    avg {gs.avg == null ? "—" : `#${gs.avg}`} · {gs.top10} in top 10
                  </span>
                  <button style={iconBtn} title="Add for this client" onClick={() => openAdd(client.id)}><Plus size={15} /></button>
                </div>
                <KeywordRows keywords={items} history={history} onEdit={openEdit} onDelete={onDelete} />
              </Panel>
            );
          })}
        </div>
      )}

      {showForm && (
        <KeywordForm
          clients={clients}
          initial={editing}
          preClient={preClient}
          onClose={close}
          onSave={(k) => { (k.id ? onUpdate(k) : onCreate(k)); close(); }}
        />
      )}
    </div>
  );
}

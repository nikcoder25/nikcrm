import React, { useState, useMemo, useEffect } from "react";
import {
  Plus, Pencil, Trash2, X, ArrowUp, ArrowDown, Minus, Search, Target, Download,
  Star, ChevronRight, ChevronDown, ZoomIn, ZoomOut,
} from "lucide-react";
import { fetchKeywordHistory, getSession } from "../lib/api";
import { ink, accent, tint, disp, BD, BDt, btn, iconBtn, overlay, modal, lbl, input } from "../lib/theme";
import { downloadCsv, keywordsCsv } from "../lib/csv";
import { Panel, Empty, Field, Row, Pick, RevCard } from "./ui";

const GREEN = "#1f9d57";
const RED = "#c0392b";
const GRAY = "#6b6580";
const STAR_GOLD = "#e8a013";

export const SEARCH_ENGINES = [
  "www.google.com", "google.co.uk", "google.ca", "google.com.au",
  "google.de", "google.in", "www.bing.com",
];
const PLATFORMS = [["desktop", "Desktop"], ["mobile", "Mobile"]];
const platformLabel = (p) => (p === "mobile" ? "Mobile" : "Desktop");

const rankLabel = (r) => (r == null ? "—" : `#${r}`);

// "Jul 2 2:19 AM" — when the rank was last recorded.
const fmtChecked = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(",", "");
};

// Hostname of a target URL without the www. prefix; "" when blank/unparseable.
function domainOf(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try { return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

// Movement vs the previous recorded rank. Lower rank number is better, so a
// smaller current_rank than previous means the keyword improved (moved up).
export function movement(kw) {
  const c = kw.current_rank, p = kw.previous_rank;
  if (c == null) return { dir: "none", label: "Untracked", color: GRAY };
  if (p == null) return { dir: "new", label: "New", color: GRAY };
  if (c < p) return { dir: "up", label: `+${p - c}`, color: GREEN };   // improved
  if (c > p) return { dir: "down", label: `-${c - p}`, color: RED };  // dropped
  return { dir: "same", label: "0", color: GRAY };
}

/* ---------------- period-based movement (Last / Week / Month) ----------------
   "last" compares against previous_rank; "week"/"month" compare against the
   closest history point that is at least 7/30 days old. No old-enough point =
   treated as unchanged. delta > 0 means the keyword improved (rank went down). */
function baselineRank(kw, period, pts) {
  if (period === "last") return kw.previous_rank;
  const days = period === "week" ? 7 : 30;
  const cutoff = Date.now() - days * 86400000;
  let best = null;
  for (const p of pts || []) {
    if (p.rank == null) continue;
    const t = new Date(p.recorded_at).getTime();
    if (t <= cutoff && (!best || t > best.t)) best = { t, rank: Number(p.rank) };
  }
  return best ? best.rank : (kw.current_rank ?? null);
}

function periodMovement(kw, period, pts) {
  const c = kw.current_rank;
  if (c == null) return { dir: "none", label: "—", delta: 0, color: GRAY };
  const base = baselineRank(kw, period, pts);
  if (base == null) return { dir: "new", label: "New", delta: 0, color: GRAY };
  const delta = Number(base) - Number(c);
  if (delta > 0) return { dir: "up", label: String(delta), delta, color: GREEN };
  if (delta < 0) return { dir: "down", label: String(-delta), delta, color: RED };
  return { dir: "same", label: "0", delta: 0, color: GRAY };
}

function ChangeChip({ move, minWidth = 56 }) {
  const Icon = move.dir === "up" ? ArrowUp : move.dir === "down" ? ArrowDown : Minus;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 800, color: move.color, minWidth }}>
      {(move.dir === "none" || move.dir === "new") ? null : <Icon size={13} />}
      {move.label}
    </span>
  );
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

/* ---------------- rank chart ----------------
   SVG line chart of rank over time; lower rank (better) is drawn higher. With
   axes=true it grows a y-axis (rank 1 on top), x-axis date ticks and dots. */
function RankChart({ points, width = 104, height = 28, dots = false, axes = false }) {
  const pts = points
    .filter((p) => p.rank != null)
    .map((p) => ({ rank: Number(p.rank), t: new Date(p.recorded_at).getTime() }));
  if (pts.length < 2) return null;
  const ranks = pts.map((p) => p.rank);
  const min = Math.min(...ranks), max = Math.max(...ranks);
  const padL = axes ? 42 : 4, padR = axes ? 12 : 4, padT = axes ? 10 : 4, padB = axes ? 24 : 4;
  const iw = width - padL - padR, ih = height - padT - padB;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = (p, i) => padL + (axes && t1 > t0 ? (p.t - t0) / (t1 - t0) : i / (pts.length - 1)) * iw;
  // min (best) rank sits at the top — the axis is inverted on purpose.
  const y = (r) => (max === min ? padT + ih / 2 : padT + ((r - min) / (max - min)) * ih);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p, i).toFixed(1)},${y(p.rank).toFixed(1)}`).join(" ");
  const improved = pts[pts.length - 1].rank <= pts[0].rank; // rank went down or equal = improved/steady
  const color = improved ? GREEN : RED;

  let yTicks = [], xTicks = [];
  if (axes) {
    const nY = Math.min(4, max - min + 1);
    yTicks = [...new Set(Array.from({ length: nY }, (_, i) => Math.round(min + (nY === 1 ? 0 : (i / (nY - 1)) * (max - min)))))];
    const nX = Math.max(2, Math.min(5, pts.length)); // 4–6 date labels, fewer with sparse data
    xTicks = Array.from({ length: nX }, (_, i) => t0 + (i / (nX - 1)) * Math.max(1, t1 - t0));
  }
  const fmtTick = (t) => new Date(t).toLocaleDateString("en", { month: "short", day: "numeric" });

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {axes && yTicks.map((r) => (
        <g key={`y${r}`}>
          <line x1={padL} x2={width - padR} y1={y(r)} y2={y(r)} stroke="#e8e4d8" strokeWidth="1" />
          <text x={padL - 7} y={y(r) + 3.5} textAnchor="end" fontSize="10" fontWeight="700" fill={GRAY}>#{r}</text>
        </g>
      ))}
      {axes && xTicks.map((t, i) => {
        const tx = padL + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * iw;
        return <text key={`x${i}`} x={tx} y={height - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill={GRAY}>{fmtTick(t)}</text>;
      })}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {dots && pts.map((p, i) => <circle key={i} cx={x(p, i)} cy={y(p.rank)} r="3" fill={color} />)}
      {!dots && <circle cx={x(pts[pts.length - 1], pts.length - 1)} cy={y(pts[pts.length - 1].rank)} r="2.5" fill={color} />}
    </svg>
  );
}

/* Zoomable history panel: chart + zoom in/out over the visible time window. */
const ZOOM_STEPS = [
  { key: "all", label: "All time", days: null },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "14d", label: "Last 14 days", days: 14 },
];

function RankHistoryPanel({ keyword, points, width = 620, height = 190 }) {
  const [zoom, setZoom] = useState(0);
  const step = ZOOM_STEPS[zoom];
  const cutoff = step.days ? Date.now() - step.days * 86400000 : null;
  const visible = points.filter((p) => p.rank != null && (!cutoff || new Date(p.recorded_at).getTime() >= cutoff));
  const zoomBtn = { ...iconBtn, padding: 5 };
  return (
    <div style={{ border: BDt, borderRadius: 12, background: "#faf8f2", padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, flex: 1, minWidth: 120 }}>{keyword.keyword || "(untitled)"} — rank history</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" }}>{step.label}</span>
        <button style={zoomBtn} title="Zoom out (wider window)" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}><ZoomOut size={14} /></button>
        <button style={zoomBtn} title="Zoom in (narrower window)" disabled={zoom === ZOOM_STEPS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}><ZoomIn size={14} /></button>
      </div>
      {visible.length < 2 ? (
        <div style={{ padding: "26px 10px", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: GRAY }}>
          Not enough rank points in this window — zoom out, or wait for more checks.
        </div>
      ) : (
        <div className="scroll-x"><RankChart points={visible} width={width} height={height} dots axes /></div>
      )}
    </div>
  );
}

/* The initial load only ships each keyword's last 25 rank points; fetch the
   full series lazily when a chart opens, showing the preloaded points until it
   arrives (no flash). The read-only portal has no team session — there the
   preloaded history is already complete, so it skips the fetch. */
function useFullHistory(keyword, preloaded) {
  const [full, setFull] = useState(null);
  useEffect(() => {
    setFull(null);
    if (!keyword?.id || !getSession()) return;
    let live = true;
    fetchKeywordHistory(keyword.id).then((r) => { if (live) setFull(r.points || null); }).catch(() => {});
    return () => { live = false; };
  }, [keyword?.id]);
  return full ?? preloaded;
}

function LazyRankHistory({ keyword, points }) {
  return <RankHistoryPanel keyword={keyword} points={useFullHistory(keyword, points)} />;
}

function KeywordHistoryModal({ keyword, points, onClose }) {
  const pts = useFullHistory(keyword, points).filter((p) => p.rank != null);
  return (
    <div style={overlay} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div style={{ ...modal, maxWidth: "min(620px, calc(100vw - 32px))" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 18, marginBottom: 14 }}>
          <span>Rank history</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        {pts.length < 2 ? (
          <Empty>Not enough history yet — change this keyword's rank a couple of times to build the chart.</Empty>
        ) : (
          <>
            <RankHistoryPanel keyword={keyword} points={pts} width={520} height={190} />
            <div style={{ border: BDt, borderRadius: 10, overflow: "hidden", marginTop: 14 }}>
              {[...pts].reverse().map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid #f0ece2", fontSize: 13, fontWeight: 700 }}>
                  <span style={{ color: GRAY }}>{String(p.recorded_at).slice(0, 10)}</span>
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

// Shared per-client keyword table. Used in ClientDetail (and available to the
// tab). Props contract: keywords, history, onEdit, onDelete — the edit/delete
// buttons are hidden when their handler is missing, so the read-only client
// portal can reuse the exact same rows (and rank-history chart).
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
        const meta = [k.search_engine || "www.google.com", platformLabel(k.platform), k.location, k.volume != null ? `vol ${k.volume}` : ""]
          .filter(Boolean).join(" · ");
        return (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "2px solid #f0ece2", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 800, fontSize: 14 }}>
                {k.starred && <Star size={13} fill={STAR_GOLD} color={STAR_GOLD} />}
                {k.keyword || "(untitled)"}
              </div>
              <div style={{ fontSize: 11, color: GRAY, fontWeight: 700, marginTop: 2 }}>{meta}</div>
              {k.target_url && (
                <a href={k.target_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: GRAY, fontWeight: 700, marginTop: 2, textDecoration: "none", maxWidth: 260, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  <Target size={12} /> {k.target_url.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, fontFamily: disp, minWidth: 42, textAlign: "right" }}>{rankLabel(k.current_rank)}</span>
            <MoveChip kw={k} />
            {hasChart
              ? <button title="Rank history" onClick={() => setHistKw(k)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", width: 104 }}><RankChart points={pts} /></button>
              : <span style={{ width: 104, fontSize: 11, color: "#a39db5", fontWeight: 700, textAlign: "center" }}>—</span>}
            {onEdit && <button style={iconBtn} title="Edit" onClick={() => onEdit(k)}><Pencil size={15} /></button>}
            {onDelete && <button style={iconBtn} title="Delete" onClick={() => onDelete(k.id)}><Trash2 size={15} /></button>}
          </div>
        );
      })}
      {histKw && <KeywordHistoryModal keyword={histKw} points={byKw.get(histKw.id) || []} onClose={() => setHistKw(null)} />}
    </div>
  );
}

// Single-keyword add / edit modal. Reused by the tab (edit) and ClientDetail.
export function KeywordForm({ clients, initial, preClient, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    client_id: preClient || "", keyword: "", current_rank: "", target_url: "", notes: "",
    search_engine: "www.google.com", platform: "desktop", location: "", volume: "", auto_track: false,
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.client_id || !f.keyword.trim()) return;
    onSave({
      ...f,
      current_rank: f.current_rank === "" ? null : f.current_rank,
      volume: f.volume === "" ? null : f.volume,
    });
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
        <Row>
          <Pick label="Search engine" value={f.search_engine || "www.google.com"} set={(v) => set("search_engine", v)} opts={SEARCH_ENGINES.map((s) => [s, s])} />
          <Pick label="Platform" value={f.platform || "desktop"} set={(v) => set("platform", v)} opts={PLATFORMS} />
        </Row>
        <Row>
          <Field label="Location" value={f.location || ""} onChange={(v) => set("location", v)} placeholder="Type location or leave blank for default" />
          <Field label="Volume / mo" value={f.volume ?? ""} onChange={(v) => set("volume", v)} type="number" placeholder="e.g. 1300" />
        </Row>
        <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <input type="checkbox" checked={Boolean(f.auto_track)} onChange={(e) => set("auto_track", e.target.checked)} style={{ width: 16, height: 16, accentColor: accent }} />
          Auto-check rank (needs DataForSEO key)
        </label>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...input, minHeight: 56, resize: "vertical" }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth noting…" />
        {initial && <p style={{ fontSize: 11.5, color: GRAY, fontWeight: 600, marginTop: 10 }}>Changing the rank rolls the old value into “previous” so movement stays accurate.</p>}
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

/* ---------------- Serpfox-style bulk add modal ----------------
   `initial` presets fields (e.g. the URL + client of the group the "Add
   keywords" button was clicked in), so adding to an existing URL is one paste. */
function AddKeywordsModal({ clients, initial, onClose, onBulkAdd }) {
  const [f, setF] = useState({ client_id: "", target_url: "", keywords: "", search_engine: "www.google.com", platform: "desktop", location: "", ...initial });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    const lines = f.keywords.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!f.client_id) { setMsg({ ok: false, text: "Pick a client first." }); return; }
    if (!lines.length) { setMsg({ ok: false, text: "Enter at least one keyword (one per line)." }); return; }
    setBusy(true); setMsg(null);
    const res = await onBulkAdd({
      client_id: f.client_id, target_url: f.target_url, keywords: lines,
      search_engine: f.search_engine, location: f.location, platform: f.platform,
    });
    setBusy(false);
    if (res?.ok) {
      setMsg({ ok: true, text: `Added ${res.added} keyword${res.added === 1 ? "" : "s"}` });
      setTimeout(onClose, 900);
    } else {
      setMsg({ ok: false, text: "Could not add keywords. Check the error banner and try again." });
    }
  };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>Add keywords</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div><label style={lbl}>Client</label>
          <select style={input} value={f.client_id} onChange={(e) => set("client_id", e.target.value)}>
            <option value="">Select a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Field label="Target URL" value={f.target_url} onChange={(v) => set("target_url", v)} placeholder="https://… (optional)" />
        <label style={lbl}>Keywords</label>
        <textarea style={{ ...input, minHeight: 110, resize: "vertical" }} value={f.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="One keyword per line" />
        <Row>
          <Pick label="Search engine" value={f.search_engine} set={(v) => set("search_engine", v)} opts={SEARCH_ENGINES.map((s) => [s, s])} />
          <Pick label="Platform" value={f.platform} set={(v) => set("platform", v)} opts={PLATFORMS} />
        </Row>
        <Field label="Location" value={f.location} onChange={(v) => set("location", v)} placeholder="Type location or leave blank for default" />
        {msg && (
          <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 800, color: msg.ok ? GREEN : RED }}>{msg.text}</div>
        )}
        <button style={{ ...btn(GREEN, "#fff"), width: "100%", marginTop: 16, justifyContent: "center", opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={submit}>
          <Plus size={16} /> {busy ? "Adding…" : "Add keywords"}
        </button>
        <p style={{ fontSize: 11.5, color: GRAY, fontWeight: 600, marginTop: 10 }}>Duplicates and empty lines are dropped automatically. Max 200 keywords per batch.</p>
      </div>
    </div>
  );
}

/* ---------------- level 2: keyword table inside an expanded group ---------------- */
const KW_GRID = "26px 30px minmax(150px,2fr) 56px 70px 60px 118px minmax(90px,1fr) 70px 104px 74px";

function segBtn(on) {
  return { padding: "8px 14px", border: "none", background: on ? accent : "#fff", color: on ? "#fff" : ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer" };
}

function BulkActions({ ids, onStar, onBulkDelete, onDone }) {
  const [open, setOpen] = useState(false);
  const n = ids.length;
  const act = (fn) => { setOpen(false); fn(); onDone(); };
  const item = { display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "#fff", border: "none", borderBottom: "1px solid #f0ece2", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: ink };
  return (
    <div style={{ position: "relative" }}>
      <button style={{ ...btn("#fff", ink), padding: "8px 13px", fontSize: 12.5, opacity: n ? 1 : 0.55 }} disabled={!n} onClick={() => setOpen((o) => !o)}>
        Bulk actions ({n}) <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#fff", border: BDt, borderRadius: 10, boxShadow: "4px 4px 0 rgba(0,0,0,.35)", minWidth: 170, overflow: "hidden" }}>
            <button style={item} onClick={() => act(() => ids.forEach((id) => onStar(id, true)))}>Star selected</button>
            <button style={item} onClick={() => act(() => ids.forEach((id) => onStar(id, false)))}>Unstar selected</button>
            <button style={{ ...item, color: RED, borderBottom: "none" }} onClick={() => {
              if (!window.confirm(`Delete ${n} keyword${n === 1 ? "" : "s"} and their rank history? This cannot be undone.`)) { setOpen(false); return; }
              act(() => onBulkDelete(ids));
            }}>Delete selected</button>
          </div>
        </>
      )}
    </div>
  );
}

function KeywordTable({ items, byKw, period, onEdit, onDelete, onStar, onBulkDelete, onAdd }) {
  const [filter, setFilter] = useState("");
  const [checked, setChecked] = useState(() => new Set());
  const [openKw, setOpenKw] = useState(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? items.filter((k) => (k.keyword || "").toLowerCase().includes(q)) : items;
    return [...list].sort((a, b) => (Boolean(b.starred) - Boolean(a.starred)) || String(a.keyword || "").localeCompare(String(b.keyword || "")));
  }, [items, filter]);

  const visibleIds = visible.map((k) => k.id);
  const checkedVisible = visibleIds.filter((id) => checked.has(id));
  const allChecked = visible.length > 0 && checkedVisible.length === visible.length;
  const toggle = (id) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setChecked(() => (allChecked ? new Set() : new Set(visibleIds)));

  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };
  const cell = { fontSize: 12.5, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  const cbStyle = { width: 15, height: 15, accentColor: accent, cursor: "pointer" };

  return (
    <div style={{ borderTop: "2px solid #f0ece2", background: "#fdfcf8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#a39db5" }} />
          <input style={{ ...input, padding: "9px 12px 9px 32px", fontSize: 12.5 }} placeholder="Type to filter keywords" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <BulkActions ids={checkedVisible} onStar={onStar} onBulkDelete={onBulkDelete} onDone={() => setChecked(new Set())} />
        {onAdd && (
          <button style={{ ...btn(GREEN, "#fff"), padding: "8px 13px", fontSize: 12.5 }} onClick={onAdd}>
            <Plus size={14} /> Add keywords
          </button>
        )}
      </div>
      <div className="scroll-x">
        <div style={{ minWidth: 950 }}>
          <div style={{ display: "grid", gridTemplateColumns: KW_GRID, gap: 8, alignItems: "center", padding: "8px 20px", borderBottom: "2px solid #f0ece2" }}>
            <input type="checkbox" style={cbStyle} checked={allChecked} onChange={toggleAll} title="Select all visible" />
            <span />
            <span style={th}>Keyword</span>
            <span style={{ ...th, textAlign: "right" }}>Rank</span>
            <span style={th}>Change</span>
            <span style={{ ...th, textAlign: "right" }}>Volume</span>
            <span style={th}>Search engine</span>
            <span style={th}>Location</span>
            <span style={th}>Platform</span>
            <span style={th}>Updated</span>
            <span />
          </div>
          {visible.length === 0 ? (
            <div style={{ padding: "22px 20px", fontSize: 12.5, fontWeight: 700, color: GRAY }}>No keywords match this filter.</div>
          ) : visible.map((k) => {
            const pts = byKw.get(k.id) || [];
            const mv = periodMovement(k, period, pts);
            const isOpen = openKw === k.id;
            return (
              <React.Fragment key={k.id}>
                <div
                  style={{ display: "grid", gridTemplateColumns: KW_GRID, gap: 8, alignItems: "center", padding: "10px 20px", borderBottom: "1px solid #f0ece2", cursor: "pointer", background: isOpen ? tint : "transparent" }}
                  onClick={() => setOpenKw(isOpen ? null : k.id)}
                  title="Show rank history"
                >
                  <input type="checkbox" style={cbStyle} checked={checked.has(k.id)} onChange={() => toggle(k.id)} onClick={(e) => e.stopPropagation()} />
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
                    title={k.starred ? "Unstar" : "Star"}
                    onClick={(e) => { e.stopPropagation(); onStar(k.id, !k.starred); }}
                  >
                    <Star size={15} fill={k.starred ? STAR_GOLD : "none"} color={k.starred ? STAR_GOLD : "#a39db5"} />
                  </button>
                  <span style={{ ...cell, fontWeight: 800 }}>{k.keyword || "(untitled)"}</span>
                  <span style={{ ...cell, fontFamily: disp, fontWeight: 900, textAlign: "right" }}>{rankLabel(k.current_rank)}</span>
                  <ChangeChip move={mv} />
                  <span style={{ ...cell, textAlign: "right", color: k.volume == null ? "#a39db5" : ink }}>{k.volume == null ? "—" : Number(k.volume).toLocaleString()}</span>
                  <span style={{ ...cell, color: GRAY }}>{k.search_engine || "www.google.com"}</span>
                  <span style={{ ...cell, color: GRAY }}>{k.location || "—"}</span>
                  <span style={{ ...cell, color: GRAY }}>{platformLabel(k.platform)}</span>
                  <span style={{ ...cell, color: GRAY }}>{fmtChecked(k.checked_at)}</span>
                  <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                    <button style={{ ...iconBtn, padding: 5 }} title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(k); }}><Pencil size={13} /></button>
                    <button style={{ ...iconBtn, padding: 5 }} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(k.id); }}><Trash2 size={13} /></button>
                  </span>
                </div>
                {isOpen && (
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid #f0ece2" }}>
                    <LazyRankHistory keyword={k} points={pts} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- level 1: groups "By URL" ---------------- */
const GROUP_GRID = "minmax(170px,2fr) 90px 60px 60px 84px minmax(110px,1.2fr) 34px";

function MovementBar({ up, same, down }) {
  const total = up + same + down;
  if (!total) return <div style={{ height: 10, borderRadius: 5, background: "#e8e4d8" }} />;
  return (
    <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", border: "1px solid #d8d3c6" }} title={`${up} up · ${same} steady · ${down} down`}>
      {up > 0 && <div style={{ flex: up, background: GREEN }} />}
      {same > 0 && <div style={{ flex: same, background: "#c9c4b8" }} />}
      {down > 0 && <div style={{ flex: down, background: RED }} />}
    </div>
  );
}

function groupStats(items, period, byKw) {
  let change = 0, up = 0, same = 0, down = 0, high = null, low = null;
  for (const k of items) {
    const mv = periodMovement(k, period, byKw.get(k.id) || []);
    change += mv.delta;
    if (mv.dir === "up") up += 1;
    else if (mv.dir === "down") down += 1;
    else same += 1; // unchanged, new and unranked all count as "steady" gray
    if (k.current_rank != null) {
      const r = Number(k.current_rank);
      if (high == null || r < high) high = r;
      if (low == null || r > low) low = r;
    }
  }
  return { change, up, same, down, high, low };
}

/* ---------------- Rank Tracker tab (Serpfox-style) ----------------
   Two views over the same tracked keywords, like Serpfox's By URL / By Group:
   - "By URL": one row per tracked target domain, whoever the client is.
   - "By Client": one row per client (this app's natural "group").
   Both share the period toggle, filter, movement bars and the expandable
   keyword table with bulk actions and inline rank-history charts. */
export default function Keywords({ clients, keywords, history = [], onCreate, onUpdate, onDelete, onBulkAdd, onBulkDelete, onStar }) {
  const [mode, setMode] = useState("url");          // "url" | "client"
  const [period, setPeriod] = useState("last");
  const [urlFilter, setUrlFilter] = useState("");
  const [openGroup, setOpenGroup] = useState(null); // group key — one open at a time
  const [showAdd, setShowAdd] = useState(null);     // null = closed; {} or a preset {client_id, target_url}
  const [editing, setEditing] = useState(null);
  const switchMode = (m) => { setMode(m); setOpenGroup(null); };

  const byKw = useMemo(() => {
    const m = new Map();
    for (const h of history) { if (!m.has(h.keyword_id)) m.set(h.keyword_id, []); m.get(h.keyword_id).push(h); }
    return m;
  }, [history]);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  // One group per tracked target domain; keywords without a target URL pool
  // in a "(no target URL)" bucket at the end.
  const urlGroups = useMemo(() => {
    const m = new Map();
    for (const k of keywords) {
      const d = domainOf(k.target_url) || "(no target URL)";
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(k);
    }
    return [...m.entries()]
      .map(([domain, items]) => ({
        key: `url:${domain}`,
        title: domain,
        hint: [...new Set(items.map((k) => clientName.get(k.client_id)).filter(Boolean))].join(" · "),
        items,
      }))
      .sort((a, b) => (a.title === "(no target URL)") - (b.title === "(no target URL)") || a.title.localeCompare(b.title));
  }, [keywords, clientName]);

  const clientGroups = useMemo(() => clients
    .map((c) => {
      const items = keywords.filter((k) => k.client_id === c.id);
      // The group's "URL" is the most common non-empty target domain.
      const counts = new Map();
      for (const k of items) { const d = domainOf(k.target_url); if (d) counts.set(d, (counts.get(d) || 0) + 1); }
      let domain = "", n = 0;
      for (const [d, cnt] of counts) if (cnt > n) { domain = d; n = cnt; }
      return { key: `client:${c.id}`, title: c.name, hint: domain, items };
    })
    .filter((g) => g.items.length > 0), [clients, keywords]);

  const groups = mode === "url" ? urlGroups : clientGroups;

  // Preset for the per-group "Add keywords" button: the group's dominant
  // client and target URL, so adding to an existing URL is one paste.
  const presetFor = (g) => {
    const cCounts = new Map(), uCounts = new Map();
    for (const k of g.items) {
      cCounts.set(k.client_id, (cCounts.get(k.client_id) || 0) + 1);
      const u = String(k.target_url || "").trim();
      if (u) uCounts.set(u, (uCounts.get(u) || 0) + 1);
    }
    const top = (m) => { let best = "", n = 0; for (const [v, c] of m) if (c > n) { best = v; n = c; } return best; };
    return { client_id: top(cCounts) || "", target_url: top(uCounts) };
  };

  const q = urlFilter.trim().toLowerCase();
  const visibleGroups = q
    ? groups.filter((g) => g.title.toLowerCase().includes(q) || (g.hint || "").toLowerCase().includes(q))
    : groups;

  const s = keywordSummary(keywords);
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 18 }}>
        <RevCard icon={Search} label="Keywords tracked" val={String(s.total)} hint={`${s.ranked} with a rank`} />
        <RevCard icon={Target} label="Average rank" val={s.avg == null ? "—" : `#${s.avg}`} hint="across ranked keywords" />
        <RevCard icon={ArrowUp} label="In top 10" val={String(s.top10)} hint="rank 1–10" />
      </div>

      {/* Serpfox-style view switch */}
      <div style={{ display: "flex", borderBottom: "2px solid #e3ddce", marginBottom: 16 }}>
        {[["url", "By URL"], ["client", "By Client"]].map(([k, l]) => (
          <button key={k} onClick={() => switchMode(k)} aria-current={mode === k ? "page" : undefined}
            style={{ padding: "9px 2px 7px", marginRight: 26, background: "none", border: "none", borderBottom: mode === k ? `3px solid ${accent}` : "3px solid transparent", color: mode === k ? ink : GRAY, fontFamily: disp, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#a39db5" }} />
          <input style={{ ...input, padding: "10px 12px 10px 34px" }} placeholder={mode === "url" ? "Type to filter URLs" : "Type to filter clients"} value={urlFilter} onChange={(e) => setUrlFilter(e.target.value)} />
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", border: BDt, borderRadius: 9, overflow: "hidden" }}>
          {[["last", "Last"], ["week", "Week"], ["month", "Month"]].map(([k, l], i) => (
            <button key={k} onClick={() => setPeriod(k)} style={{ ...segBtn(period === k), borderLeft: i ? BDt : "none" }}>{l}</button>
          ))}
        </div>
        <button style={btn("#fff", ink)} disabled={keywords.length === 0} onClick={() => downloadCsv("keywords.csv", keywordsCsv(keywords, clients))}><Download size={15} /> Export CSV</button>
        <button style={btn(GREEN, "#fff")} disabled={clients.length === 0} onClick={() => setShowAdd({})}><Plus size={16} /> Add keywords</button>
      </div>

      {clients.length === 0 ? (
        <Panel><Empty>Add a client first, then you can track their keyword ranks.</Empty></Panel>
      ) : groups.length === 0 ? (
        <Panel><Empty>No keywords yet. Tap "Add keywords" and paste one keyword per line.</Empty></Panel>
      ) : visibleGroups.length === 0 ? (
        <Panel><Empty>No {mode === "url" ? "URLs" : "clients"} match "{urlFilter}".</Empty></Panel>
      ) : (
        <Panel>
          <div className="scroll-x">
          <div style={{ minWidth: 660 }}>
          <div style={{ display: "grid", gridTemplateColumns: GROUP_GRID, gap: 10, alignItems: "center", padding: "12px 20px", borderBottom: BD }}>
            <span style={th}>{mode === "url" ? "URL" : "Client"}</span>
            <span style={th}>Change</span>
            <span style={{ ...th, textAlign: "right" }}>High</span>
            <span style={{ ...th, textAlign: "right" }}>Low</span>
            <span style={{ ...th, textAlign: "right" }}>Keywords</span>
            <span style={th}>Movement</span>
            <span />
          </div>
          {visibleGroups.map((grp) => {
            const { key, title, hint, items } = grp;
            const g = groupStats(items, period, byKw);
            const isOpen = openGroup === key;
            const changeColor = g.change > 0 ? GREEN : g.change < 0 ? RED : GRAY;
            const changeLabel = g.change > 0 ? `↑${g.change}` : g.change < 0 ? `↓${-g.change}` : "0";
            return (
              <React.Fragment key={key}>
                <div
                  style={{ display: "grid", gridTemplateColumns: GROUP_GRID, gap: 10, alignItems: "center", padding: "13px 20px", borderBottom: "2px solid #f0ece2", cursor: "pointer", background: isOpen ? tint : "transparent" }}
                  onClick={() => setOpenGroup(isOpen ? null : key)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
                    {hint && <div style={{ fontSize: 11.5, color: GRAY, fontWeight: 700, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hint}</div>}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 900, color: changeColor }}>{changeLabel}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, textAlign: "right" }}>{rankLabel(g.high)}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, textAlign: "right", color: GRAY }}>{rankLabel(g.low)}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, textAlign: "right" }}>{items.length}</span>
                  <MovementBar up={g.up} same={g.same} down={g.down} />
                  <ChevronRight size={17} style={{ transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "none", color: GRAY, justifySelf: "end" }} />
                </div>
                {isOpen && (
                  <KeywordTable
                    items={items}
                    byKw={byKw}
                    period={period}
                    onEdit={(k) => setEditing(k)}
                    onDelete={onDelete}
                    onStar={onStar}
                    onBulkDelete={onBulkDelete}
                    onAdd={() => setShowAdd(presetFor(grp))}
                  />
                )}
              </React.Fragment>
            );
          })}
          </div>
          </div>
        </Panel>
      )}

      {showAdd !== null && (
        <AddKeywordsModal clients={clients} initial={showAdd} onClose={() => setShowAdd(null)} onBulkAdd={onBulkAdd} />
      )}

      {editing && (
        <KeywordForm
          clients={clients}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(k) => { (k.id ? onUpdate(k) : onCreate(k)); setEditing(null); }}
        />
      )}
    </div>
  );
}

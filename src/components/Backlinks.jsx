import React, { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Download, Search, ExternalLink } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn, iconBtn, sel, overlay, modal, lbl, input } from "../lib/theme";
import { BACKLINK_STATES } from "../lib/constants";
import { money } from "../lib/format";
import { downloadCsv, backlinksCsv } from "../lib/csv";
import { Panel, Empty, Field, Pick, Row } from "./ui";

const GRAY = "#6b6580";
const STATUS_BG = { prospect: "#f0ece2", outreach: tint, placed: "#fdf3d7", live: "#d7f5df", lost: "#f7dede" };

// Strip the scheme for display so the column stays compact.
const shortUrl = (u) => String(u || "").replace(/^https?:\/\//, "");

/* ---------------- Backlinks ---------------- */
export default function Backlinks({ clients, backlinks, onCreate, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preClient, setPreClient] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");

  const openAdd = (client_id = "") => { setEditing(null); setPreClient(client_id); setShowForm(true); };
  const openEdit = (b) => { setEditing(b); setPreClient(""); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); setPreClient(""); };

  const q = search.trim().toLowerCase();
  const matches = (b) =>
    (!filterStatus || b.status === filterStatus)
    && (!q || [b.url, b.target_url, b.anchor_text, b.notes].some((v) => String(v || "").toLowerCase().includes(q)));

  const groups = useMemo(() => clients
    .filter((c) => !filterClient || c.id === filterClient)
    .map((c) => {
      const all = backlinks.filter((b) => b.client_id === c.id);
      return { client: c, all, items: all.filter(matches) };
    })
    .filter((g) => g.items.length > 0), [clients, backlinks, filterClient, filterStatus, q]);

  const cell = { fontSize: 12.5, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  const GRID = "minmax(160px,2fr) minmax(110px,1.2fr) minmax(110px,1.2fr) 44px 118px 76px 92px 74px";
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <select style={{ ...sel, flex: "none", minWidth: 170 }} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 130 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {BACKLINK_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#a39db5" }} />
          <input style={{ ...input, padding: "9px 12px 9px 32px", fontSize: 12.5 }} placeholder="Search URL, anchor or notes" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span style={{ flex: 1 }} />
        <button style={btn("#fff", ink)} disabled={backlinks.length === 0} onClick={() => downloadCsv("backlinks.csv", backlinksCsv(backlinks, clients))}>
          <Download size={15} /> Export CSV
        </button>
        <button style={btn(accent, "#fff")} disabled={clients.length === 0} onClick={() => openAdd(filterClient)}>
          <Plus size={16} /> Add backlink
        </button>
      </div>

      {clients.length === 0 ? (
        <Panel><Empty>Add a client first, then you can track link building for them.</Empty></Panel>
      ) : backlinks.length === 0 ? (
        <Panel><Empty>No backlinks yet. Tap "Add backlink" to start tracking placements per client.</Empty></Panel>
      ) : groups.length === 0 ? (
        <Panel><Empty>No backlinks match these filters.</Empty></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map(({ client, all, items }) => {
            const live = all.filter((b) => b.status === "live").length;
            return (
              <Panel key={client.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: BD, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: disp, fontSize: 16, flex: 1, minWidth: 0 }}>{client.name}</div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
                    {live} live / {all.length} total
                  </span>
                  <button style={iconBtn} title="Add for this client" onClick={() => openAdd(client.id)}><Plus size={15} /></button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 860 }}>
                    <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "9px 20px", borderBottom: "2px solid #f0ece2" }}>
                      <span style={th}>URL</span>
                      <span style={th}>Anchor</span>
                      <span style={th}>Target</span>
                      <span style={{ ...th, textAlign: "right" }}>DR</span>
                      <span style={th}>Status</span>
                      <span style={{ ...th, textAlign: "right" }}>Cost</span>
                      <span style={th}>Placed</span>
                      <span />
                    </div>
                    {items.map((b) => (
                      <div key={b.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "11px 20px", borderBottom: "1px solid #f0ece2" }}>
                        {b.url ? (
                          <a href={b.url} target="_blank" rel="noopener noreferrer" title={b.url}
                            style={{ ...cell, fontWeight: 800, color: ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <ExternalLink size={13} style={{ flexShrink: 0, color: accent }} /> {shortUrl(b.url)}
                          </a>
                        ) : <span style={{ ...cell, color: "#a39db5" }}>—</span>}
                        <span style={{ ...cell, color: b.anchor_text ? ink : "#a39db5" }} title={b.anchor_text}>{b.anchor_text || "—"}</span>
                        <span style={{ ...cell, color: b.target_url ? GRAY : "#a39db5" }} title={b.target_url}>{b.target_url ? shortUrl(b.target_url) : "—"}</span>
                        <span style={{ ...cell, fontFamily: disp, fontWeight: 900, textAlign: "right" }}>{b.domain_rating == null ? "—" : b.domain_rating}</span>
                        <select
                          value={b.status || "live"}
                          onChange={(e) => onUpdate({ ...b, status: e.target.value })}
                          style={{ ...sel, flex: "none", minWidth: 0, padding: "7px 8px", fontSize: 12, fontWeight: 800, background: STATUS_BG[b.status] || "#fff" }}
                        >
                          {BACKLINK_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <span style={{ ...cell, textAlign: "right", color: Number(b.cost) > 0 ? ink : "#a39db5" }}>{Number(b.cost) > 0 ? money(b.cost) : "—"}</span>
                        <span style={{ ...cell, color: GRAY }}>{b.placed_date ? String(b.placed_date).slice(0, 10) : "—"}</span>
                        <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          <button style={{ ...iconBtn, padding: 5 }} title="Edit" onClick={() => openEdit(b)}><Pencil size={13} /></button>
                          <button style={{ ...iconBtn, padding: 5 }} title="Delete" onClick={() => onDelete(b.id)}><Trash2 size={13} /></button>
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
        <BacklinkForm
          clients={clients}
          initial={editing}
          preClient={preClient}
          onClose={close}
          onSave={(b) => { (b.id ? onUpdate(b) : onCreate(b)); close(); }}
        />
      )}
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
function BacklinkForm({ clients, initial, preClient, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    client_id: preClient || "", url: "", target_url: "", anchor_text: "",
    domain_rating: "", status: "live", cost: "", placed_date: "", notes: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.client_id || !String(f.url || "").trim()) return;
    onSave({
      ...f,
      domain_rating: f.domain_rating === "" ? null : f.domain_rating,
      cost: Number(f.cost) || 0,
      placed_date: f.placed_date || null,
    });
  };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>{initial ? "Edit backlink" : "Add backlink"}</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <Pick label="Client" value={f.client_id} set={(v) => set("client_id", v)}
          opts={[["", "Select a client…"], ...clients.map((c) => [c.id, c.name])]} />
        <Field label="Backlink URL" value={f.url} onChange={(v) => set("url", v)} placeholder="https://blog.example.com/roundup" />
        <Field label="Target URL" value={f.target_url || ""} onChange={(v) => set("target_url", v)} placeholder="https://client.com/page (optional)" />
        <Field label="Anchor text" value={f.anchor_text || ""} onChange={(v) => set("anchor_text", v)} placeholder="e.g. best hvac repair austin" />
        <Row>
          <Field label="Domain rating" value={f.domain_rating ?? ""} onChange={(v) => set("domain_rating", v)} type="number" placeholder="0–100 (blank = unknown)" />
          <Pick label="Status" value={f.status || "live"} set={(v) => set("status", v)} opts={BACKLINK_STATES.map((s) => [s.key, s.label])} />
        </Row>
        <Row>
          <Field label="Cost" value={f.cost ?? ""} onChange={(v) => set("cost", v)} type="number" placeholder="0" />
          <Field label="Placed date" value={f.placed_date ? String(f.placed_date).slice(0, 10) : ""} onChange={(v) => set("placed_date", v)} type="date" />
        </Row>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth noting…" />
        <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>
          {initial ? "Save changes" : "Add backlink"}
        </button>
      </div>
    </div>
  );
}

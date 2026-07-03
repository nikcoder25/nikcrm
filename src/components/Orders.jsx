import React, { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, Download, Search, ExternalLink } from "lucide-react";
import { ink, accent, tint, BDt, btn, iconBtn, sel, lbl, input } from "../lib/theme";
import { ORDER_STATES } from "../lib/constants";
import { dateLabel, money } from "../lib/format";
import { downloadCsv, ordersCsv } from "../lib/csv";
import { Panel, Empty, Field, Pick, Row, Modal } from "./ui";

const GRAY = "#6b6580";
const MUTED = "#a39db5";
const DAY_MS = 86400000;
const STATUS_BG = { not_started: "#f0ece2", in_progress: "#d7f5df", finished: "#dbe7fb", delivered: "#d2ecec" };

// Finished/delivered orders are done — their countdown just reads "Delivered".
const isDone = (o) => o.status === "delivered" || o.status === "finished";

// The delivery deadline as a local-time timestamp: end_date at the delivery
// time when one is set, otherwise end-of-day (so an order due "today" with no
// time isn't flagged overdue until the day is actually over). Parsed by parts
// so it never shifts across timezones. Returns null when there's no end date.
function deadlineOf(o) {
  if (!o.end_date) return null;
  const [y, mo, da] = String(o.end_date).slice(0, 10).split("-").map(Number);
  if (!y || !mo || !da) return null;
  let hh = 23, mm = 59, ss = 59;
  const t = String(o.delivery_time || "").match(/^(\d{1,2}):(\d{2})/);
  if (t) { hh = Number(t[1]); mm = Number(t[2]); ss = 0; }
  return new Date(y, mo - 1, da, hh, mm, ss).getTime();
}

// Reverse-clock text for a signed millisecond gap: days/hours/minutes far out,
// live seconds once inside a day so the last stretch actually ticks down.
function fmtGap(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d >= 1) return `${d}d ${h}h ${m}m`;
  if (h >= 1) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

// Strip the scheme for display so the column stays compact.
const shortUrl = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

// Live reverse countdown to the delivery deadline. `now` ticks once a second in
// the parent, so this re-renders and counts down in real time.
function Countdown({ order, now, style }) {
  if (isDone(order)) return <span style={{ ...style, color: GRAY }}>Delivered</span>;
  const dl = deadlineOf(order);
  if (dl == null) return <span style={{ ...style, color: MUTED }}>—</span>;
  const ms = dl - now;
  const overdue = ms < 0;
  const text = overdue ? `Overdue ${fmtGap(ms)}` : `${fmtGap(ms)} left`;
  // Overdue → red, due within a day → orange, matching the spreadsheet's cues.
  const pill = overdue ? { background: "#f7dede", color: "#c0392b" } : ms < DAY_MS ? { background: "#fbbf4d" } : null;
  return (
    <span title={new Date(dl).toLocaleString()}
      style={{ ...style, ...(pill ? { ...pill, borderRadius: 7, padding: "4px 9px", fontWeight: 800, justifySelf: "start" } : null) }}>
      {text}
    </span>
  );
}

/* ---------------- Orders ---------------- */
export default function Orders({ orders, onCreate, onUpdate, onStatus, onDelete, isAdmin = false }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  // Ticks once a second so every open order's countdown reverse-clocks live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (o) => { setEditing(o); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); };

  const q = search.trim().toLowerCase();
  const items = useMemo(() => orders.filter((o) =>
    (!filterStatus || o.status === filterStatus)
    && (!q || [o.name, o.person, o.website, o.order_data].some((v) => String(v || "").toLowerCase().includes(q)))
  ), [orders, filterStatus, q]);

  const open = orders.filter((o) => !isDone(o)).length;

  const cell = { fontSize: 12.5, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  // Price is an admin-only column, so the grid gains a track only for admins.
  const GRID = `minmax(130px,1.4fr) 126px 88px 88px 62px minmax(104px,1fr) minmax(90px,0.9fr) minmax(140px,1.4fr) minmax(150px,1.5fr)${isAdmin ? " 96px" : ""} 74px`;
  const minWidth = isAdmin ? 1180 : 1080;
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <select style={{ ...sel, flex: "none", minWidth: 140 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {ORDER_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input style={{ ...input, padding: "9px 12px 9px 32px", fontSize: 12.5 }} placeholder="Search name, person, website or order" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
          {open} open / {orders.length} total
        </span>
        <button style={btn("#fff", ink)} disabled={orders.length === 0} onClick={() => downloadCsv("orders.csv", ordersCsv(orders, isAdmin))}>
          <Download size={15} /> Export CSV
        </button>
        <button style={btn(accent, "#fff")} onClick={openAdd}>
          <Plus size={16} /> Add order
        </button>
      </div>

      <Panel>
        {orders.length === 0 ? (
          <Empty>No orders yet. Tap "Add order" to track a delivery with its deadline countdown.</Empty>
        ) : items.length === 0 ? (
          <Empty>No orders match these filters.</Empty>
        ) : (
          <div className="scroll-x">
            <div style={{ minWidth }}>
              <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "12px 20px", borderBottom: "2px solid #f0ece2" }}>
                <span style={th}>Name</span>
                <span style={th}>Status</span>
                <span style={th}>Start</span>
                <span style={th}>End / Delivered</span>
                <span style={th}>Time</span>
                <span style={th}>Count Down</span>
                <span style={th}>Person</span>
                <span style={th}>Website</span>
                <span style={th}>Order Data</span>
                {isAdmin && <span style={{ ...th, textAlign: "right" }}>Price</span>}
                <span />
              </div>
              {items.map((o) => (
                <div key={o.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "11px 20px", borderBottom: "1px solid #f0ece2" }}>
                  <span style={{ ...cell, fontWeight: 800 }} title={o.name}>{o.name}</span>
                  <select
                    value={o.status || "not_started"}
                    onChange={(e) => onStatus({ ...o, status: e.target.value })}
                    style={{ ...sel, flex: "none", minWidth: 0, padding: "7px 8px", fontSize: 12, fontWeight: 800, background: STATUS_BG[o.status] || "#fff" }}
                  >
                    {ORDER_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <span style={{ ...cell, color: o.start_date ? GRAY : MUTED }}>{o.start_date ? dateLabel(o.start_date) : "—"}</span>
                  <span style={{ ...cell, color: o.end_date ? ink : MUTED }}>{o.end_date ? dateLabel(o.end_date) : "—"}</span>
                  <span style={{ ...cell, color: o.delivery_time ? GRAY : MUTED }}>{o.delivery_time || "—"}</span>
                  <Countdown order={o} now={now} style={cell} />
                  <span style={{ ...cell, color: o.person ? ink : MUTED }} title={o.person}>{o.person || "—"}</span>
                  {o.website ? (
                    <a href={o.website} target="_blank" rel="noopener noreferrer" title={o.website}
                      style={{ ...cell, fontWeight: 800, color: ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <ExternalLink size={13} style={{ flexShrink: 0, color: accent }} /> {shortUrl(o.website)}
                    </a>
                  ) : <span style={{ ...cell, color: MUTED }}>—</span>}
                  <span style={{ ...cell, color: o.order_data ? GRAY : MUTED }} title={o.order_data}>{o.order_data || "—"}</span>
                  {isAdmin && <span style={{ ...cell, fontWeight: 900, textAlign: "right", color: Number(o.price) > 0 ? ink : MUTED }}>{Number(o.price) > 0 ? money(o.price) : "—"}</span>}
                  <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                    <button style={{ ...iconBtn, padding: 5 }} title="Edit" onClick={() => openEdit(o)}><Pencil size={13} /></button>
                    <button style={{ ...iconBtn, padding: 5 }} title="Delete" onClick={() => onDelete(o.id)}><Trash2 size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {showForm && (
        <OrderForm
          initial={editing}
          isAdmin={isAdmin}
          onClose={close}
          onSave={(o) => { (o.id ? onUpdate(o) : onCreate(o)); close(); }}
        />
      )}
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
function OrderForm({ initial, isAdmin = false, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    name: "", status: "not_started", start_date: "", end_date: "",
    delivery_time: "", person: "", website: "", order_data: "", price: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!String(f.name || "").trim()) return;
    const out = {
      ...f,
      start_date: f.start_date ? String(f.start_date).slice(0, 10) : null,
      end_date: f.end_date ? String(f.end_date).slice(0, 10) : null,
    };
    // Only admins send a price; the server ignores it from anyone else anyway.
    if (isAdmin) out.price = Number(f.price) || 0;
    return onSave(out);
  };
  return (
    <Modal title={initial ? "Edit order" : "Add order"} onClose={onClose}>
      <Row>
        <Field label="Name" value={f.name} onChange={(v) => set("name", v)} placeholder="e.g. wolfsbanek9" required />
        <Pick label="Status" value={f.status || "not_started"} set={(v) => set("status", v)} opts={ORDER_STATES.map((s) => [s.key, s.label])} />
      </Row>
      <Row>
        <Field label="Start date" value={f.start_date ? String(f.start_date).slice(0, 10) : ""} onChange={(v) => set("start_date", v)} type="date" />
        <Field label="End / delivered" value={f.end_date ? String(f.end_date).slice(0, 10) : ""} onChange={(v) => set("end_date", v)} type="date" />
      </Row>
      <Row>
        <Field label="Time" value={f.delivery_time || ""} onChange={(v) => set("delivery_time", v)} type="time" />
        <Field label="Person" value={f.person || ""} onChange={(v) => set("person", v)} placeholder="Who's on it (optional)" />
      </Row>
      {isAdmin && (
        <Field label="Project price (admin only)" value={f.price ?? ""} onChange={(v) => set("price", v)} type="number" placeholder="0" />
      )}
      <Field label="Website link" value={f.website || ""} onChange={(v) => set("website", v)} placeholder="https://client-site.com (optional)" />
      <label style={lbl}>Order data</label>
      <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.order_data || ""} onChange={(e) => set("order_data", e.target.value)} placeholder="e.g. 37 pages on page seo" />
      <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>
        {initial ? "Save changes" : "Add order"}
      </button>
    </Modal>
  );
}

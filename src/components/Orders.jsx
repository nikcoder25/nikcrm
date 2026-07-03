import React, { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Download, Search, ExternalLink } from "lucide-react";
import { ink, accent, tint, BDt, btn, iconBtn, sel, lbl, input } from "../lib/theme";
import { ORDER_STATES } from "../lib/constants";
import { dateLabel } from "../lib/format";
import { downloadCsv, ordersCsv } from "../lib/csv";
import { Panel, Empty, Field, Pick, Row, Modal } from "./ui";

const GRAY = "#6b6580";
const MUTED = "#a39db5";
const STATUS_BG = { not_started: "#f0ece2", in_progress: "#d7f5df", finished: "#dbe7fb", delivered: "#d2ecec" };

// Finished/delivered orders are done — their countdown just reads "Delivered".
const isDone = (o) => o.status === "delivered" || o.status === "finished";

// Whole days from today (local) until the end date: 0 = due today, negative =
// overdue. Parsed by parts so the date never shifts across timezones.
function daysLeft(end) {
  if (!end) return null;
  const [y, m, d] = String(end).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

// Strip the scheme for display so the column stays compact.
const shortUrl = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

function Countdown({ order, style }) {
  if (isDone(order)) return <span style={{ ...style, color: GRAY }}>Delivered</span>;
  const d = daysLeft(order.end_date);
  if (d == null) return <span style={{ ...style, color: MUTED }}>—</span>;
  const label = d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue`
    : d === 0 ? "Due today"
    : `${d} day${d === 1 ? "" : "s"} left`;
  // Mirror the spreadsheet: due within a day glows orange, overdue goes red.
  const urgent = d < 0 ? { background: "#f7dede", color: "#c0392b" } : d <= 1 ? { background: "#fbbf4d" } : null;
  return (
    <span style={{ ...style, ...(urgent ? { ...urgent, borderRadius: 7, padding: "4px 9px", fontWeight: 800, justifySelf: "start" } : null) }}>
      {label}
    </span>
  );
}

/* ---------------- Orders ---------------- */
export default function Orders({ orders, onCreate, onUpdate, onStatus, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");

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
  const GRID = "minmax(130px,1.4fr) 126px 88px 88px 62px minmax(104px,1fr) minmax(90px,0.9fr) minmax(140px,1.4fr) minmax(150px,1.5fr) 74px";
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
        <button style={btn("#fff", ink)} disabled={orders.length === 0} onClick={() => downloadCsv("orders.csv", ordersCsv(orders))}>
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
            <div style={{ minWidth: 1080 }}>
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
                  <Countdown order={o} style={cell} />
                  <span style={{ ...cell, color: o.person ? ink : MUTED }} title={o.person}>{o.person || "—"}</span>
                  {o.website ? (
                    <a href={o.website} target="_blank" rel="noopener noreferrer" title={o.website}
                      style={{ ...cell, fontWeight: 800, color: ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <ExternalLink size={13} style={{ flexShrink: 0, color: accent }} /> {shortUrl(o.website)}
                    </a>
                  ) : <span style={{ ...cell, color: MUTED }}>—</span>}
                  <span style={{ ...cell, color: o.order_data ? GRAY : MUTED }} title={o.order_data}>{o.order_data || "—"}</span>
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
          onClose={close}
          onSave={(o) => { (o.id ? onUpdate(o) : onCreate(o)); close(); }}
        />
      )}
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
function OrderForm({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    name: "", status: "not_started", start_date: "", end_date: "",
    delivery_time: "", person: "", website: "", order_data: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!String(f.name || "").trim()) return;
    onSave({
      ...f,
      start_date: f.start_date ? String(f.start_date).slice(0, 10) : null,
      end_date: f.end_date ? String(f.end_date).slice(0, 10) : null,
    });
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
      <Field label="Website link" value={f.website || ""} onChange={(v) => set("website", v)} placeholder="https://client-site.com (optional)" />
      <label style={lbl}>Order data</label>
      <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.order_data || ""} onChange={(e) => set("order_data", e.target.value)} placeholder="e.g. 37 pages on page seo" />
      <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>
        {initial ? "Save changes" : "Add order"}
      </button>
    </Modal>
  );
}

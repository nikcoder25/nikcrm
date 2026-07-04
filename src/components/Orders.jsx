import React, { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, Download, Search, ExternalLink, Upload, FileText, Sheet, RotateCcw, Archive } from "lucide-react";
import { ink, accent, tint, BDt, btn, iconBtn, sel, lbl, input } from "../lib/theme";
import { ORDER_STATES, SOURCES, orderStatusLabel } from "../lib/constants";
import { dateLabel, money } from "../lib/format";
import { downloadCsv, ordersCsv } from "../lib/csv";
import { parseImport, rowsToOrders } from "../lib/importParse";
import { splitOrders, RESTORE_STATUS, ARCHIVE_STATUS } from "../lib/orders";
import { useToast } from "../lib/toast";
import { Panel, Empty, Field, Pick, Row, Modal } from "./ui";

const GRAY = "#6b6580";
const MUTED = "#a39db5";
const DAY_MS = 86400000;
const STATUS_BG = { not_started: "#f0ece2", in_progress: "#d7f5df", finished: "#dbe7fb", delivered: "#d2ecec", revision: "#fde6cf", reviewed: "#e7e1f7", archived: "#e6e2da" };
// Per-source tints so the Source dropdown reads like the Status one.
const SOURCE_BG = { Direct: "#e3ecfa", Fiverr: "#d9f2e4", Referral: "#fbe7d2", Other: "#ece7dd" };

// Finished/delivered/reviewed/archived orders are done — their countdown just reads "Delivered".
const isDone = (o) => o.status === "delivered" || o.status === "finished" || o.status === "reviewed" || o.status === "archived";

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

// Base look for an inline-editable cell control (paired with the .cell-edit CSS:
// it reads like plain text until hovered/focused). Borderless so a dense row
// stays calm until you interact with it.
const cellEdit = { font: "inherit", fontSize: 12.5, fontWeight: 700, color: ink, width: "100%", minWidth: 0, padding: "6px 7px", boxSizing: "border-box" };

// Inline text/number editor for a table cell. Commits on blur — Enter blurs,
// Escape reverts — and only when the value actually changed. A `required` field
// (the order name) never commits blank; it snaps back to the original instead.
function EditText({ value, onCommit, placeholder, type = "text", bold, right, required, label }) {
  const orig = value ?? "";
  return (
    <input
      className="cell-edit"
      type={type}
      key={orig}
      defaultValue={orig}
      placeholder={placeholder}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") { e.currentTarget.value = orig; e.currentTarget.blur(); }
      }}
      onBlur={(e) => {
        const v = e.target.value;
        if (required && !v.trim()) { e.target.value = orig; return; }
        if (v !== orig) onCommit(v);
      }}
      style={{ ...cellEdit, ...(bold ? { fontWeight: 800 } : null), ...(right ? { textAlign: "right" } : null) }}
    />
  );
}

/* ---------------- Orders ---------------- */
export default function Orders({ orders, onCreate, onImport, onUpdate, onStatus, onDelete, isAdmin = false }) {
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("active"); // "active" | "archived"
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [search, setSearch] = useState("");
  const [cellActive, setCellActive] = useState(false); // an inline row cell has focus
  const toast = useToast();
  // Ticks once a second so every open order's countdown reverse-clocks live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Pause the per-second re-render while the add/edit modal is open OR while an
    // inline cell is being edited, so neither the form nor an open date picker /
    // in-progress edit is torn through a re-render on every tick. Countdowns
    // behind the overlay aren't visible anyway and resume the instant it closes.
    if (showForm || cellActive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showForm, cellActive]);

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (o) => { setEditing(o); setShowForm(true); };
  const close = () => { setShowForm(false); setEditing(null); };

  // Reaching "Reviewed" archives the order; restoring drops it back to an active
  // stage so it returns to Active and doesn't immediately re-archive.
  const changeStatus = (o) => { onStatus(o); if (o.status === ARCHIVE_STATUS) toast(`Archived "${o.name}"`); };
  const restore = (o) => { onStatus({ ...o, status: RESTORE_STATUS }); toast(`Restored "${o.name}" to Active`); };
  // Inline-edit commit: patch one (or more) fields and persist. onStatus applies
  // the change optimistically and syncs it to the server (rolling back on error).
  const save = (o, patch) => onStatus({ ...o, ...patch });

  // Archiving is derived from status, so the two tabs are just a partition of the
  // same list — every field is preserved on the row.
  const { active: activeOrders, archived: archivedOrders } = useMemo(() => splitOrders(orders), [orders]);
  const tabOrders = tab === "archived" ? archivedOrders : activeOrders;

  const q = search.trim().toLowerCase();
  // Filters, search and the counter all operate within the current tab.
  const items = useMemo(() => tabOrders.filter((o) =>
    (!filterStatus || o.status === filterStatus)
    && (!filterSource || (o.source || "Direct") === filterSource)
    && (!q || [o.name, o.person, o.website, o.order_data, o.source].some((v) => String(v || "").toLowerCase().includes(q)))
  ), [tabOrders, filterStatus, filterSource, q]);

  const open = tabOrders.filter((o) => !isDone(o)).length;
  const archivedView = tab === "archived";

  const cell = { fontSize: 12.5, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  // Source sits after Status; Price is an admin-only track; Files (doc/sheet
  // links) is always shown before the actions column.
  // Columns are wider than the old read-only table so the inline date/time/source
  // editors sit comfortably; the row still scrolls sideways when it doesn't fit.
  const GRID = `minmax(150px,1.4fr) 128px 116px 138px 138px 96px minmax(104px,1fr) minmax(120px,1fr) minmax(160px,1.4fr) minmax(160px,1.5fr)${isAdmin ? " 104px" : ""} minmax(170px,1fr) 82px`;
  const minWidth = isAdmin ? 1880 : 1760;
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };
  const fileLink = { color: ink, display: "inline-flex" };

  return (
    <div>
      {/* Active / Archived tab toggle. Archived holds orders that reached "Reviewed". */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["active", "Active", activeOrders.length], ["archived", "Archived", archivedOrders.length]].map(([key, label, n]) => {
          const on = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)} aria-pressed={on}
              style={{ ...btn(on ? ink : "#fff", on ? "#fff" : ink), padding: "7px 14px", fontSize: 12.5 }}>
              {key === "archived" ? <Archive size={14} /> : null}{label} <span style={{ opacity: 0.65, fontWeight: 700 }}>{n}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <select style={{ ...sel, flex: "none", minWidth: 140 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {ORDER_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 130 }} value={filterSource} onChange={(e) => setFilterSource(e.target.value)} aria-label="Filter by source">
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input style={{ ...input, padding: "9px 12px 9px 32px", fontSize: 12.5 }} placeholder="Search name, person, website or order" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
          {archivedView ? `${tabOrders.length} archived` : `${open} open / ${tabOrders.length} total`}
        </span>
        <button style={btn("#fff", ink)} disabled={orders.length === 0} onClick={() => downloadCsv("orders.csv", ordersCsv(orders, isAdmin))}>
          <Download size={15} /> Export CSV
        </button>
        <button style={btn("#fff", ink)} onClick={() => setShowImport(true)}>
          <Upload size={15} /> Import
        </button>
        <button style={btn(accent, "#fff")} onClick={openAdd}>
          <Plus size={16} /> Add order
        </button>
      </div>

      <Panel>
        {tabOrders.length === 0 ? (
          <Empty>{archivedView
            ? "No archived orders yet. Set an order's status to \"Archive\" to move it here."
            : "No orders yet. Tap \"Add order\" to track a delivery with its deadline countdown."}</Empty>
        ) : items.length === 0 ? (
          <Empty>No orders match these filters.</Empty>
        ) : (
          <div className="scroll-x"
            onFocus={archivedView ? undefined : () => setCellActive(true)}
            onBlur={archivedView ? undefined : () => setCellActive(false)}>
            <div style={{ minWidth }}>
              <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "12px 20px", borderBottom: "2px solid #f0ece2" }}>
                <span style={th}>Name</span>
                <span style={th}>Status</span>
                <span style={th}>Source</span>
                <span style={th}>Start</span>
                <span style={th}>End / Delivered</span>
                <span style={th}>Time</span>
                <span style={th}>Count Down</span>
                <span style={th}>Person</span>
                <span style={th}>Website</span>
                <span style={th}>Order Data</span>
                {isAdmin && <span style={{ ...th, textAlign: "right" }}>Price</span>}
                <span style={th}>Files</span>
                <span />
              </div>
              {items.map((o) => (
                <div key={o.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, alignItems: "center", padding: "11px 20px", borderBottom: "1px solid #f0ece2" }}>
                  {/* Name */}
                  {archivedView
                    ? <span style={{ ...cell, fontWeight: 800 }} title={o.name}>{o.name}</span>
                    : <EditText value={o.name} required bold placeholder="Order name" label={`Name for ${o.name}`} onCommit={(v) => save(o, { name: v })} />}
                  {/* Status */}
                  {archivedView ? (
                    <span title="Archived (Reviewed)"
                      style={{ ...cell, fontWeight: 800, background: STATUS_BG[o.status] || "#fff", border: BDt, borderRadius: 7, padding: "6px 9px", justifySelf: "start" }}>
                      {orderStatusLabel(o.status)}
                    </span>
                  ) : (
                    <select
                      value={o.status || "not_started"}
                      onChange={(e) => changeStatus({ ...o, status: e.target.value })}
                      aria-label={`Status for ${o.name}`}
                      style={{ ...sel, flex: "none", minWidth: 0, padding: "7px 8px", fontSize: 12, fontWeight: 800, background: STATUS_BG[o.status] || "#fff" }}
                    >
                      {ORDER_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  )}
                  {/* Source — same dropdown style as Status */}
                  {archivedView
                    ? <span style={{ ...cell, color: o.source ? ink : MUTED }}>{o.source || "Direct"}</span>
                    : (
                      <select value={o.source || "Direct"} onChange={(e) => save(o, { source: e.target.value })}
                        aria-label={`Source for ${o.name}`}
                        style={{ ...sel, flex: "none", minWidth: 0, padding: "7px 8px", fontSize: 12, fontWeight: 800, background: SOURCE_BG[o.source || "Direct"] || "#fff" }}>
                        {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  {/* Start date */}
                  {archivedView
                    ? <span style={{ ...cell, color: o.start_date ? GRAY : MUTED }}>{o.start_date ? dateLabel(o.start_date) : "—"}</span>
                    : <input className="cell-edit" type="date" value={o.start_date ? String(o.start_date).slice(0, 10) : ""}
                        onChange={(e) => save(o, { start_date: e.target.value })} aria-label={`Start date for ${o.name}`} style={cellEdit} />}
                  {/* End / delivered date */}
                  {archivedView
                    ? <span style={{ ...cell, color: o.end_date ? ink : MUTED }}>{o.end_date ? dateLabel(o.end_date) : "—"}</span>
                    : <input className="cell-edit" type="date" value={o.end_date ? String(o.end_date).slice(0, 10) : ""}
                        onChange={(e) => save(o, { end_date: e.target.value })} aria-label={`End date for ${o.name}`} style={cellEdit} />}
                  {/* Delivery time */}
                  {archivedView
                    ? <span style={{ ...cell, color: o.delivery_time ? GRAY : MUTED }}>{o.delivery_time || "—"}</span>
                    : <input className="cell-edit" type="time" value={o.delivery_time || ""}
                        onChange={(e) => save(o, { delivery_time: e.target.value })} aria-label={`Time for ${o.name}`} style={cellEdit} />}
                  {/* Countdown (computed, not editable) */}
                  <Countdown order={o} now={now} style={cell} />
                  {/* Person */}
                  {archivedView
                    ? <span style={{ ...cell, color: o.person ? ink : MUTED }} title={o.person}>{o.person || "—"}</span>
                    : <EditText value={o.person} placeholder="—" label={`Person for ${o.name}`} onCommit={(v) => save(o, { person: v })} />}
                  {/* Website */}
                  {archivedView ? (
                    o.website
                      ? <a href={o.website} target="_blank" rel="noopener noreferrer" title={o.website}
                          style={{ ...cell, fontWeight: 800, color: ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <ExternalLink size={13} style={{ flexShrink: 0, color: accent }} /> {shortUrl(o.website)}
                        </a>
                      : <span style={{ ...cell, color: MUTED }}>—</span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      <EditText value={o.website} placeholder="https://…" label={`Website for ${o.name}`} onCommit={(v) => save(o, { website: v })} />
                      {o.website ? <a href={o.website} target="_blank" rel="noopener noreferrer" title="Open link" style={{ color: accent, display: "inline-flex", flexShrink: 0 }}><ExternalLink size={13} /></a> : null}
                    </span>
                  )}
                  {/* Order data */}
                  {archivedView
                    ? <span style={{ ...cell, color: o.order_data ? GRAY : MUTED }} title={o.order_data}>{o.order_data || "—"}</span>
                    : <EditText value={o.order_data} placeholder="—" label={`Order data for ${o.name}`} onCommit={(v) => save(o, { order_data: v })} />}
                  {/* Price (admin only) */}
                  {isAdmin && (archivedView
                    ? <span style={{ ...cell, fontWeight: 900, textAlign: "right", color: Number(o.price) > 0 ? ink : MUTED }}>{Number(o.price) > 0 ? money(o.price) : "—"}</span>
                    : <EditText value={o.price == null ? "" : String(o.price)} type="number" right placeholder="0" label={`Price for ${o.name}`} onCommit={(v) => save(o, { price: v })} />)}
                  {/* Files — doc + sheet links, editable inline (icon opens the link) */}
                  {archivedView ? (
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {o.doc_file ? <a href={o.doc_file} target="_blank" rel="noopener noreferrer" title="Doc file" style={fileLink}><FileText size={15} /></a> : null}
                      {o.google_sheet ? <a href={o.google_sheet} target="_blank" rel="noopener noreferrer" title="Google sheet" style={fileLink}><Sheet size={15} /></a> : null}
                      {!o.doc_file && !o.google_sheet ? <span style={{ color: MUTED }}>—</span> : null}
                    </span>
                  ) : (
                    <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        {o.doc_file
                          ? <a href={o.doc_file} target="_blank" rel="noopener noreferrer" title="Open doc file" style={{ ...fileLink, flexShrink: 0, color: accent }}><FileText size={14} /></a>
                          : <FileText size={14} style={{ flexShrink: 0, color: MUTED }} />}
                        <EditText value={o.doc_file} placeholder="Doc link" label={`Doc file for ${o.name}`} onCommit={(v) => save(o, { doc_file: v })} />
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        {o.google_sheet
                          ? <a href={o.google_sheet} target="_blank" rel="noopener noreferrer" title="Open google sheet" style={{ ...fileLink, flexShrink: 0, color: accent }}><Sheet size={14} /></a>
                          : <Sheet size={14} style={{ flexShrink: 0, color: MUTED }} />}
                        <EditText value={o.google_sheet} placeholder="Sheet link" label={`Google sheet for ${o.name}`} onCommit={(v) => save(o, { google_sheet: v })} />
                      </span>
                    </span>
                  )}
                  {/* Actions */}
                  <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                    {archivedView ? (
                      <button style={{ ...iconBtn, padding: 5 }} title="Restore to Active" aria-label={`Restore ${o.name}`} onClick={() => restore(o)}><RotateCcw size={13} /></button>
                    ) : (
                      <button style={{ ...iconBtn, padding: 5 }} title="Edit (full form)" aria-label={`Edit ${o.name}`} onClick={() => openEdit(o)}><Pencil size={13} /></button>
                    )}
                    <button style={{ ...iconBtn, padding: 5 }} title="Delete" aria-label={`Delete ${o.name}`} onClick={() => onDelete(o.id)}><Trash2 size={13} /></button>
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
          onSave={(o) => { (o.id ? onUpdate(o) : onCreate(o)); if (o.status === ARCHIVE_STATUS) toast(`Archived "${o.name}"`); close(); }}
        />
      )}

      {showImport && <ImportOrders onClose={() => setShowImport(false)} onImport={onImport} />}
    </div>
  );
}

/* ---------------- Add / edit form ---------------- */
function OrderForm({ initial, isAdmin = false, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    name: "", status: "not_started", source: "Direct", start_date: "", end_date: "",
    delivery_time: "", person: "", website: "", order_data: "", price: "", doc_file: "", google_sheet: "",
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
        <Pick label="Source" value={f.source || "Direct"} set={(v) => set("source", v)} opts={SOURCES.map((s) => [s, s])} />
        <Field label="Person" value={f.person || ""} onChange={(v) => set("person", v)} placeholder="Who's on it (optional)" />
      </Row>
      <Row>
        <Field label="Start date" value={f.start_date ? String(f.start_date).slice(0, 10) : ""} onChange={(v) => set("start_date", v)} type="date" />
        <Field label="End / delivered" value={f.end_date ? String(f.end_date).slice(0, 10) : ""} onChange={(v) => set("end_date", v)} type="date" />
      </Row>
      <Row>
        <Field label="Time" value={f.delivery_time || ""} onChange={(v) => set("delivery_time", v)} type="time" />
        <Field label="Website link" value={f.website || ""} onChange={(v) => set("website", v)} placeholder="https://client-site.com (optional)" />
      </Row>
      {isAdmin && (
        <Field label="Project price (admin only)" value={f.price ?? ""} onChange={(v) => set("price", v)} type="number" placeholder="0" />
      )}
      <Row>
        <Field label="Doc file link" value={f.doc_file || ""} onChange={(v) => set("doc_file", v)} placeholder="https://docs.google.com/… (optional)" />
        <Field label="Google sheet link" value={f.google_sheet || ""} onChange={(v) => set("google_sheet", v)} placeholder="https://docs.google.com/… (optional)" />
      </Row>
      <label style={lbl}>Order data</label>
      <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.order_data || ""} onChange={(e) => set("order_data", e.target.value)} placeholder="e.g. 37 pages on page seo" />
      <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>
        {initial ? "Save changes" : "Add order"}
      </button>
    </Modal>
  );
}

/* ---------------- Bulk import (spreadsheet / CSV) ---------------- */
const FIELD_OPTS = [
  ["", "— Ignore —"], ["name", "Name"], ["status", "Status"], ["start_date", "Start date"],
  ["end_date", "End / delivered"], ["delivery_time", "Time"], ["person", "Person"],
  ["website", "Website"], ["order_data", "Order data"], ["doc_file", "Doc file"], ["google_sheet", "Google sheet"],
];
const FIELD_LABEL = Object.fromEntries(FIELD_OPTS);

function ImportOrders({ onClose, onImport }) {
  const [raw, setRaw] = useState("");
  const [headerPref, setHeaderPref] = useState(undefined); // undefined = auto-detect
  const [mapping, setMapping] = useState([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const parsed = useMemo(
    () => parseImport(raw, headerPref === undefined ? {} : { hasHeader: headerPref }),
    [raw, headerPref],
  );
  // Reset the column mapping whenever the detected structure changes.
  const sig = parsed.headers.join("¦") + "|" + parsed.hasHeader;
  useEffect(() => { setMapping(parsed.mapping); }, [sig]);

  const result = useMemo(() => rowsToOrders(parsed.dataRows, mapping), [parsed.dataRows, mapping]);
  const orders = result.orders;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      toast("For Excel files, open the sheet, copy the rows, and paste them here — or save as CSV.", "error");
      return;
    }
    try { setRaw(await file.text()); }
    catch { toast("Could not read that file.", "error"); }
  };

  const doImport = async () => {
    if (busy || !orders.length) return;
    setBusy(true);
    const res = await onImport(orders);
    setBusy(false);
    if (res) { toast(`Imported ${res.created || orders.length} order${(res.created || orders.length) === 1 ? "" : "s"}`); onClose(); }
    // On failure the Dashboard's run() already surfaced the error; keep the modal open.
  };

  const setCol = (i, field) => setMapping((m) => m.map((v, j) => (j === i ? field : v)));
  const previewCols = ["name", "status", "start_date", "end_date", "person", "website", "order_data", "doc_file", "google_sheet"];
  const th = { fontSize: 10, fontWeight: 800, color: GRAY, textTransform: "uppercase", textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" };
  const td = { fontSize: 11.5, fontWeight: 600, padding: "6px 8px", whiteSpace: "nowrap", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" };

  return (
    <Modal title="Import orders" onClose={onClose} maxWidth={780}>
      <p style={{ fontSize: 13, color: GRAY, fontWeight: 600, marginBottom: 12 }}>
        Paste rows copied from Google Sheets or Excel (they copy as tab-separated), or choose a CSV file.
        The first row should be the column headings.
      </p>

      <textarea
        style={{ ...input, minHeight: 120, resize: "vertical", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}
        placeholder={"Name\tStatus\tstart\tend / delivered\tPerson\twebsite link\torder data\ndemo\tIn Progress\t6/2/26\t2026-07-02\tzach\tdemo.com\tmonthly seo"}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        aria-label="Paste spreadsheet rows"
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <label style={{ ...btn("#fff", ink), cursor: "pointer", fontSize: 12.5 }}>
          <Upload size={14} /> Choose CSV file
          <input type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ display: "none" }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: ink, cursor: "pointer" }}>
          <input type="checkbox" checked={parsed.hasHeader} onChange={(e) => setHeaderPref(e.target.checked)} />
          First row is a header
        </label>
      </div>

      {parsed.headers.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: ink, margin: "18px 0 8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>Match columns</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {parsed.headers.map((h, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 130 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: GRAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }} title={h}>{h}</span>
                <select style={{ ...sel, flex: "none", padding: "7px 8px", fontSize: 12 }} value={mapping[i] || ""} onChange={(e) => setCol(i, e.target.value)}>
                  {FIELD_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, color: ink, margin: "18px 0 8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Preview {orders.length > 0 ? `· ${orders.length} order${orders.length === 1 ? "" : "s"}` : ""}{result.skipped ? ` · ${result.skipped} skipped (no name)` : ""}
          </div>
          {orders.length === 0 ? (
            <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 600 }}>
              {mapping.includes("name") ? "No rows with an order name yet." : "Map one column to Name to continue."}
            </div>
          ) : (
            <div className="scroll-x" style={{ border: "2px solid #f0ece2", borderRadius: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{previewCols.map((c) => <th key={c} style={th}>{FIELD_LABEL[c]}</th>)}</tr></thead>
                <tbody>
                  {orders.slice(0, 8).map((o, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f0ece2" }}>
                      {previewCols.map((c) => <td key={c} style={{ ...td, color: o[c] ? ink : MUTED }} title={o[c]}>{o[c] || "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length > 8 && <div style={{ fontSize: 11.5, color: GRAY, fontWeight: 600, padding: "6px 8px" }}>+ {orders.length - 8} more…</div>}
            </div>
          )}
        </>
      )}

      <button
        style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center", opacity: (busy || !orders.length) ? 0.6 : 1 }}
        onClick={doImport}
        disabled={busy || !orders.length}
      >
        <Upload size={16} /> {busy ? "Importing…" : `Import ${orders.length || ""} order${orders.length === 1 ? "" : "s"}`.trim()}
      </button>
    </Modal>
  );
}

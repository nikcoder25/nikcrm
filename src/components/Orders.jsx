import React, { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, Download, Search, ExternalLink, Upload, FileText, Sheet } from "lucide-react";
import { ink, accent, tint, BDt, btn, iconBtn, sel, lbl, input } from "../lib/theme";
import { ORDER_STATES, SOURCES } from "../lib/constants";
import { dateLabel, money } from "../lib/format";
import { downloadCsv, ordersCsv } from "../lib/csv";
import { parseImport, rowsToOrders } from "../lib/importParse";
import { useToast } from "../lib/toast";
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
export default function Orders({ orders, onCreate, onImport, onUpdate, onStatus, onDelete, isAdmin = false }) {
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
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
    && (!filterSource || (o.source || "Direct") === filterSource)
    && (!q || [o.name, o.person, o.website, o.order_data, o.source].some((v) => String(v || "").toLowerCase().includes(q)))
  ), [orders, filterStatus, filterSource, q]);

  const open = orders.filter((o) => !isDone(o)).length;

  const cell = { fontSize: 12.5, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  // Source sits after Status; Price is an admin-only track; Files (doc/sheet
  // links) is always shown before the actions column.
  const GRID = `minmax(130px,1.4fr) 126px 92px 88px 88px 62px minmax(104px,1fr) minmax(90px,0.9fr) minmax(140px,1.4fr) minmax(150px,1.5fr)${isAdmin ? " 96px" : ""} 64px 74px`;
  const minWidth = isAdmin ? 1340 : 1244;
  const th = { fontSize: 10.5, fontWeight: 800, color: GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };
  const fileLink = { color: ink, display: "inline-flex" };

  return (
    <div>
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
          {open} open / {orders.length} total
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
                  <span style={{ ...cell, fontWeight: 800 }} title={o.name}>{o.name}</span>
                  <select
                    value={o.status || "not_started"}
                    onChange={(e) => onStatus({ ...o, status: e.target.value })}
                    style={{ ...sel, flex: "none", minWidth: 0, padding: "7px 8px", fontSize: 12, fontWeight: 800, background: STATUS_BG[o.status] || "#fff" }}
                  >
                    {ORDER_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <span style={{ ...cell, color: o.source ? ink : MUTED }}>{o.source || "Direct"}</span>
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
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {o.doc_file ? <a href={o.doc_file} target="_blank" rel="noopener noreferrer" title="Doc file" style={fileLink}><FileText size={15} /></a> : null}
                    {o.google_sheet ? <a href={o.google_sheet} target="_blank" rel="noopener noreferrer" title="Google sheet" style={fileLink}><Sheet size={15} /></a> : null}
                    {!o.doc_file && !o.google_sheet ? <span style={{ color: MUTED }}>—</span> : null}
                  </span>
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

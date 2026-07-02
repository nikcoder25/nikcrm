import React, { useState, useEffect } from "react";
import { Plus, Trash2, CalendarPlus } from "lucide-react";
import { accent, ink, tint, disp, BDt, btn, iconBtn, sel, input } from "../lib/theme";
import { TASK_TYPES, typeLabel } from "../lib/constants";
import { ym, ymLabel } from "../lib/format";
import { scopeRows } from "../lib/scope";
import { saveRetainer, deleteRetainer, generateMonthDeliverables } from "../lib/api";
import { Empty } from "./ui";

const STATE = {
  over: { color: "#c0392b", bg: "#f7dede" },
  complete: { color: "#1f9d57", bg: "#d7f5df" },
  under: { color: "#6b6580", bg: "#f0ece2" },
};

// Inline editable quantity, saved on blur when changed.
function ScopeQty({ value, onSave }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input type="number" min="0" value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = Number(v) || 0; if (n !== value) onSave(n); }}
      style={{ ...input, width: 66, padding: "6px 8px", textAlign: "center" }} />
  );
}

export default function ClientScope({ client, retainers = [], deliverables = [], onChanged }) {
  const [month, setMonth] = useState(ym(new Date()));
  const [addType, setAddType] = useState("");
  const [addQty, setAddQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [genMsg, setGenMsg] = useState("");

  const rows = scopeRows(retainers, deliverables, client.id, month);
  const usedTypes = new Set(retainers.filter((r) => r.client_id === client.id).map((r) => r.type));
  const available = TASK_TYPES.filter((t) => !usedTypes.has(t.key));

  const guard = async (fn) => { setErr(""); setGenMsg(""); setBusy(true); try { await fn(); } catch (e) { setErr(e?.message || "Something went wrong."); } setBusy(false); };
  const add = () => { if (!addType) return; guard(async () => { await saveRetainer(client.id, addType, Number(addQty) || 0); setAddType(""); setAddQty(""); onChanged("client_retainers"); }); };
  const setQty = (type, qty) => guard(async () => { await saveRetainer(client.id, type, qty); onChanged("client_retainers"); });
  const remove = (id) => guard(async () => { await deleteRetainer(id); onChanged("client_retainers"); });
  // Top up the selected month's deliverables to this client's retainer scope.
  const generate = () => guard(async () => {
    const { created } = await generateMonthDeliverables({ client_id: client.id, month });
    onChanged("deliverables");
    setGenMsg(created > 0
      ? `Created ${created} deliverable${created === 1 ? "" : "s"} from the retainer scope.`
      : `${ymLabel(month)} already matches the retainer scope — nothing to create.`);
  });

  const months = (() => {
    const set = new Set([month]); const now = new Date();
    for (let i = 0; i < 12; i++) set.add(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    return [...set].sort().reverse();
  })();

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", flex: 1 }}>
          Scope / retainer
        </div>
        <select style={{ ...sel, flex: "none", minWidth: 140 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
        </select>
        {rows.length > 0 && (
          <button style={btn("#fff", ink)} disabled={busy} title="Create the missing deliverables for this month from the retainer scope" onClick={generate}>
            <CalendarPlus size={15} /> Generate for {ymLabel(month)}
          </button>
        )}
      </div>
      {err && <div style={{ background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}
      {genMsg && <div style={{ background: "#d7f5df", border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{genMsg}</div>}

      {rows.length === 0 ? (
        <Empty>No scope set. Add the deliverable types included in this client's monthly retainer.</Empty>
      ) : (
        <div style={{ border: BDt, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
          {rows.map((r) => {
            const s = STATE[r.state];
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid #f0ece2", flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 110, fontWeight: 800, fontSize: 13.5 }}>{typeLabel(r.type)}</span>
                <span style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 700 }}>Included</span>
                <ScopeQty value={r.included} onSave={(q) => setQty(r.type, q)} />
                <span style={{ fontSize: 13, fontWeight: 800, minWidth: 82, textAlign: "right" }}>{r.delivered} delivered</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: s.color, background: s.bg, border: BDt, borderRadius: 7, padding: "3px 9px", minWidth: 92, textAlign: "center" }}>
                  {r.state === "over" ? `Over +${r.delta}` : r.state === "complete" ? "Complete" : `${Math.max(0, -r.delta)} to go`}
                </span>
                <button style={iconBtn} title="Remove" disabled={busy} onClick={() => remove(r.id)}><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}

      {available.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select style={{ ...sel, flex: 1, minWidth: 140 }} value={addType} onChange={(e) => setAddType(e.target.value)}>
            <option value="">Add a scope type…</option>
            {available.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <input type="number" min="0" style={{ ...input, width: 90 }} placeholder="Qty/mo" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
          <button style={btn(accent, "#fff")} disabled={busy || !addType} onClick={add}><Plus size={15} /> Add</button>
        </div>
      )}
    </div>
  );
}

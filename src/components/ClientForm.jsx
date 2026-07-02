import React, { useState } from "react";
import { X } from "lucide-react";
import { accent, disp, iconBtn, overlay, modal, btn, lbl, input } from "../lib/theme";
import { STATUSES, STATUS_LABEL, SOURCES, PACKAGES } from "../lib/constants";
import { Field, Pick, Row } from "./ui";

/* ---------------- Client form ---------------- */
export default function ClientForm({ initial, onClose, onSave }) {
  const [f, setF] = useState(initial || {
    name: "", niche: "", status: "active", source: "Direct", package: "Standard",
    fee: "", team_member: "", start_month: "", renewal_month: "", risk: "low", notes: "", gsc_property: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => { if (!f.name.trim()) return; onSave({ ...f, fee: Number(f.fee) || 0 }); };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: disp, fontSize: 19, textTransform: "uppercase", marginBottom: 8 }}>
          <span>{initial ? "Edit client" : "Add client"}</span>
          <button style={iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <Field label="Client name" value={f.name} onChange={(v) => set("name", v)} placeholder="e.g. Ridgeline HVAC" />
        <Row>
          <Field label="Niche" value={f.niche} onChange={(v) => set("niche", v)} placeholder="HVAC, Paving..." />
          <Field label="Team member" value={f.team_member} onChange={(v) => set("team_member", v)} placeholder="Assigned to" />
        </Row>
        <Row>
          <Pick label="Status" value={f.status} set={(v) => set("status", v)} opts={STATUSES.map((s) => [s, STATUS_LABEL[s]])} />
          <Pick label="Source" value={f.source} set={(v) => set("source", v)} opts={SOURCES.map((s) => [s, s])} />
        </Row>
        <Row>
          <Pick label="Package" value={f.package} set={(v) => set("package", v)} opts={PACKAGES.map((s) => [s, s])} />
          <Field label="Monthly fee" value={f.fee} onChange={(v) => set("fee", v)} placeholder="0" type="number" />
        </Row>
        <Row>
          <Field label="Start month" value={f.start_month} onChange={(v) => set("start_month", v)} type="month" />
          <Field label="Renewal month" value={f.renewal_month} onChange={(v) => set("renewal_month", v)} type="month" />
        </Row>
        <Field label="Search Console property" value={f.gsc_property || ""} onChange={(v) => set("gsc_property", v)} placeholder="sc-domain:example.com" />
        <label style={lbl}>Notes</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes, special requests..." />
        <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center" }} onClick={submit}>{initial ? "Save changes" : "Add client"}</button>
      </div>
    </div>
  );
}

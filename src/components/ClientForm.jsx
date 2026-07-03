import React, { useState } from "react";
import { Loader } from "lucide-react";
import { accent, btn, lbl, input } from "../lib/theme";
import { STATUSES, STATUS_LABEL, SOURCES, PACKAGES } from "../lib/constants";
import { useToast } from "../lib/toast";
import { Field, Pick, Row, Modal, assigneeOptions } from "./ui";

/* ---------------- Client form ---------------- */
export default function ClientForm({ initial, members = [], onClose, onSave }) {
  const [f, setF] = useState(initial || {
    name: "", niche: "", status: "active", source: "Direct", package: "Standard",
    fee: "", team_member: "", start_month: "", renewal_month: "", risk: "low", notes: "", gsc_property: "", email: "",
    doc_file: "", google_sheet: "", canva: "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // Warn (don't block) when a paying client has no start month — otherwise
  // Monthly Recurring counts fees that aren't actually billing yet.
  const feeWithoutStart = (Number(f.fee) || 0) > 0 && !f.start_month;

  const submit = async () => {
    if (busy) return; // guard double-submit
    const errs = {};
    if (!f.name.trim()) errs.name = "Client name is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSave({ ...f, fee: Number(f.fee) || 0 });
      toast(initial ? "Client updated" : "Client added");
      onClose();
    } catch (e) {
      toast(e?.message || "Could not save client.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit client" : "Add client"} onClose={onClose}>
      <Field label="Client name" value={f.name} onChange={(v) => set("name", v)} placeholder="e.g. Ridgeline HVAC" required error={errors.name} />
      <Row>
        <Field label="Niche" value={f.niche} onChange={(v) => set("niche", v)} placeholder="HVAC, Paving..." />
        <Pick label="Team member" value={f.team_member} set={(v) => set("team_member", v)} opts={assigneeOptions(members, f.team_member)} />
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
      <Field label="Contact email" value={f.email} onChange={(v) => set("email", v)} placeholder="name@company.com — enables Gmail sync" type="email" />
      {feeWithoutStart && (
        <div style={{ background: "#fdf3d8", border: "2px solid #b7791f", color: "#7a4f10", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>
          ⚠ This client has a monthly fee but no start month. Add one so Monthly Recurring stays accurate.
        </div>
      )}
      <Field label="Search Console property" value={f.gsc_property || ""} onChange={(v) => set("gsc_property", v)} placeholder="sc-domain:example.com" />
      <Row>
        <Field label="Doc file link" value={f.doc_file || ""} onChange={(v) => set("doc_file", v)} placeholder="https://docs.google.com/… (optional)" />
        <Field label="Google sheet link" value={f.google_sheet || ""} onChange={(v) => set("google_sheet", v)} placeholder="https://docs.google.com/… (optional)" />
      </Row>
      <Field label="Canva link" value={f.canva || ""} onChange={(v) => set("canva", v)} placeholder="https://canva.com/… (optional)" />
      <label style={lbl} htmlFor="client-notes">Notes</label>
      <textarea id="client-notes" style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes, special requests..." />
      <button style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 20, justifyContent: "center", opacity: busy ? 0.7 : 1 }} onClick={submit} disabled={busy}>
        {busy ? <Loader size={16} className="spin" /> : null}
        {busy ? "Saving…" : initial ? "Save changes" : "Add client"}
      </button>
    </Modal>
  );
}

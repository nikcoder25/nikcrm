import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { ink, accent, disp, BD, BDt, SH, lbl, input, overlay, modal, iconBtn } from "../lib/theme";

const errText = { color: "#c0392b", fontSize: 11.5, fontWeight: 700, marginTop: 4 };
const reqMark = <span aria-hidden="true" style={{ color: "#c0392b" }}> *</span>;

/* ---------------- form fields (label-associated + validation) ---------------- */
export function Field({ label, value, onChange, placeholder, type = "text", required, error }) {
  const id = useId();
  return (
    <div style={{ flex: 1 }}>
      <label htmlFor={id} style={lbl}>{label}{required && reqMark}</label>
      <input id={id} style={{ ...input, ...(error ? { borderColor: "#c0392b" } : null) }} type={type}
        value={value} placeholder={placeholder}
        aria-required={required || undefined} aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)} />
      {error && <div style={errText}>{error}</div>}
    </div>
  );
}

export function Pick({ label, value, set, opts, required, error }) {
  const id = useId();
  return (
    <div style={{ flex: 1 }}>
      <label htmlFor={id} style={lbl}>{label}{required && reqMark}</label>
      <select id={id} style={{ ...input, ...(error ? { borderColor: "#c0392b" } : null) }} value={value}
        aria-required={required || undefined} aria-invalid={error ? true : undefined}
        onChange={(e) => set(e.target.value)}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {error && <div style={errText}>{error}</div>}
    </div>
  );
}

export const Row = ({ children }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
export const Panel = ({ children }) => <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, overflow: "hidden" }}>{children}</div>;

// Empty state with an optional call-to-action button, so a blank section can
// route the user straight into the add flow instead of dead-ending.
export const Empty = ({ children, action }) => (
  <div style={{ padding: "44px 20px", textAlign: "center", color: ink, fontWeight: 700 }}>
    <div style={{ opacity: 0.55 }}>{children}</div>
    {action && <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>{action}</div>}
  </div>
);

export const Center = ({ children }) => <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: ink, opacity: 0.6, fontWeight: 700 }}>{children}</div>;

export function RevCard({ icon: I, label, val, hint, onClick }) {
  const clickable = Boolean(onClick);
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      {...(clickable ? { type: "button", onClick, className: "kpi-click", "aria-label": `${label}: ${val}. Open ${label}` } : {})}
      style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 20, display: "flex", gap: 15, alignItems: "center", width: "100%", textAlign: "left", color: ink, cursor: clickable ? "pointer" : "default", font: "inherit" }}>
      <div style={{ width: 50, height: 50, borderRadius: 13, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: BDt, flexShrink: 0 }}><I size={22} /></div>
      <div>
        <div style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 900, fontFamily: disp, margin: "4px 0 2px" }}>{val}</div>
        <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>{hint}</div>
      </div>
    </Tag>
  );
}

// Shared modal shell: backdrop-click and Escape both close it, and it carries
// the dialog role + a real <h2> title so every modal is consistent + accessible.
export function Modal({ title, onClose, children, maxWidth = 480 }) {
  const titleId = useId();
  const ref = useRef(null);
  useEffect(() => {
    // Move focus into the dialog on open (first field if there is one), and
    // restore it to whatever was focused before when the dialog closes.
    const prev = document.activeElement;
    const el = ref.current;
    const field = el && el.querySelector("input, select, textarea");
    (field || el)?.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [onClose]);
  return (
    <div style={overlay} onClick={onClose}>
      <div ref={ref} tabIndex={-1} style={{ ...modal, maxWidth, outline: "none" }} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby={title != null ? titleId : undefined}>
        {title != null && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h2 id={titleId} style={{ fontFamily: disp, fontSize: 19, textTransform: "uppercase", fontWeight: 400, margin: 0 }}>{title}</h2>
            <button style={iconBtn} onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Build [value,label] options for an assignee/team-member <select> from the
// roster. Always offers "Unassigned"; keeps a legacy name that predates the
// roster selectable so existing assignments aren't silently wiped on edit.
export function assigneeOptions(members = [], current = "") {
  const names = members.map((m) => m.name);
  const opts = [["", "Unassigned"], ...names.map((n) => [n, n])];
  if (current && !names.includes(current)) opts.push([current, `${current} (not in roster)`]);
  return opts;
}

import React from "react";
import { ink, accent, disp, BD, BDt, SH, lbl, input } from "../lib/theme";

/* ---------------- little UI helpers ---------------- */
export function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (<div style={{ flex: 1 }}><label style={lbl}>{label}</label>
    <input style={input} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>);
}

export function Pick({ label, value, set, opts }) {
  return (<div style={{ flex: 1 }}><label style={lbl}>{label}</label>
    <select style={input} value={value} onChange={(e) => set(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>);
}

export const Row = ({ children }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
export const Panel = ({ children }) => <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, overflow: "hidden" }}>{children}</div>;
export const Empty = ({ children }) => <div style={{ padding: "48px 20px", textAlign: "center", color: ink, opacity: 0.5, fontWeight: 700 }}>{children}</div>;
export const Center = ({ children }) => <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: ink, opacity: 0.6, fontWeight: 700 }}>{children}</div>;

export function RevCard({ icon: I, label, val, hint }) {
  return (
    <div style={{ background: "#fff", border: BD, borderRadius: 16, boxShadow: SH, padding: 20, display: "flex", gap: 15, alignItems: "center" }}>
      <div style={{ width: 50, height: 50, borderRadius: 13, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: BDt }}><I size={22} /></div>
      <div>
        <div style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 900, fontFamily: disp, margin: "4px 0 2px" }}>{val}</div>
        <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>{hint}</div>
      </div>
    </div>
  );
}

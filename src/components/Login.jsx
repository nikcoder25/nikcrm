import React, { useState } from "react";
import { Loader } from "lucide-react";
import { login } from "../lib/api";
import { ink, accent, cream, tint, disp, BD, BDt, SHs, btn, globalCss } from "../lib/theme";
import { Field } from "./ui";

/* ---------------- Login (shared team password) ---------------- */
export default function Login({ onLogin }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const session = await login(name, pw);
      onLogin(session);
    } catch (e) { setErr(e.message || "Something went wrong"); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter',sans-serif", color: ink }}>
      <style>{globalCss}</style>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", border: BD, borderRadius: 18, boxShadow: "8px 8px 0 " + ink, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: disp, fontSize: 17, border: BD, boxShadow: SHs }}>GA</div>
          <div>
            <div style={{ fontFamily: disp, fontSize: 20 }}>Growth Atlas</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>SEO Operations</div>
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: "#6b6580", margin: "10px 0 18px", fontWeight: 500 }}>
          Enter your name and the team password to open the board.
        </p>
        <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Vivek" />
        <Field label="Team password" value={pw} onChange={setPw} placeholder="shared team password" type="password" />
        {err && <p style={{ color: ink, background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 12, fontWeight: 600 }}>{err}</p>}
        <button onClick={submit} disabled={busy} style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 18, justifyContent: "center" }}>
          {busy ? <Loader size={16} className="spin" /> : "Enter board"}
        </button>
        <p style={{ textAlign: "center", fontSize: 12, marginTop: 16, color: "#6b6580", fontWeight: 500 }}>
          Everyone on the team shares one password and sees the same board.
        </p>
      </div>
    </div>
  );
}

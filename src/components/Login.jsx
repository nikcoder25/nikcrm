import React, { useState } from "react";
import { Loader } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { ink, accent, cream, tint, disp, BD, BDt, SHs, btn, globalCss } from "../lib/theme";
import { Field } from "./ui";

/* ---------------- Login / Signup ---------------- */
export default function Login() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name } } });
        if (error) throw error;
        setMsg("Account created. If email confirmation is on, check your inbox, then log in.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
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
          {mode === "login" ? "Log in to your team's board." : "Create your account to join the team."}
        </p>
        {mode === "signup" && <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Vivek" />}
        <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
        <Field label="Password" value={pw} onChange={setPw} placeholder="min 6 characters" type="password" />
        {err && <p style={{ color: ink, background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 12, fontWeight: 600 }}>{err}</p>}
        {msg && <p style={{ color: accent, fontSize: 13, marginTop: 12, fontWeight: 700 }}>{msg}</p>}
        <button onClick={submit} disabled={busy} style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 18, justifyContent: "center" }}>
          {busy ? <Loader size={16} className="spin" /> : (mode === "login" ? "Log in" : "Sign up")}
        </button>
        <p style={{ textAlign: "center", fontSize: 13, marginTop: 16, color: "#6b6580", fontWeight: 500 }}>
          {mode === "login" ? "New here? " : "Have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }} style={{ background: "none", border: "none", color: accent, fontWeight: 800, cursor: "pointer" }}>
            {mode === "login" ? "Create account" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}

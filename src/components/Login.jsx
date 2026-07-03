import React, { useState, useEffect } from "react";
import { Loader } from "lucide-react";
import { login } from "../lib/api";
import { googleSsoUrl } from "../lib/google";
import { ink, accent, cream, tint, disp, BD, BDt, SHs, btn, globalCss } from "../lib/theme";
import { Field } from "./ui";

/* ---------------- Login (team password / personal account / Google) ---------------- */
const MODES = [
  ["team", "Team password"],
  ["account", "My account"],
  ["google", "Google"],
];

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("team"); // 'team' | 'account' | 'google'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // A failed "Sign in with Google" redirect lands back here with ?sso=… in the
  // URL. Surface it as the error banner once, then scrub the URL so a refresh
  // doesn't repeat the message. (An effect, not a state initializer: it mutates
  // the URL, and StrictMode's second run must find nothing left to do.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sso = params.get("sso");
    if (!sso) return;
    const msg = params.get("msg") || "";
    params.delete("sso"); params.delete("msg");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    setErr(sso === "nouser"
      ? "No account for this Google email — ask an admin to add you in the Team tab."
      : (msg ? `Google sign-in failed: ${msg}` : "Google sign-in failed. Please try again."));
  }, []);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "google") {
        // Hop to Google's consent screen; the API redirects back logged in.
        const { url } = await googleSsoUrl();
        window.location.assign(url);
        return; // keep the spinner until the browser navigates away
      }
      const session = await login(name, pw, mode === "account" ? email : undefined);
      onLogin(session);
    } catch (e) { setErr(e.message || "Something went wrong"); }
    setBusy(false);
  };

  const blurb = mode === "team"
    ? "Enter your name and the team password to open the board."
    : mode === "account"
      ? "Sign in with the email and password of your personal account."
      : "Use the Google account whose email an admin added to your team profile.";

  const footer = mode === "team"
    ? "Everyone on the team shares one password and sees the same board."
    : "No account yet? Ask an admin to add you in the Team tab.";

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
        <div style={{ display: "flex", gap: 8, margin: "16px 0 4px" }}>
          {MODES.map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setErr(""); }}
              style={{ flex: 1, padding: "9px 6px", borderRadius: 9, border: BDt, background: mode === k ? accent : "#fff", color: mode === k ? "#fff" : ink, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 13.5, color: "#6b6580", margin: "10px 0 4px", fontWeight: 500 }}>{blurb}</p>
        {mode === "team" && (
          <>
            <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Vivek" />
            <Field label="Team password" value={pw} onChange={setPw} placeholder="shared team password" type="password" />
          </>
        )}
        {mode === "account" && (
          <>
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@agency.com" type="email" />
            <Field label="Password" value={pw} onChange={setPw} placeholder="your account password" type="password" />
          </>
        )}
        {err && <p style={{ color: ink, background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 13, marginTop: 12, fontWeight: 600 }}>{err}</p>}
        <button onClick={submit} disabled={busy} style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 18, justifyContent: "center" }}>
          {busy ? <Loader size={16} className="spin" /> : mode === "google" ? "Continue with Google" : "Enter board"}
        </button>
        <p style={{ textAlign: "center", fontSize: 12, marginTop: 16, color: "#6b6580", fontWeight: 500 }}>{footer}</p>
      </div>
    </div>
  );
}

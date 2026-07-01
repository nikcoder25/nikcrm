import React from "react";
import { ink, cream, disp, BD, globalCss } from "../lib/theme";

/* ---------------- Setup screen (shown when Supabase keys are missing) ---------------- */
export default function SetupNeeded() {
  return (
    <div style={{ minHeight: "100vh", background: cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter',sans-serif", color: ink }}>
      <style>{globalCss}</style>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", border: BD, borderRadius: 18, boxShadow: "8px 8px 0 " + ink, padding: 28 }}>
        <div style={{ fontFamily: disp, fontSize: 20, marginBottom: 10 }}>Almost there</div>
        <p style={{ fontSize: 14, color: "#4b4560", fontWeight: 500, lineHeight: 1.55 }}>
          The app can't find your Supabase keys, so it can't connect to the database yet.
        </p>
        <ul style={{ fontSize: 13.5, color: "#4b4560", fontWeight: 500, lineHeight: 1.7, margin: "12px 0", paddingLeft: 18 }}>
          <li>Running locally? Copy <b>.env.example</b> to <b>.env</b> and paste your Project URL and anon key.</li>
          <li>Deployed on Netlify/Vercel? Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> as environment variables, then redeploy.</li>
        </ul>
        <p style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600 }}>
          Find both values in Supabase under <b>Project Settings &gt; API</b>. See the README for the full walkthrough.
        </p>
      </div>
    </div>
  );
}

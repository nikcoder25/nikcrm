import React, { useEffect, useState } from "react";
import { Plug, Check, RefreshCw, Calendar, Mail, Loader } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn } from "../lib/theme";
import { googleStatus, googleAuthUrl, googleDisconnect } from "../lib/google";
import { useToast } from "../lib/toast";
import { Panel, Center } from "./ui";

// Workspace settings: currently the Google (Gmail + Calendar) connection.
// Connecting is admin-only; everyone can see the status. The tokens live
// server-side — this screen only reflects connection state.
export default function Settings({ isAdmin, name, onConnected }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const refresh = async () => {
    try { const s = await googleStatus(); setStatus(s); onConnected?.(Boolean(s.connected)); }
    catch (e) { toast(e?.message || "Could not read integration status.", "error"); }
  };
  useEffect(() => { (async () => { setLoading(true); await refresh(); setLoading(false); })(); }, []);

  const connect = async () => {
    setBusy(true);
    try { const { url } = await googleAuthUrl(name); window.location.assign(url); }
    catch (e) { toast(e?.message || "Could not start Google connect.", "error"); setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await googleDisconnect(); await refresh(); toast("Google disconnected"); }
    catch (e) { toast(e?.message || "Could not disconnect.", "error"); }
    setBusy(false);
  };

  if (loading) return <Center>Loading settings…</Center>;

  const configured = status?.configured;
  const connected = status?.connected;

  return (
    <div style={{ maxWidth: 680 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: BD }}>
          <Plug size={17} />
          <h2 style={{ fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>Google — Gmail &amp; Calendar</h2>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, padding: "3px 11px", borderRadius: 20, border: BDt, background: connected ? "#dff3e8" : tint, color: connected ? "#1f7a4d" : ink }}>
            {connected ? "Connected" : configured ? "Not connected" : "Not configured"}
          </span>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "#4b4560", lineHeight: 1.5, marginBottom: 16 }}>
            Connect one Google account for the whole workspace to sync client emails and follow-ups two ways:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 18 }}>
            <div style={{ border: BDt, borderRadius: 10, padding: "12px 14px", background: "#faf8f2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 13.5 }}><Mail size={15} /> Pull from Gmail</div>
              <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600, marginTop: 4 }}>Import recent emails to/from a client's contact address into their activity timeline.</div>
            </div>
            <div style={{ border: BDt, borderRadius: 10, padding: "12px 14px", background: "#faf8f2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 13.5 }}><Calendar size={15} /> Push to Calendar</div>
              <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600, marginTop: 4 }}>Send a follow-up or meeting straight to Google Calendar from the client's timeline.</div>
            </div>
          </div>

          {!configured && (
            <div style={{ background: "#fdf3d8", border: "2px solid #b7791f", color: "#7a4f10", borderRadius: 10, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
              Google isn't configured on the server yet. An operator needs to create a Google Cloud OAuth client and set
              <code style={{ margin: "0 4px" }}>GOOGLE_CLIENT_ID</code> and <code style={{ margin: "0 4px" }}>GOOGLE_CLIENT_SECRET</code>
              in Netlify (see the README). Then reload this page.
            </div>
          )}

          {configured && connected && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#dff3e8", border: "2px solid #1f7a4d", borderRadius: 10, padding: "12px 14px" }}>
              <Check size={18} style={{ color: "#1f7a4d" }} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{status.account_email || "Google account"}</div>
                <div style={{ fontSize: 12, color: "#4b4560", fontWeight: 600 }}>Gmail &amp; Calendar sync is available on client pages.</div>
              </div>
              <button style={{ ...btn("#fff", ink), fontSize: 12.5 }} disabled={busy} onClick={refresh}><RefreshCw size={14} /> Refresh</button>
              {isAdmin && <button style={{ ...btn("#fff", "#c0392b"), fontSize: 12.5 }} disabled={busy} onClick={disconnect}>Disconnect</button>}
            </div>
          )}

          {configured && !connected && (
            isAdmin ? (
              <button style={{ ...btn(accent, "#fff"), justifyContent: "center" }} disabled={busy} onClick={connect}>
                {busy ? <Loader size={16} className="spin" /> : <Plug size={16} />} {busy ? "Redirecting…" : "Connect Google"}
              </button>
            ) : (
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6b6580" }}>Ask an admin to connect the workspace Google account.</div>
            )
          )}
        </div>
      </Panel>

      <div style={{ marginTop: 14, fontSize: 12, color: "#6b6580", fontWeight: 600, lineHeight: 1.5 }}>
        Access is limited to the scopes shown on Google's consent screen (read-only Gmail and Calendar events). Tokens are stored server-side and never sent to the browser. Disconnecting removes them.
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { Plug, Check, RefreshCw, Calendar, Mail, Loader, DatabaseBackup, Building2, Globe } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn } from "../lib/theme";
import { googleStatus, googleAuthUrl, googleDisconnect } from "../lib/google";
import { backupExport } from "../lib/api";
import { todayStr } from "../lib/format";
import { useToast } from "../lib/toast";
import { Panel, Center } from "./ui";

// Workspace settings: the per-user Google (Gmail + Calendar) connection and
// the admin-only full-database backup download. Google tokens live server-side
// — this screen only reflects connection state for the CURRENT user, plus the
// legacy workspace-wide fallback connection.
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

  const connect = async (workspace = false) => {
    setBusy(true);
    try { const { url } = await googleAuthUrl(name, workspace); window.location.assign(url); }
    catch (e) { toast(e?.message || "Could not start Google connect.", "error"); setBusy(false); }
  };

  const disconnect = async (workspace = false) => {
    setBusy(true);
    try { await googleDisconnect(workspace); await refresh(); toast(workspace ? "Workspace fallback disconnected" : "Google disconnected"); }
    catch (e) { toast(e?.message || "Could not disconnect.", "error"); }
    setBusy(false);
  };

  // Fetch the full export and hand it to the browser as a dated JSON download.
  const [backupBusy, setBackupBusy] = useState(false);
  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      const data = await backupExport();
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `growth-atlas-backup-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Backup downloaded");
    } catch (e) {
      toast(e?.message || "Backup failed.", "error");
    }
    setBackupBusy(false);
  };

  if (loading) return <Center>Loading settings…</Center>;

  const configured = status?.configured;
  const userAccount = Boolean(status?.user_account);   // session is a personal account (not shared password)
  const userConnected = Boolean(status?.user_connected);
  const wsConnected = Boolean(status?.workspace_connected);

  return (
    <div style={{ maxWidth: 680 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: BD }}>
          <Plug size={17} />
          <h2 style={{ fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>Google — Gmail &amp; Calendar</h2>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, padding: "3px 11px", borderRadius: 20, border: BDt, background: userConnected ? "#dff3e8" : tint, color: userConnected ? "#1f7a4d" : ink }}>
            {userConnected ? "Connected" : configured ? "Not connected" : "Not configured"}
          </span>
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "#4b4560", lineHeight: 1.5, marginBottom: 16 }}>
            Connect <b>your own</b> Google account — each teammate connects theirs. Gmail imports, Calendar pushes and Search Console data then run as you:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 18 }}>
            <div style={{ border: BDt, borderRadius: 10, padding: "12px 14px", background: "#faf8f2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 13.5 }}><Mail size={15} /> Pull from Gmail</div>
              <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600, marginTop: 4 }}>Import recent emails to/from a client's contact address into their activity timeline.</div>
            </div>
            <div style={{ border: BDt, borderRadius: 10, padding: "12px 14px", background: "#faf8f2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 13.5 }}><Calendar size={15} /> Push to Calendar</div>
              <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600, marginTop: 4 }}>Send a follow-up or meeting straight to Google Calendar from the client's timeline.</div>
            </div>
            <div style={{ border: BDt, borderRadius: 10, padding: "12px 14px", background: "#faf8f2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 13.5 }}><Globe size={15} /> Search Console</div>
              <div style={{ fontSize: 12.5, color: "#6b6580", fontWeight: 600, marginTop: 4 }}>Import any of your websites on the Websites tab, and attach them to clients to power their Organic search panels.</div>
            </div>
          </div>

          {!configured && (
            <div style={{ background: "#fdf3d8", border: "2px solid #b7791f", color: "#7a4f10", borderRadius: 10, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
              Google isn't configured on the server yet. An operator needs to create a Google Cloud OAuth client and set
              <code style={{ margin: "0 4px" }}>GOOGLE_CLIENT_ID</code> and <code style={{ margin: "0 4px" }}>GOOGLE_CLIENT_SECRET</code>
              in Cloudflare (see the README). Then reload this page.
            </div>
          )}

          {configured && !userAccount && (
            <div style={{ background: "#fdf3d8", border: "2px solid #b7791f", color: "#7a4f10", borderRadius: 10, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
              You're signed in with the shared team password, which has no personal profile to attach a Google account to.
              Sign in via <b>My account</b> or <b>Sign in with Google</b> to connect your own Gmail &amp; Calendar.
            </div>
          )}

          {configured && userAccount && userConnected && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#dff3e8", border: "2px solid #1f7a4d", borderRadius: 10, padding: "12px 14px" }}>
              <Check size={18} style={{ color: "#1f7a4d" }} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{status.user_email || "Your Google account"}</div>
                <div style={{ fontSize: 12, color: "#4b4560", fontWeight: 600 }}>Gmail &amp; Calendar sync runs as you on client pages.</div>
              </div>
              <button style={{ ...btn("#fff", ink), fontSize: 12.5 }} disabled={busy} onClick={refresh}><RefreshCw size={14} /> Refresh</button>
              <button style={{ ...btn("#fff", "#c0392b"), fontSize: 12.5 }} disabled={busy} onClick={() => disconnect(false)}>Disconnect</button>
            </div>
          )}

          {configured && userAccount && !userConnected && (
            <button style={{ ...btn(accent, "#fff"), justifyContent: "center" }} disabled={busy} onClick={() => connect(false)}>
              {busy ? <Loader size={16} className="spin" /> : <Plug size={16} />} {busy ? "Redirecting…" : "Connect your Google account"}
            </button>
          )}

          {/* Legacy workspace-wide fallback: used when someone hasn't connected
              their own account. Admin-managed; per-user always wins. */}
          {configured && (wsConnected || isAdmin) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, border: BDt, borderRadius: 10, padding: "10px 14px", background: "#faf8f2" }}>
              <Building2 size={15} style={{ color: "#6b6580" }} />
              <div style={{ flex: 1, minWidth: 160, fontSize: 12.5, fontWeight: 700, color: "#4b4560" }}>
                Workspace fallback: {wsConnected
                  ? <>connected as <b>{status.workspace_email || "a Google account"}</b> — used for teammates who haven't connected their own.</>
                  : "not connected. Optional shared account used when someone hasn't connected their own."}
              </div>
              {isAdmin && (wsConnected
                ? <button style={{ ...btn("#fff", "#c0392b"), fontSize: 12, padding: "7px 11px" }} disabled={busy} onClick={() => disconnect(true)}>Disconnect</button>
                : <button style={{ ...btn("#fff", ink), fontSize: 12, padding: "7px 11px" }} disabled={busy} onClick={() => connect(true)}>Connect fallback</button>)}
            </div>
          )}
        </div>
      </Panel>

      <div style={{ marginTop: 14, fontSize: 12, color: "#6b6580", fontWeight: 600, lineHeight: 1.5 }}>
        Access is limited to the scopes shown on Google's consent screen (read-only Gmail, Calendar events, and
        read-only Search Console). Tokens are stored server-side, per user, and never sent to the browser.
        Disconnecting removes yours. Signing in with Google (on the login screen) only ever asks for your email
        and profile — never your mailbox or sites. Connected before Search Console was added? Reconnect once to grant it.
      </div>

      <div style={{ marginTop: 18 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: BD }}>
          <DatabaseBackup size={17} />
          <h2 style={{ fontFamily: disp, fontSize: 15, textTransform: "uppercase" }}>Backup</h2>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "#4b4560", lineHeight: 1.5, marginBottom: 14 }}>
            Download the entire database — clients, tasks, payments, deliverables, keywords &amp; rank history,
            backlinks, AI visibility, reports, retainers, team, activity — as one JSON file you keep. Do it on a
            schedule that matches how much work you'd be willing to re-enter (weekly is a good default).
            Uploaded files aren't included (their list is; re-upload from your originals), and no passwords or
            connection secrets ever leave the server.
          </p>
          {isAdmin ? (
            <button style={{ ...btn(accent, "#fff") }} disabled={backupBusy} onClick={downloadBackup}>
              {backupBusy ? <Loader size={15} className="spin" /> : <DatabaseBackup size={15} />}
              {backupBusy ? "Preparing…" : "Download backup"}
            </button>
          ) : (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6b6580" }}>Only an admin can download a backup.</div>
          )}
        </div>
      </Panel>
      </div>
    </div>
  );
}

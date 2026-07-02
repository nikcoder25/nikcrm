import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Trash2, Paperclip, Link2, FileText, Upload, ExternalLink, Search, Plus, Share2, Copy, RefreshCw, Mail, BarChart3 } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, SHs, btn, iconBtn, input, lbl } from "../lib/theme";
import { STATUS_LABEL } from "../lib/constants";
import { money } from "../lib/format";
import { portalPath } from "../lib/router";
import {
  addResourceLink, uploadResourceFile, deleteResource, fetchFileObjectUrl, MAX_FILE_BYTES,
  createKeyword, updateKeyword, deleteKeyword,
  getPortalToken, createPortalToken, setPortalTokenEnabled, getReportEmail, setReportEmail, gscLoad,
} from "../lib/api";
import { Empty } from "./ui";
import { KeywordRows, KeywordForm, keywordSummary } from "./Keywords";
import ClientScope from "./ClientScope";
import ClientReport from "./ClientReport";

const fmtSize = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

// The detail view is now its own page (URL: /clients/:id) rather than a modal
// overlay, so it flows in the normal document instead of a fixed-position card.
const pageCard = {
  background: "#fff", borderRadius: 18, padding: 26, width: "100%", maxWidth: 720,
  margin: "0 auto", border: BD, boxShadow: SH,
};

/* ---------------- Google Search Console panel ----------------
   Lazily fetches this client's organic performance (filled nightly by the
   gsc-sync scheduled function) once a Search Console property is linked. */

const GSC_GREEN = "#1f9d57";
const GSC_RED = "#c0392b";
const GSC_GRAY = "#6b6580";

// Normalize a gsc_daily row: date as 'YYYY-MM-DD', numbers as numbers.
const gscDay = (d) => ({
  date: String(d.date).slice(0, 10),
  clicks: Number(d.clicks) || 0,
  impressions: Number(d.impressions) || 0,
});

// Clicks + impressions for the last 28 days of data vs the 28 days before,
// anchored on the latest synced date (GSC data lags ~2 days). The previous
// window only counts as comparable once it holds at least 14 days of rows.
function gscWindows(daily) {
  if (!daily.length) return null;
  const last = new Date(daily[daily.length - 1].date + "T00:00:00Z").getTime();
  const cur = { clicks: 0, impressions: 0 };
  const prev = { clicks: 0, impressions: 0 };
  let prevDays = 0;
  for (const d of daily) {
    const age = Math.round((last - new Date(d.date + "T00:00:00Z").getTime()) / 86400000);
    if (age < 28) { cur.clicks += d.clicks; cur.impressions += d.impressions; }
    else if (age < 56) { prev.clicks += d.clicks; prev.impressions += d.impressions; prevDays += 1; }
  }
  return { cur, prev, comparable: prevDays >= 14 };
}

// "+12%" green / "-8%" red vs the previous window; null when not comparable.
function pctChange(cur, prev, comparable) {
  if (!comparable || !(prev > 0)) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, color: pct > 0 ? GSC_GREEN : pct < 0 ? GSC_RED : GSC_GRAY };
}

function GscStat({ label, value, change }) {
  return (
    <div style={{ flex: 1, minWidth: 140, border: BDt, borderRadius: 10, padding: "10px 14px", background: "#faf8f2" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: GSC_GRAY, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 3 }}>
        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: disp }}>{value.toLocaleString()}</span>
        {change && <span style={{ fontSize: 12, fontWeight: 800, color: change.color }}>{change.label} vs prev 28d</span>}
      </div>
    </div>
  );
}

// SVG line chart of daily clicks — same inline-SVG style as the rank chart in
// Keywords.jsx, but with a normal y-axis (0 at the bottom, clicks up).
function GscClicksChart({ daily, width = 620, height = 150 }) {
  const pts = daily.map((d) => ({ v: d.clicks, t: new Date(d.date + "T00:00:00Z").getTime() }));
  if (pts.length < 2) return null;
  const max = Math.max(1, ...pts.map((p) => p.v));
  const padL = 42, padR = 12, padT = 10, padB = 24;
  const iw = width - padL - padR, ih = height - padT - padB;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = (t) => padL + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * iw;
  const y = (v) => padT + (1 - v / max) * ih;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const yTicks = [...new Set([0, Math.round(max / 2), max])];
  const nX = Math.max(2, Math.min(5, pts.length));
  const xTicks = Array.from({ length: nX }, (_, i) => t0 + (i / (nX - 1)) * Math.max(1, t1 - t0));
  const fmtTick = (t) => new Date(t).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke="#e8e4d8" strokeWidth="1" />
          <text x={padL - 7} y={y(v) + 3.5} textAnchor="end" fontSize="10" fontWeight="700" fill={GSC_GRAY}>{v.toLocaleString()}</text>
        </g>
      ))}
      {xTicks.map((t, i) => (
        <text key={`x${i}`} x={x(t)} y={height - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill={GSC_GRAY}>{fmtTick(t)}</text>
      ))}
      <path d={d} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts[pts.length - 1].t)} cy={y(pts[pts.length - 1].v)} r="2.5" fill={accent} />
    </svg>
  );
}

function GscPanel({ client }) {
  // null = loading; { error } = failed; otherwise { daily, queries, month }.
  const [gsc, setGsc] = useState(null);
  const linked = Boolean(String(client.gsc_property || "").trim());

  useEffect(() => {
    if (!linked) return;
    let alive = true;
    setGsc(null);
    gscLoad(client.id)
      .then((r) => { if (alive) setGsc(r); })
      .catch((e) => { if (alive) setGsc({ error: e?.message || "Could not load Search Console data." }); });
    return () => { alive = false; };
  }, [client.id, linked]);

  const hint = { fontSize: 12.5, fontWeight: 600, color: GSC_GRAY };
  let body;
  if (!linked) {
    body = <span style={hint}>Set the Search Console property on this client (Edit → “Search Console property”, e.g. <b>sc-domain:example.com</b>) and add the service account as a user in GSC to see organic clicks and impressions here.</span>;
  } else if (gsc === null) {
    body = <span style={hint}>Loading…</span>;
  } else if (gsc.error) {
    body = <span style={{ ...hint, color: GSC_RED }}>{gsc.error}</span>;
  } else {
    const daily = (gsc.daily || []).map(gscDay);
    const w = gscWindows(daily);
    if (!w) {
      body = <span style={hint}>Property linked ({client.gsc_property}). No data yet — it arrives after the nightly Search Console sync.</span>;
    } else {
      const queries = gsc.queries || [];
      const th = { padding: "6px 8px", fontSize: 10.5, fontWeight: 800, color: GSC_GRAY, textTransform: "uppercase", letterSpacing: "0.04em" };
      body = (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <GscStat label="Clicks · last 28 days" value={w.cur.clicks} change={pctChange(w.cur.clicks, w.prev.clicks, w.comparable)} />
            <GscStat label="Impressions · last 28 days" value={w.cur.impressions} change={pctChange(w.cur.impressions, w.prev.impressions, w.comparable)} />
          </div>
          {daily.length >= 2 && (
            <div style={{ border: BDt, borderRadius: 12, background: "#faf8f2", padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Daily clicks — last {daily.length} days</div>
              <div style={{ overflowX: "auto" }}><GscClicksChart daily={daily} /></div>
            </div>
          )}
          {queries.length > 0 && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>Top queries{gsc.month ? ` — ${gsc.month}` : ""}</div>
              <div style={{ border: BDt, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: BDt, background: "#faf8f2" }}>
                      <th style={th}>Query</th>
                      <th style={{ ...th, textAlign: "right" }}>Clicks</th>
                      <th style={{ ...th, textAlign: "right" }}>Impressions</th>
                      <th style={{ ...th, textAlign: "right" }}>Avg position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queries.map((q) => (
                      <tr key={q.query} style={{ borderBottom: "1px solid #f0ece2" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700, wordBreak: "break-word" }}>{q.query}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800 }}>{(Number(q.clicks) || 0).toLocaleString()}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: GSC_GRAY, fontWeight: 700 }}>{(Number(q.impressions) || 0).toLocaleString()}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{q.position == null ? "—" : Number(q.position).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      );
    }
  }

  return (
    <div className="no-print" style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", marginBottom: 12 }}>
        <BarChart3 size={16} /> Organic search (Google Search Console)
      </div>
      {body}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#6b6580", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

// onChanged(...sets) asks the Dashboard to re-fetch: pass the dataset names the
// mutation touched (e.g. "resources") for a narrow refresh, no args for a full one.
export default function ClientDetail({ client, resources, keywords = [], keywordHistory = [], deliverables = [], reports = [], retainers = [], isAdmin, onBack, onEdit, onDeleteClient, onChanged }) {
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [kwForm, setKwForm] = useState(false);
  const [kwEditing, setKwEditing] = useState(null);
  // Client portal share link: null while loading, then { token, enabled }.
  const [portal, setPortal] = useState(null);
  const [copied, setCopied] = useState(false);
  // Monthly report email recipient (loaded flag gates the Save button).
  const [email, setEmail] = useState({ recipient: "", enabled: true, loaded: false, saved: false });
  const fileRef = useRef(null);

  const guard = async (fn) => {
    setErr(""); setBusy(true);
    try { await fn(); }
    catch (e) { setErr(e?.message || "Something went wrong."); }
    setBusy(false);
  };

  // Load the portal link + report email state for this client.
  useEffect(() => {
    let alive = true;
    setPortal(null); setCopied(false);
    setEmail({ recipient: "", enabled: true, loaded: false, saved: false });
    getPortalToken(client.id)
      .then((r) => { if (alive) setPortal(r); })
      .catch((e) => { if (alive) { setPortal({ token: null }); setErr(e?.message || "Could not load the portal link."); } });
    getReportEmail(client.id)
      .then((r) => { if (alive) setEmail({ recipient: r.recipient || "", enabled: r.recipient == null ? true : Boolean(r.enabled), loaded: true, saved: false }); })
      .catch(() => { if (alive) setEmail((x) => ({ ...x, loaded: true })); });
    return () => { alive = false; };
  }, [client.id]);

  const portalUrl = portal?.token ? window.location.origin + portalPath(portal.token) : "";

  const createLink = (regen) => {
    if (regen && !window.confirm("Regenerate the portal link? The old link stops working immediately.")) return;
    guard(async () => {
      const { token } = await createPortalToken(client.id);
      setPortal({ token, enabled: true });
      setCopied(false);
    });
  };
  const togglePortal = () => guard(async () => {
    const enabled = !portal.enabled;
    await setPortalTokenEnabled(client.id, enabled);
    setPortal((p) => ({ ...p, enabled }));
  });
  const copyLink = () => guard(async () => {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  });
  const saveEmail = () => guard(async () => {
    await setReportEmail(client.id, email.recipient, email.enabled);
    setEmail((x) => ({ ...x, recipient: x.recipient.trim(), saved: true }));
  });

  const addLink = () => {
    if (!linkUrl.trim()) { setErr("Paste a link URL first."); return; }
    guard(async () => {
      await addResourceLink(client.id, linkLabel.trim(), linkUrl.trim());
      setLinkLabel(""); setLinkUrl("");
      onChanged("resources");
    });
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setErr("File too large (max 4 MB)."); return; }
    guard(async () => { await uploadResourceFile(client.id, file); onChanged("resources"); });
  };

  const openFile = (r) => guard(async () => {
    const url = await fetchFileObjectUrl(r.blob_key);
    window.open(url, "_blank", "noopener");
  });

  const removeResource = (id) => {
    if (!window.confirm("Remove this resource? Uploaded files are deleted permanently.")) return;
    guard(async () => { await deleteResource(id); onChanged("resources"); });
  };

  const saveKeyword = (k) => guard(async () => {
    await (k.id ? updateKeyword(k) : createKeyword(k));
    setKwForm(false); setKwEditing(null);
    onChanged("keywords", "keyword_history");
  });
  const removeKeyword = (id) => {
    if (!window.confirm("Delete this keyword and its rank history?")) return;
    guard(async () => { await deleteKeyword(id); onChanged("keywords", "keyword_history"); });
  };

  const kstats = keywordSummary(keywords);

  return (
    <>
    <div>
      <button className="no-print" style={{ ...btn("#fff", ink), marginBottom: 18 }} onClick={onBack}>
        <ArrowLeft size={16} /> Back to clients
      </button>
      <div style={pageCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: disp, fontSize: 22, lineHeight: 1.1 }}>{client.name}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 800, border: BDt, background: client.status === "active" ? accent : "#fff", color: client.status === "active" ? "#fff" : ink }}>{STATUS_LABEL[client.status] || client.status}</span>
              {client.source && <span style={{ padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 800, border: BDt, background: tint }}>{client.source}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={iconBtn} title="Edit" onClick={() => onEdit(client)}><Pencil size={16} /></button>
            {isAdmin && <button style={iconBtn} title="Delete client" onClick={() => onDeleteClient(client.id)}><Trash2 size={16} /></button>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, padding: "16px 0", borderTop: "2px solid #f0ece2", borderBottom: "2px solid #f0ece2" }}>
          <Detail label="Niche" value={client.niche} />
          <Detail label="Package" value={client.package} />
          <Detail label="Team member" value={client.team_member} />
          <Detail label="Monthly fee" value={money(client.fee)} />
          <Detail label="Start month" value={client.start_month} />
          <Detail label="Renewal month" value={client.renewal_month} />
          <Detail label="Risk" value={client.risk} />
          <Detail label="Added by" value={client.created_by} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={lbl}>Notes</div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: "#4b4560", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#faf8f2", border: BDt, borderRadius: 10, padding: "12px 14px", minHeight: 44 }}>
            {client.notes ? client.notes : <span style={{ opacity: 0.5 }}>No notes yet. Use Edit to add some.</span>}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", marginBottom: 12 }}>
            <Paperclip size={16} /> Resources & files
          </div>

          {err && <div style={{ background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}

          {/* add link */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input style={{ ...input, flex: 1, minWidth: 120 }} placeholder="Label (e.g. Keyword sheet)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
            <input style={{ ...input, flex: 2, minWidth: 160 }} placeholder="Paste a link (Drive, Canva, Sheets…)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <button style={btn(accent, "#fff")} disabled={busy} onClick={addLink}><Link2 size={15} /> Add link</button>
          </div>

          {/* upload file */}
          <div style={{ marginBottom: 16 }}>
            <input ref={fileRef} type="file" style={{ display: "none" }} onChange={onPickFile} />
            <button style={btn("#fff", ink)} disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> {busy ? "Working…" : "Upload file"}
            </button>
            <span style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 600, marginLeft: 10 }}>Max 4 MB per file.</span>
          </div>

          {/* list */}
          {resources.length === 0 ? (
            <Empty>No resources yet. Add a link or upload a file above.</Empty>
          ) : (
            <div style={{ border: BDt, borderRadius: 10, overflow: "hidden" }}>
              {resources.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: "1px solid #f0ece2" }}>
                  <span style={{ display: "flex", color: accent }}>{r.kind === "file" ? <FileText size={17} /> : <Link2 size={17} />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label || r.filename || r.url}</div>
                    <div style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.kind === "file" ? `${r.filename || "file"} · ${fmtSize(r.size)}` : r.url}
                    </div>
                  </div>
                  {r.kind === "file"
                    ? <button style={iconBtn} title="Open file" disabled={busy} onClick={() => openFile(r)}><ExternalLink size={15} /></button>
                    : <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...iconBtn, textDecoration: "none" }} title="Open link"><ExternalLink size={15} /></a>}
                  <button style={iconBtn} title="Remove" disabled={busy} onClick={() => removeResource(r.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", marginBottom: 12 }}>
            <Share2 size={16} /> Client portal
          </div>
          <div style={{ border: BDt, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            {portal === null ? (
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#6b6580" }}>Loading…</span>
            ) : !portal.token ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, fontWeight: 600, color: "#6b6580" }}>
                  No share link yet. Create one to give this client a read-only view of their rankings, deliverables and monthly report — no fees or internal notes.
                </span>
                <button style={btn(accent, "#fff")} disabled={busy} onClick={() => createLink(false)}><Plus size={15} /> Create link</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 7, border: BDt, background: portal.enabled ? "#d7f5df" : "#f7dede", color: portal.enabled ? "#1f9d57" : "#c0392b" }}>
                    {portal.enabled ? "Link active" : "Link disabled"}
                  </span>
                  <span style={{ flex: 1, minWidth: 160, fontSize: 12, fontWeight: 600, color: "#6b6580", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} title={portalUrl}>
                    {portalUrl}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={btn("#fff", ink)} disabled={busy} onClick={copyLink}><Copy size={15} /> {copied ? "Copied!" : "Copy link"}</button>
                  <button style={btn("#fff", ink)} disabled={busy} onClick={() => createLink(true)}><RefreshCw size={15} /> Regenerate</button>
                  <button style={btn(portal.enabled ? "#fff" : accent, portal.enabled ? ink : "#fff")} disabled={busy} onClick={togglePortal}>
                    {portal.enabled ? "Disable link" : "Enable link"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", marginBottom: 12 }}>
            <Mail size={16} /> Monthly report email
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...input, flex: 2, minWidth: 180 }} type="email" placeholder="client@example.com"
              value={email.recipient} onChange={(e) => setEmail((x) => ({ ...x, recipient: e.target.value, saved: false }))} />
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              <input type="checkbox" checked={email.enabled} onChange={(e) => setEmail((x) => ({ ...x, enabled: e.target.checked, saved: false }))} style={{ width: 16, height: 16, accentColor: accent }} />
              Enabled
            </label>
            <button style={btn(accent, "#fff")} disabled={busy || !email.loaded} onClick={saveEmail}>{email.saved ? "Saved" : "Save"}</button>
          </div>
          <p style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 600, marginTop: 8 }}>
            Gets an automatic SEO report on the 1st of each month (needs RESEND_API_KEY). Clear the address and untick Enabled to remove it.
          </p>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", flex: 1 }}>
              <Search size={16} /> Keyword ranks
            </div>
            {keywords.length > 0 && (
              <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>
                avg {kstats.avg == null ? "—" : `#${kstats.avg}`} · {kstats.top10} in top 10
              </span>
            )}
            <button style={btn(accent, "#fff")} disabled={busy} onClick={() => { setKwEditing(null); setKwForm(true); }}><Plus size={15} /> Add keyword</button>
          </div>
          <div style={{ border: BDt, borderRadius: 10, overflow: "hidden" }}>
            <KeywordRows keywords={keywords} history={keywordHistory} onEdit={(k) => { setKwEditing(k); setKwForm(true); }} onDelete={removeKeyword} />
          </div>
        </div>

        <GscPanel client={client} />

        <ClientScope client={client} retainers={retainers} deliverables={deliverables} onChanged={onChanged} />

        <ClientReport client={client} keywords={keywords} deliverables={deliverables} reports={reports} retainers={retainers} onChanged={onChanged} />

        <button className="no-print" style={{ ...btn(accent, "#fff"), width: "100%", marginTop: 22, justifyContent: "center" }} onClick={() => onEdit(client)}>
          <Pencil size={15} /> Edit client details
        </button>
      </div>
    </div>

    {kwForm && (
      <KeywordForm
        clients={[client]}
        initial={kwEditing}
        preClient={client.id}
        onClose={() => { setKwForm(false); setKwEditing(null); }}
        onSave={saveKeyword}
      />
    )}
    </>
  );
}

import React, { useRef, useState } from "react";
import { ArrowLeft, Pencil, Trash2, Paperclip, Link2, FileText, Upload, ExternalLink, Search, Plus } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, SH, SHs, btn, iconBtn, input, lbl } from "../lib/theme";
import { STATUS_LABEL } from "../lib/constants";
import { money } from "../lib/format";
import {
  addResourceLink, uploadResourceFile, deleteResource, fetchFileObjectUrl, MAX_FILE_BYTES,
  createKeyword, updateKeyword, deleteKeyword,
} from "../lib/api";
import { useToast } from "../lib/toast";
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

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#6b6580", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

export default function ClientDetail({ client, resources, keywords = [], keywordHistory = [], deliverables = [], reports = [], retainers = [], isAdmin, onBack, onEdit, onDeleteClient, onChanged }) {
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [kwForm, setKwForm] = useState(false);
  const [kwEditing, setKwEditing] = useState(null);
  const fileRef = useRef(null);
  const toast = useToast();

  const guard = async (fn, okMsg) => {
    setErr(""); setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) { setErr(e?.message || "Something went wrong."); toast(e?.message || "Something went wrong.", "error"); }
    setBusy(false);
  };

  const addLink = () => {
    if (!linkUrl.trim()) { setErr("Paste a link URL first."); return; }
    guard(async () => {
      await addResourceLink(client.id, linkLabel.trim(), linkUrl.trim());
      setLinkLabel(""); setLinkUrl("");
      onChanged();
    }, "Link added");
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setErr("File too large (max 4 MB)."); return; }
    guard(async () => { await uploadResourceFile(client.id, file); onChanged(); }, "File uploaded");
  };

  const openFile = (r) => guard(async () => {
    const url = await fetchFileObjectUrl(r.blob_key);
    window.open(url, "_blank", "noopener");
  });

  const removeResource = (id) => guard(async () => { await deleteResource(id); onChanged(); }, "Resource removed");

  // Throwing save: the shared KeywordForm manages busy/close/toast itself.
  const saveKeyword = async (k) => {
    await (k.id ? updateKeyword(k) : createKeyword(k));
    await onChanged();
  };
  const removeKeyword = (id) => guard(async () => { await deleteKeyword(id); onChanged(); }, "Keyword deleted");

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
            <h1 style={{ fontFamily: disp, fontSize: 22, lineHeight: 1.1 }}>{client.name}</h1>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 800, border: BDt, background: client.status === "active" ? accent : "#fff", color: client.status === "active" ? "#fff" : ink }}>{STATUS_LABEL[client.status] || client.status}</span>
              {client.source && <span style={{ padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 800, border: BDt, background: tint }}>{client.source}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={iconBtn} title="Edit" aria-label="Edit client" onClick={() => onEdit(client)}><Pencil size={16} /></button>
            {isAdmin && <button style={iconBtn} title="Delete client" aria-label="Delete client" onClick={() => onDeleteClient(client.id)}><Trash2 size={16} /></button>}
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
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", marginBottom: 12 }}>
            <Paperclip size={16} /> Resources & files
          </h2>

          {err && <div style={{ background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}

          {/* add link */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input style={{ ...input, flex: 1, minWidth: 120 }} placeholder="Label (e.g. Keyword sheet)" aria-label="Resource label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
            <input style={{ ...input, flex: 2, minWidth: 160 }} placeholder="Paste a link (Drive, Canva, Sheets…)" aria-label="Resource link URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
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
                    ? <button style={iconBtn} title="Open file" aria-label={`Open file ${r.filename || r.label || ""}`} disabled={busy} onClick={() => openFile(r)}><ExternalLink size={15} /></button>
                    : <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...iconBtn, textDecoration: "none" }} title="Open link" aria-label={`Open link ${r.label || r.url}`}><ExternalLink size={15} /></a>}
                  <button style={iconBtn} title="Remove" aria-label="Remove resource" disabled={busy} onClick={() => removeResource(r.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", flex: 1 }}>
              <Search size={16} /> Keyword ranks
            </h2>
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

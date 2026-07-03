import React, { useMemo, useState } from "react";
import { Plus, Loader, Mic, Sparkles } from "lucide-react";
import { ink, accent, tint, BD, SH, sel, btn } from "../lib/theme";
import { TASK_TYPES, TASK_STATES } from "../lib/constants";
import { parseQuickTask } from "../lib/quickparse";
import { useSpeech } from "../lib/speech";
import { useToast } from "../lib/toast";
import { assigneeOptions } from "./ui";

/* ---------------- Todoist-style quick add ----------------
   One line of natural language ("Guest post on site.com for Ridgeline due fri
   @zach !doing") is parsed live into the fields below, which stay editable so
   any mis-parse is a one-click fix. A mic button dictates into the same box. */
export default function QuickAddTask({ clients = [], members = [], onAdd, inputRef }) {
  const [raw, setRaw] = useState("");
  const [override, setOverride] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const parsed = useMemo(() => parseQuickTask(raw, { clients, members }), [raw, clients, members]);

  // Manual edits win over the parse; `??` keeps an explicit "" (e.g. Unassigned).
  const pick = (k, fallback) => (override[k] !== undefined ? override[k] : (parsed[k] || fallback));
  const eff = {
    client_id: pick("client_id", ""),
    type: pick("type", "guest"),
    assignee: pick("assignee", ""),
    due: pick("due", ""),
    status: pick("status", "todo"),
  };
  const setField = (k, v) => setOverride((o) => ({ ...o, [k]: v }));

  const speech = useSpeech({
    onText: (t, final) => { if (final) setRaw((r) => (r ? r.trim() + " " : "") + t); },
  });

  const reset = () => { setRaw(""); setOverride({}); };

  const add = async () => {
    if (busy) return;
    const title = parsed.title.trim();
    // Client is optional — a task can be a plain to-do. Only a title is required.
    if (!title) { toast("Type what the task is.", "error"); return; }
    setBusy(true);
    try {
      await onAdd({ client_id: eff.client_id || null, title, type: eff.type, assignee: eff.assignee, status: eff.status, due: eff.due || null });
      toast("Task added");
      reset();
    } catch (e) {
      toast(e?.message || "Could not add task.", "error");
    } finally {
      setBusy(false);
    }
  };

  const chip = { fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 7, border: "2px solid " + ink, background: tint, color: ink };

  return (
    <div style={{ background: "#fff", border: BD, borderRadius: 14, padding: 14, boxShadow: SH, marginBottom: 12 }}>
      {/* text line + mic + add */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Sparkles size={16} style={{ color: accent, flexShrink: 0 }} aria-hidden="true" />
        <input
          ref={inputRef}
          style={{ flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: 9, border: "2.5px solid " + ink, fontSize: 14, fontWeight: 600, color: ink, fontFamily: "inherit" }}
          placeholder={'Add a task — e.g. "Guest post on hvacblog.com for Ridgeline due friday @zach"'}
          aria-label="Quick add task"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        {speech.supported && (
          <button
            type="button"
            onClick={speech.toggle}
            title={speech.listening ? "Stop dictation" : "Dictate the task"}
            aria-label={speech.listening ? "Stop dictation" : "Dictate the task"}
            aria-pressed={speech.listening}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, flexShrink: 0, borderRadius: 9, border: "2.5px solid " + ink, cursor: "pointer", color: speech.listening ? "#fff" : ink, background: speech.listening ? "#c0392b" : "#fff", ...(speech.listening ? { animation: "pulse 1s ease-in-out infinite" } : null) }}
          >
            <Mic size={17} />
          </button>
        )}
        <button style={{ ...btn(accent, "#fff"), opacity: busy ? 0.7 : 1, flexShrink: 0 }} onClick={add} disabled={busy}>
          {busy ? <Loader size={16} className="spin" /> : <Plus size={16} />} Add
        </button>
      </div>

      {/* live-parsed, editable fields (correct anything the parser got wrong) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        <select
          style={{ ...sel, flex: "none", minWidth: 150 }}
          value={eff.client_id}
          onChange={(e) => setField("client_id", e.target.value)}
          aria-label="Client (optional)"
        >
          <option value="">No client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 120 }} value={eff.type} onChange={(e) => setField("type", e.target.value)} aria-label="Task type">
          {TASK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select style={{ ...sel, flex: "none", minWidth: 130 }} value={eff.assignee} onChange={(e) => setField("assignee", e.target.value)} aria-label="Assignee">
          {assigneeOptions(members, eff.assignee).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="date" style={{ ...sel, flex: "none", minWidth: 140 }} value={eff.due} onChange={(e) => setField("due", e.target.value)} aria-label="Due date" />
        <select style={{ ...sel, flex: "none", minWidth: 120 }} value={eff.status} onChange={(e) => setField("status", e.target.value)} aria-label="Status">
          {TASK_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {parsed.title.trim() && <span style={chip} title="Task title">{parsed.title.trim()}</span>}
      </div>

      <div style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 600, marginTop: 9 }}>
        Type naturally. Shortcuts: <b>for</b> client · <b>@</b>assignee · <b>due</b> date (tomorrow, fri, 10 jul) · <b>!</b>status
        {speech.supported ? <> · <Mic size={11} style={{ verticalAlign: "-1px" }} /> to speak</> : null}
        {speech.error ? <span style={{ color: "#c0392b" }}> · {speech.error}</span> : null}
      </div>
    </div>
  );
}

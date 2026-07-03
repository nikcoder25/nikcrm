import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Plus, Loader } from "lucide-react";
import { ink, accent, tint, BDt, btn, input as inputStyle } from "../lib/theme";
import { TASK_TYPES } from "../lib/constants";
import { parseTaskPrompt } from "../lib/promptTask";
import { useToast } from "../lib/toast";
import { Modal, Field, Pick, Row, assigneeOptions } from "./ui";

const hint = { fontSize: 12.5, color: "#6b6580", fontWeight: 600, lineHeight: 1.5, margin: "2px 0 12px" };

/* ---------------- prompt / voice task composer ----------------
   Free-form entry for the Task Board: type (or dictate via the Web Speech
   API) a sentence like "Guest post on hvacblog.com for Acme Plumbing, assign
   to Sara, due Friday" and the fields below fill themselves in via
   parseTaskPrompt. Every parsed field stays editable, so the prompt only has
   to get it roughly right. */
export default function PromptTask({ clients, members, onAdd, onClose }) {
  const [prompt, setPrompt] = useState("");
  const [interim, setInterim] = useState("");   // live (not yet final) speech transcript
  const [listening, setListening] = useState(false);
  const [speechErr, setSpeechErr] = useState("");
  const [overrides, setOverrides] = useState({}); // manual edits beat the parser
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const recRef = useRef(null);
  const toast = useToast();

  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const parsed = useMemo(() => parseTaskPrompt(prompt, { clients, members }), [prompt, clients, members]);
  const task = { ...parsed, ...overrides };
  const set = (k) => (v) => setOverrides((o) => ({ ...o, [k]: v }));

  const stopMic = () => { try { recRef.current?.abort(); } catch { /* already stopped */ } };
  useEffect(() => stopMic, []);
  const close = () => { stopMic(); onClose(); };

  const toggleMic = () => {
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } setListening(false); return; }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "", live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else live += t;
      }
      setInterim(live.trim());
      if (fin.trim()) setPrompt((p) => (p.trim() ? p.trim() + " " : "") + fin.trim());
    };
    rec.onerror = (e) => {
      setSpeechErr(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access was blocked — allow it in your browser and try again."
        : "Voice input stopped unexpectedly. You can keep typing.");
    };
    rec.onend = () => { setListening(false); setInterim(""); };
    recRef.current = rec;
    setSpeechErr("");
    try { rec.start(); setListening(true); } catch { setSpeechErr("Could not start voice input."); }
  };

  const add = async () => {
    if (busy) return;
    const errs = {};
    if (!task.client_id) errs.client_id = "Pick a client";
    if (!String(task.title || "").trim()) errs.title = "Add a task title";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onAdd({ client_id: task.client_id, title: task.title.trim(), type: task.type, assignee: task.assignee, status: "todo", due: task.due || null });
      toast("Task added");
      close();
    } catch (e) {
      toast(e?.message || "Could not add task.", "error");
      setBusy(false);
    }
  };

  return (
    <Modal title="Add task from a prompt" onClose={close} maxWidth={560}>
      <p style={hint}>
        Describe the task in plain words{SR ? " — or tap the mic and say it" : ""}. Client, type, assignee and due
        date are picked out automatically, and you can adjust anything below before adding.
        <br />e.g. <em>“Guest post on hvacblog.com for Acme Plumbing, assign to Sara, due Friday”</em>
      </p>

      <div style={{ position: "relative" }}>
        <textarea
          rows={3}
          style={{ ...inputStyle, resize: "vertical", minHeight: 84, paddingRight: SR ? 52 : 12 }}
          placeholder={SR ? "Type or dictate the task…" : "Type the task…"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add(); }}
          aria-label="Task prompt"
        />
        {SR && (
          <button type="button" onClick={toggleMic} aria-pressed={listening}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            title={listening ? "Stop voice input" : "Dictate with your voice"}
            className={listening ? "pulse" : undefined}
            style={{ position: "absolute", top: 9, right: 9, border: BDt, borderRadius: 8, padding: 7, cursor: "pointer", display: "flex", background: listening ? "#c0392b" : tint, color: listening ? "#fff" : ink }}>
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
      </div>
      {listening && (
        <div style={{ ...hint, margin: "8px 0 0", color: "#c0392b" }} role="status">
          Listening… tap the mic to stop.{interim && <em style={{ color: "#6b6580" }}> {interim}</em>}
        </div>
      )}
      {speechErr && <div style={{ ...hint, margin: "8px 0 0", color: "#c0392b" }} role="alert">{speechErr}</div>}

      <Row>
        <Pick label="Client" required value={task.client_id} set={set("client_id")} error={errors.client_id}
          opts={[["", "Select client…"], ...clients.map((c) => [c.id, c.name])]} />
        <Pick label="Type" value={task.type} set={set("type")} opts={TASK_TYPES.map((t) => [t.key, t.label])} />
      </Row>
      <Field label="Task title" required value={task.title} onChange={set("title")}
        placeholder="Task title" error={errors.title} />
      <Row>
        <Pick label="Assignee" value={task.assignee} set={set("assignee")} opts={assigneeOptions(members, task.assignee)} />
        <Field label="Due date" type="date" value={task.due} onChange={set("due")} />
      </Row>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button style={btn("#fff", ink)} onClick={close}>Cancel</button>
        <button style={{ ...btn(accent, "#fff"), opacity: busy ? 0.7 : 1 }} onClick={add} disabled={busy}>
          {busy ? <Loader size={16} className="spin" /> : <Plus size={16} />} Add task
        </button>
      </div>
    </Modal>
  );
}

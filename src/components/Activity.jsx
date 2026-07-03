import React, { useState, useEffect } from "react";
import { StickyNote, Phone, Mail, Users, Trash2, Send, Clock, CalendarClock, Check, CalendarPlus, RefreshCw, CalendarCheck } from "lucide-react";
import { ink, accent, tint, disp, BD, BDt, btn, input, iconBtn, sel } from "../lib/theme";
import { ACTIVITY_TYPES, activityLabel } from "../lib/constants";
import { dateTimeLabel, localDateTimeInput, dateLabel, isPastDue } from "../lib/format";
import { addActivity, deleteActivity, setActivityFollowup } from "../lib/api";
import { activitiesIcs, icsEventCount, downloadIcs } from "../lib/ics";
import { pushToCalendar, syncGmail, googleAccounts } from "../lib/google";
import { useToast } from "../lib/toast";
import { Empty } from "./ui";

// Resolve an activity type's lucide icon from its constant `icon` name.
const ICONS = { StickyNote, Phone, Mail, Users };
export const activityIcon = (type) => {
  const t = ACTIVITY_TYPES.find((x) => x.key === type);
  return ICONS[t?.icon] || StickyNote;
};

// Per-client interaction timeline: log notes / calls / emails / meetings and
// see them in reverse-chronological order. `activities` arrives already
// filtered + sorted (happened_at desc) by the parent. Mutations ask the
// Dashboard for a narrow refresh of just the touched datasets (the touchpoint
// rows plus the audit trail written server-side).
export default function Activity({ client, activities = [], author = "", googleConnected = false, onChanged }) {
  const [type, setType] = useState("note");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("");        // datetime-local; blank = now
  const [showWhen, setShowWhen] = useState(false);
  const [followUp, setFollowUp] = useState(""); // YYYY-MM-DD; blank = no reminder
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Connected Google accounts + which one new calendar events go to.
  const [calAccounts, setCalAccounts] = useState([]);
  const [calAccount, setCalAccount] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!googleConnected) { setCalAccounts([]); return; }
    let alive = true;
    googleAccounts()
      .then((r) => { if (!alive) return; const a = r.accounts || []; setCalAccounts(a); setCalAccount((cur) => cur || a[0]?.account_email || ""); })
      .catch(() => { if (alive) setCalAccounts([]); });
    return () => { alive = false; };
  }, [googleConnected]);

  const log = () => {
    if (!body.trim()) { setErr("Write something to log."); return; }
    setErr(""); setBusy(true);
    (async () => {
      try {
        await addActivity({
          client_id: client.id,
          type,
          body: body.trim(),
          author,
          happened_at: when ? new Date(when).toISOString() : undefined,
          follow_up_date: followUp || undefined,
        });
        setBody(""); setWhen(""); setShowWhen(false); setType("note"); setFollowUp("");
        await onChanged("activities", "activity");
        toast("Activity logged");
      } catch (e) {
        setErr(e?.message || "Something went wrong.");
        toast(e?.message || "Something went wrong.", "error");
      }
      setBusy(false);
    })();
  };

  const remove = (id) => {
    setBusy(true);
    (async () => {
      try { await deleteActivity(id); await onChanged("activities", "activity"); toast("Activity removed"); }
      catch (e) { toast(e?.message || "Something went wrong.", "error"); }
      setBusy(false);
    })();
  };

  const clearFollowup = (id) => {
    setBusy(true);
    (async () => {
      try { await setActivityFollowup(id, null); await onChanged("activities", "activity"); toast("Follow-up cleared"); }
      catch (e) { toast(e?.message || "Something went wrong.", "error"); }
      setBusy(false);
    })();
  };

  // Push a single follow-up / meeting to the connected Google Calendar.
  const pushCalendar = (id) => {
    setBusy(true);
    (async () => {
      try { await pushToCalendar(id, calAccount); await onChanged(); toast(calAccount ? `Added to ${calAccount}'s calendar` : "Added to Google Calendar"); }
      catch (e) { toast(e?.message || "Could not add to calendar.", "error"); }
      setBusy(false);
    })();
  };

  // Import recent Gmail messages with this client into the timeline.
  const gmailSync = () => {
    setBusy(true);
    (async () => {
      try { const r = await syncGmail(client.id); await onChanged(); toast(r.imported ? `Imported ${r.imported} email${r.imported > 1 ? "s" : ""}` : "No new emails found"); }
      catch (e) { toast(e?.message || "Gmail sync failed.", "error"); }
      setBusy(false);
    })();
  };

  const canCalendar = (a) => Boolean(a.follow_up_date) || (a.type === "meeting" && a.happened_at);

  return (
    <div className="no-print">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: disp, fontSize: 15, textTransform: "uppercase", flex: 1 }}>
          <Clock size={16} /> Activity
          {activities.length > 0 && (
            <span style={{ fontSize: 11.5, fontWeight: 800, background: tint, border: BDt, borderRadius: 7, padding: "4px 11px" }}>{activities.length}</span>
          )}
        </h2>
        {googleConnected && calAccounts.length > 1 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title="Which Google account's calendar new events are added to">
            <CalendarPlus size={14} style={{ color: "#6b6580" }} />
            <select aria-label="Calendar account" value={calAccount} onChange={(e) => setCalAccount(e.target.value)}
              style={{ ...sel, flex: "none", minWidth: 0, maxWidth: 220, padding: "7px 10px", fontSize: 12, fontWeight: 800 }}>
              {calAccounts.map((a) => <option key={a.account_email} value={a.account_email}>{a.account_email}</option>)}
            </select>
          </span>
        )}
        {googleConnected && client.email && (
          <button style={{ ...btn("#fff", ink), padding: "8px 12px", fontSize: 12.5 }} disabled={busy}
            title={`Import recent Gmail with ${client.email}`} onClick={gmailSync}>
            <RefreshCw size={15} /> Sync Gmail
          </button>
        )}
        {icsEventCount(activities) > 0 && (
          <button style={{ ...btn("#fff", ink), padding: "8px 12px", fontSize: 12.5 }}
            title="Download follow-ups & meetings as a calendar file"
            onClick={() => downloadIcs(`${(client.name || "client").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-calendar.ics`, activitiesIcs(activities, new Map([[client.id, client.name]])))}>
            <CalendarPlus size={15} /> Export .ics
          </button>
        )}
      </div>

      {err && <div style={{ background: tint, border: BDt, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}

      {/* compose */}
      <div style={{ border: BDt, borderRadius: 12, padding: 12, marginBottom: 16, background: "#faf8f2" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {ACTIVITY_TYPES.map((t) => {
            const I = ICONS[t.icon] || StickyNote, on = type === t.key;
            return (
              <button key={t.key} type="button" onClick={() => setType(t.key)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: BDt, background: on ? accent : "#fff", color: on ? "#fff" : ink, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                <I size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <textarea
          style={{ ...input, minHeight: 64, resize: "vertical" }}
          placeholder={`Log a ${activityLabel(type).toLowerCase()}… what happened, what's next?`}
          aria-label="Activity note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") log(); }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          {showWhen ? (
            <input type="datetime-local" style={{ ...input, flex: "0 0 auto", width: "auto" }} aria-label="When did this happen"
              value={when || localDateTimeInput()} onChange={(e) => setWhen(e.target.value)} />
          ) : (
            <button type="button" onClick={() => { setShowWhen(true); setWhen(localDateTimeInput()); }}
              style={{ ...iconBtn, gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800, padding: "8px 11px" }}>
              <Clock size={14} /> Backdate
            </button>
          )}
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800, color: followUp ? accent : "#6b6580" }}>
            <CalendarClock size={14} /> Follow-up
            <input type="date" style={{ ...input, flex: "0 0 auto", width: "auto", padding: "8px 10px" }} aria-label="Follow-up reminder date"
              value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </label>
          <button style={{ ...btn(accent, "#fff"), marginLeft: "auto" }} disabled={busy} onClick={log}>
            <Send size={15} /> {busy ? "Saving…" : "Log activity"}
          </button>
        </div>
      </div>

      {/* timeline */}
      {activities.length === 0 ? (
        <Empty>No activity logged yet. Record your first call, email, or note above.</Empty>
      ) : (
        <div style={{ position: "relative", paddingLeft: 6 }}>
          {activities.map((a) => {
            const I = activityIcon(a.type);
            return (
              <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #f0ece2" }}>
                <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: tint, border: BDt, display: "flex", alignItems: "center", justifyContent: "center", color: accent }}>
                  <I size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: accent }}>{activityLabel(a.type)}</span>
                    <span style={{ fontSize: 11.5, color: "#6b6580", fontWeight: 600 }}>
                      {a.author ? `${a.author} · ` : ""}{dateTimeLabel(a.happened_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#332f45", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 3 }}>{a.body}</div>
                  {a.follow_up_date && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 7, padding: "3px 9px", borderRadius: 7, border: BDt, fontSize: 11.5, fontWeight: 800, background: isPastDue(a.follow_up_date) ? "#f7dede" : tint, color: isPastDue(a.follow_up_date) ? "#c0392b" : ink }}>
                      <CalendarClock size={13} />
                      Follow up {dateLabel(a.follow_up_date)}{isPastDue(a.follow_up_date) ? " · overdue" : ""}
                      <button title="Mark follow-up done" aria-label="Mark follow-up done" disabled={busy} onClick={() => clearFollowup(a.id)}
                        style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, marginLeft: 2 }}><Check size={14} /></button>
                    </div>
                  )}
                </div>
                {googleConnected && canCalendar(a) && (
                  a.google_event_id
                    ? <span title="On Google Calendar" aria-label="On Google Calendar" style={{ ...iconBtn, color: "#1f7a4d", cursor: "default" }}><CalendarCheck size={14} /></span>
                    : <button style={iconBtn} title="Add to Google Calendar" aria-label="Add to Google Calendar" disabled={busy} onClick={() => pushCalendar(a.id)}><CalendarPlus size={14} /></button>
                )}
                <button style={iconBtn} title="Remove" aria-label="Remove activity" disabled={busy} onClick={() => remove(a.id)}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

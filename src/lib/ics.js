// Client-side iCalendar (.ics) export. Turns activity follow-ups and logged
// meetings into standard calendar events that import into Google / Apple /
// Outlook Calendar — a one-way, auth-free "add these to my calendar". Runs
// entirely in the browser on already-loaded data.
import { activityLabel } from "./constants";

// Escape a text value per RFC 5545 (backslash, comma, semicolon, newlines).
const esc = (v) => String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

// 'YYYY-MM-DD' → 'YYYYMMDD' for an all-day DATE value.
const dateOnly = (s) => String(s).slice(0, 10).replace(/-/g, "");
// A Date → UTC 'YYYYMMDDTHHMMSSZ' for a timestamp value.
const utcStamp = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

// Fold lines to the 75-octet limit (simple char-based fold; fine for our ASCII-ish content).
const fold = (line) => {
  if (line.length <= 75) return line;
  const parts = [];
  let s = line;
  parts.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length) { parts.push(" " + s.slice(0, 74)); s = s.slice(74); }
  return parts.join("\r\n");
};

function vevent({ uid, stampIso, start, allDay, summary, description }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date(stampIso))}`,
    allDay ? `DTSTART;VALUE=DATE:${dateOnly(start)}` : `DTSTART:${utcStamp(new Date(start))}`,
    `SUMMARY:${esc(summary)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
  ].filter(Boolean);
  lines.push("END:VEVENT");
  return lines.map(fold).join("\r\n");
}

// Build a VCALENDAR from activities. Each open follow-up becomes an all-day
// reminder event; each logged meeting becomes a timed event. `nameById` maps
// client_id → client name for the summary. `stampIso` pins DTSTAMP (pass a
// fixed value for reproducible output).
export function activitiesIcs(activities, nameById, stampIso = new Date().toISOString()) {
  const events = [];
  for (const a of activities) {
    const who = nameById.get(a.client_id) || "Client";
    if (a.follow_up_date) {
      events.push(vevent({
        uid: `followup-${a.id}@growth-atlas`, stampIso, start: a.follow_up_date, allDay: true,
        summary: `Follow up: ${who}`, description: `${activityLabel(a.type)} — ${a.body || ""}`.trim(),
      }));
    }
    if (a.type === "meeting" && a.happened_at) {
      events.push(vevent({
        uid: `meeting-${a.id}@growth-atlas`, stampIso, start: a.happened_at, allDay: false,
        summary: `Meeting: ${who}`, description: a.body || "",
      }));
    }
  }
  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Growth Atlas//SEO Ops//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ];
  return cal.join("\r\n");
}

// How many events an export would contain (drives the button's enabled state).
export const icsEventCount = (activities) =>
  activities.reduce((n, a) => n + (a.follow_up_date ? 1 : 0) + (a.type === "meeting" && a.happened_at ? 1 : 0), 0);

export function downloadIcs(filename, ics) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

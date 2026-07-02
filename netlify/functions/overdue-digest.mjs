/* global process, console */

// Scheduled daily (07:00 UTC): one internal digest email of everything that
// slipped — deliverables past due and not delivered, tasks past due and not
// done, and payments flagged overdue. Sends nothing when all is clear.
// Recipient(s) come from DIGEST_EMAIL (comma-separated allowed); every
// configuration gap is a logged no-op so the scheduled run stays green.

import { sendEmail, emailConfigured } from "./lib/email.mjs";
import { escapeHtml, htmlTable, section, layout, isoDate, fmtDate } from "./lib/html.mjs";

const TAG = "overdue-digest";

// Whole days between an ISO date and today (never negative).
function daysPast(iso, todayIso) {
  const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.max(0, Math.round((utc(todayIso) - utc(iso)) / 86400000));
}

// Payments carry a month ('YYYY-MM'), not a date — treat them as due on the
// last day of that month for display and days-overdue math.
function monthEnd(month) {
  const [y, m] = String(month).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const money = (n) => "$" + (Number(n) || 0).toLocaleString();

// One digest row: [client, item, due date, days overdue] — all escaped.
function row(client, item, dueIso, todayIso) {
  const days = daysPast(dueIso, todayIso);
  return [
    escapeHtml(client),
    escapeHtml(item),
    fmtDate(dueIso),
    `<strong style="color:#b91c1c;">${days} day${days === 1 ? "" : "s"}</strong>`,
  ];
}

export default async () => {
  if (!process.env.NETLIFY_DATABASE_URL) {
    console.log(`${TAG}: NETLIFY_DATABASE_URL not set — skipping run.`);
    return;
  }
  if (!emailConfigured()) {
    console.log(`${TAG}: RESEND_API_KEY not set — skipping run.`);
    return;
  }
  const recipients = (process.env.DIGEST_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) {
    console.log(`${TAG}: DIGEST_EMAIL not set — skipping run.`);
    return;
  }

  // Import the DB client only after the config checks so an unconfigured site
  // never touches (or crashes in) the driver.
  const { neon } = await import("@netlify/neon");
  const sql = neon();
  const today = new Date().toISOString().slice(0, 10); // UTC calendar date

  // "Past due" = due date strictly before today. Tasks can be unassigned to a
  // client, hence the left join there.
  let deliverables, tasks, payments;
  try {
    [deliverables, tasks, payments] = await Promise.all([
      sql`select d.title, d.type, d.due_date, c.name as client
          from deliverables d join clients c on c.id = d.client_id
          where d.due_date is not null and d.due_date < ${today} and d.status <> 'delivered'
          order by d.due_date, c.name`,
      sql`select t.title, t.due, coalesce(c.name, '—') as client
          from tasks t left join clients c on c.id = t.client_id
          where t.due is not null and t.due < ${today} and t.status <> 'done'
          order by t.due, client`,
      sql`select p.month, p.amount, c.name as client
          from payments p join clients c on c.id = p.client_id
          where p.status = 'overdue'
          order by p.month, c.name`,
    ]);
  } catch (e) {
    // e.g. brand-new database where the app hasn't created its tables yet.
    console.error(`${TAG}: database not ready — skipping run. (${e?.message || e})`);
    return;
  }

  const total = deliverables.length + tasks.length + payments.length;
  if (!total) {
    console.log(`${TAG}: all clear — nothing overdue.`);
    return;
  }

  const cols = ["Client", "Item", "Due", "Overdue by"];
  const parts = [`<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Daily digest for ${fmtDate(today)}</p>`];
  if (deliverables.length) {
    parts.push(section(`Overdue deliverables (${deliverables.length})`, htmlTable(cols,
      deliverables.map((d) => row(d.client, d.title || d.type, isoDate(d.due_date), today)))));
  }
  if (tasks.length) {
    parts.push(section(`Overdue tasks (${tasks.length})`, htmlTable(cols,
      tasks.map((t) => row(t.client, t.title, isoDate(t.due), today)))));
  }
  if (payments.length) {
    parts.push(section(`Overdue payments (${payments.length})`, htmlTable(cols,
      payments.map((p) => row(p.client, `Payment for ${p.month} — ${money(p.amount)}`, monthEnd(p.month), today)))));
  }

  try {
    await sendEmail({
      to: recipients,
      subject: `Growth Atlas — ${total} item${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} attention`,
      html: layout("Needs attention", parts.join("")),
    });
    console.log(`${TAG}: sent digest to ${recipients.length} recipient(s) — ${deliverables.length} deliverables, ${tasks.length} tasks, ${payments.length} payments.`);
  } catch (e) {
    console.error(`${TAG}: send failed: ${e?.message || e}`);
  }
};

// 07:00 UTC every day.
export const config = { schedule: "0 7 * * *" };

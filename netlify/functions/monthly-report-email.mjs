/* global process, console */

// Scheduled monthly (08:00 UTC on the 1st): emails each opted-in client
// contact an SEO report for the month that just ended — keyword movement,
// deliverables due that month, and the saved narrative from client_reports.
//
// Recipients live in client_report_emails (one optional address per client;
// the management UI ships separately). Every configuration gap is a logged
// no-op so the scheduled run stays green on an unconfigured site.

import { sendEmail, emailConfigured } from "./lib/email.mjs";
import { escapeHtml, htmlTable, section, layout, fmtDate } from "./lib/html.mjs";

const TAG = "monthly-report-email";

// The just-ended month as 'YYYY-MM', UTC (run on Jul 1 → '2026-06').
function previousPeriod(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 'YYYY-MM' -> "June 2026" for subjects and headings.
function periodLabel(period) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Lower rank is better: ▲ = improved, ▼ = dropped, — = unchanged / not comparable.
function movement(current, previous) {
  if (current == null || previous == null || current === previous) return "—";
  return current < previous ? "▲" : "▼";
}
const rankText = (r) => (r == null ? "—" : `#${r}`);

function renderReport({ clientName, monthLabel, keywords, deliverables, summary }) {
  const parts = [`<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Monthly SEO report — ${escapeHtml(monthLabel)}</p>`];

  if (summary) {
    parts.push(section("Wins this month",
      `<p style="margin:6px 0 20px;font-size:13px;line-height:1.6;color:#111827;white-space:pre-line;">${escapeHtml(summary)}</p>`));
  }

  if (keywords.length) {
    const ranked = keywords.filter((k) => k.current_rank != null);
    const avg = ranked.length
      ? (ranked.reduce((s, k) => s + Number(k.current_rank), 0) / ranked.length).toFixed(1)
      : null;
    const top10 = ranked.filter((k) => Number(k.current_rank) <= 10).length;
    parts.push(section("Keyword rankings",
      `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Average rank: <strong style="color:#111827;">${avg == null ? "—" : "#" + avg}</strong> &nbsp;·&nbsp; In top 10: <strong style="color:#111827;">${top10} of ${keywords.length}</strong></p>`
      + htmlTable(
        ["Keyword", "Rank", "Previous", ""],
        keywords.map((k) => [
          escapeHtml(k.keyword),
          rankText(k.current_rank),
          rankText(k.previous_rank),
          movement(k.current_rank, k.previous_rank),
        ]),
      )));
  }

  if (deliverables.length) {
    const delivered = deliverables.filter((d) => d.status === "delivered").length;
    parts.push(section(`Deliverables — ${delivered} of ${deliverables.length} delivered`,
      htmlTable(
        ["Deliverable", "Due", "Status"],
        deliverables.map((d) => [
          escapeHtml(d.title || d.type),
          fmtDate(d.due_date),
          escapeHtml(String(d.status || "").replaceAll("_", " ")),
        ]),
      )));
  }

  return layout(clientName, parts.join(""));
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

  // Import the DB client only after the config checks so an unconfigured site
  // never touches (or crashes in) the driver.
  const { neon } = await import("@netlify/neon");
  const sql = neon();

  // Recipient table: one optional address per client. Created here so this
  // function works before the management UI ships. The join drops rows whose
  // client was deleted (cascade covers it anyway) and disabled rows.
  let recipients;
  try {
    await sql`create table if not exists client_report_emails (
      client_id uuid primary key references clients(id) on delete cascade,
      recipient text not null,
      enabled boolean default true
    )`;
    recipients = await sql`
      select e.client_id, e.recipient, c.name
      from client_report_emails e
      join clients c on c.id = e.client_id
      where e.enabled
      order by c.name`;
  } catch (e) {
    // e.g. brand-new database where the app hasn't created `clients` yet.
    console.error(`${TAG}: database not ready — skipping run. (${e?.message || e})`);
    return;
  }
  if (!recipients.length) {
    console.log(`${TAG}: no enabled recipients in client_report_emails — nothing to send.`);
    return;
  }

  const period = previousPeriod();
  const monthLabel = periodLabel(period);
  let sent = 0, skipped = 0, failed = 0;

  for (const r of recipients) {
    try {
      const [keywords, deliverables, reports] = await Promise.all([
        sql`select keyword, current_rank, previous_rank from keywords
            where client_id=${r.client_id} order by keyword`,
        sql`select title, type, status, due_date from deliverables
            where client_id=${r.client_id} and to_char(due_date, 'YYYY-MM') = ${period}
            order by due_date, title`,
        sql`select summary from client_reports
            where client_id=${r.client_id} and period=${period} limit 1`,
      ]);
      const summary = (reports[0]?.summary || "").trim();
      if (!keywords.length && !deliverables.length && !summary) {
        skipped += 1;
        console.log(`${TAG}: skipped ${r.name} — no data for ${period}.`);
        continue;
      }
      await sendEmail({
        to: r.recipient,
        subject: `Monthly SEO report — ${r.name} — ${monthLabel}`,
        html: renderReport({ clientName: r.name, monthLabel, keywords, deliverables, summary }),
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      console.error(`${TAG}: failed for ${r.name}: ${e?.message || e}`);
    }
  }
  console.log(`${TAG}: ${period} — sent ${sent}, skipped ${skipped}, failed ${failed}.`);
};

// 08:00 UTC on the 1st of every month.
export const config = { schedule: "0 8 1 * *" };

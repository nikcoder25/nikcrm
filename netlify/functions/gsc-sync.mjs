/* global process, console, fetch, Response */

// Nightly Google Search Console pull. For every client linked to a GSC
// property (clients.gsc_property), fetches the last ~30 days of organic
// performance from the Search Analytics API and stores it locally:
//   gsc_daily    one row per client per day (clicks / impressions / ctr /
//                position), upserted so re-runs refresh in place
//   gsc_queries  the top queries for the month of the range's end date,
//                replaced wholesale on every run
// Entirely optional: without GSC_SERVICE_ACCOUNT_JSON the run is a graceful
// no-op. Access is granted by adding the service account's email as a user on
// each client's Search Console property — a 403 below means that step was
// missed for that property.

import { neon } from "@netlify/neon";
import { gscConfigured, googleAccessToken } from "./lib/google.mjs";

const TAG = "gsc-sync";
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

// Stop picking up new clients once this much wall time has elapsed, so the
// run always finishes well inside the function timeout. Clients are ordered
// deterministically, so any left behind are picked up tomorrow.
const RUN_BUDGET_MS = 20_000;
const QUERY_ROW_LIMIT = 50;

// UTC calendar date N days ago as 'YYYY-MM-DD'.
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// One Search Analytics call. Returns the rows array (possibly empty); throws
// with Google's message (and the HTTP status attached) on any failure.
async function searchAnalytics(token, property, body) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `GSC HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return Array.isArray(data.rows) ? data.rows : [];
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (v) => Math.round(num(v) * 10) / 10;

export default async () => {
  if (!gscConfigured()) {
    console.log(`${TAG}: GSC_SERVICE_ACCOUNT_JSON not set (or invalid) — skipping run.`);
    return new Response("skipped: no GSC service account");
  }
  if (!process.env.NETLIFY_DATABASE_URL) {
    console.log(`${TAG}: NETLIFY_DATABASE_URL not set — skipping run.`);
    return new Response("skipped: no database");
  }

  // GSC data lags ~2 days, so the freshest reliable day is today-2.
  const startDate = daysAgo(32);
  const endDate = daysAgo(2);
  const month = endDate.slice(0, 7);

  const started = Date.now();
  let picked, synced = 0, failed = 0;

  try {
    const sql = neon();
    const token = await googleAccessToken(SCOPES);
    const clients = await sql`select id, name, gsc_property from clients
      where coalesce(gsc_property, '') <> '' order by created_at asc`;
    picked = clients.length;

    // Sequential on purpose: predictable time budget, gentle on quotas, and
    // one bad property never kills the run.
    for (const client of clients) {
      if (Date.now() - started > RUN_BUDGET_MS) {
        console.log(`${TAG}: ${RUN_BUDGET_MS / 1000}s budget reached — stopping early.`);
        break;
      }
      try {
        // a) Daily totals — upserted so overlapping windows refresh in place
        //    (GSC revises recent days as data finalizes).
        const dailyRows = await searchAnalytics(token, client.gsc_property, {
          startDate, endDate, dimensions: ["date"],
        });
        if (dailyRows.length) {
          const dates = dailyRows.map((r) => r.keys?.[0]);
          const clicks = dailyRows.map((r) => Math.round(num(r.clicks)));
          const impressions = dailyRows.map((r) => Math.round(num(r.impressions)));
          const ctrs = dailyRows.map((r) => num(r.ctr));
          const positions = dailyRows.map((r) => num(r.position));
          await sql`insert into gsc_daily (client_id, date, clicks, impressions, ctr, position)
            select ${client.id}, d, c, i, r, p
            from unnest(${dates}::date[], ${clicks}::int[], ${impressions}::int[], ${ctrs}::real[], ${positions}::real[]) as t(d, c, i, r, p)
            on conflict (client_id, date) do update set
              clicks=excluded.clicks, impressions=excluded.impressions,
              ctr=excluded.ctr, position=excluded.position`;
        }

        // b) Top queries for the month of endDate — replaced wholesale so the
        //    stored set always reflects the freshest 30-day window.
        const queryRows = await searchAnalytics(token, client.gsc_property, {
          startDate, endDate, dimensions: ["query"], rowLimit: QUERY_ROW_LIMIT,
        });
        await sql`delete from gsc_queries where client_id=${client.id} and month=${month}`;
        if (queryRows.length) {
          const queries = queryRows.map((r) => String(r.keys?.[0] || "")).map((q) => q.slice(0, 500));
          const qClicks = queryRows.map((r) => Math.round(num(r.clicks)));
          const qImpressions = queryRows.map((r) => Math.round(num(r.impressions)));
          const qPositions = queryRows.map((r) => round1(r.position));
          await sql`insert into gsc_queries (client_id, month, query, clicks, impressions, position)
            select ${client.id}, ${month}, q, c, i, p
            from unnest(${queries}::text[], ${qClicks}::int[], ${qImpressions}::int[], ${qPositions}::real[]) as t(q, c, i, p)
            on conflict (client_id, month, query) do nothing`;
        }

        synced += 1;
      } catch (e) {
        failed += 1;
        if (e?.status === 403) {
          console.error(`${TAG}: "${client.name}" (${client.gsc_property}) returned 403 — add the service account email as a user on that Search Console property.`);
        } else {
          console.error(`${TAG}: "${client.name}" (${client.gsc_property}) failed: ${e?.message || e}`);
        }
      }
    }
  } catch (e) {
    console.error(`${TAG}: run failed:`, e?.message || e);
    return new Response("error", { status: 500 });
  }

  const summary = `${TAG}: picked ${picked}, synced ${synced}, failed ${failed} in ${((Date.now() - started) / 1000).toFixed(1)}s (${startDate} → ${endDate})`;
  console.log(summary);
  return new Response(summary);
};

// Daily at 05:30 UTC (before the 06:00 rank check).
export const config = { schedule: "30 5 * * *" };

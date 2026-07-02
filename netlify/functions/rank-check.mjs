/* global process, console, Buffer, fetch, URL, Response */

// Scheduled keyword rank checks via DataForSEO (SERP API). Runs daily and
// refreshes every keyword flagged auto_track. Entirely optional: without
// DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars the run is a graceful no-op
// and rank tracking stays manual.
import { neon } from "@netlify/neon";

// Stop picking up new keywords once this much wall time has elapsed, so the
// run always finishes well inside the function timeout. Keywords left behind
// are the freshest ones — the oldest-checked-first ordering picks up the rest
// on the next run.
const RUN_BUDGET_MS = 20_000;
const BATCH_LIMIT = 100;

// Hostname without the www. prefix; "" when blank/unparseable.
function domainOf(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try { return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

// One live SERP lookup. Returns the first matching organic position
// (rank_absolute) for the keyword's target domain, or null when it isn't in
// the top 100 results.
async function fetchRank(kw, auth) {
  const isBing = kw.search_engine === "www.bing.com";
  const endpoint = isBing
    ? "https://api.dataforseo.com/v3/serp/bing/organic/live/regular"
    : "https://api.dataforseo.com/v3/serp/google/organic/live/regular";
  const task = {
    keyword: kw.keyword,
    location_name: kw.location || "United States",
    language_code: "en",
    device: kw.platform || "desktop",
    depth: 100,
  };
  // Google-only: which country domain to query. DataForSEO expects the bare
  // engine domain ("google.co.uk"), so drop any www. prefix. Bing has its own
  // endpoint and takes no se_domain.
  if (!isBing) task.se_domain = (kw.search_engine || "www.google.com").replace(/^www\./, "");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: JSON.stringify([task]),
  });
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
  const data = await res.json();
  const t = data?.tasks?.[0];
  if (t?.status_code >= 40000) throw new Error(`DataForSEO task ${t.status_code}: ${t.status_message || "error"}`);

  const target = domainOf(kw.target_url);
  const items = t?.result?.[0]?.items || [];
  for (const item of items) {
    if (item?.type !== "organic") continue;
    const d = String(item.domain || "").replace(/^www\./, "").toLowerCase() || domainOf(item.url);
    if (d && d === target) {
      const rank = Number(item.rank_absolute);
      return Number.isFinite(rank) ? Math.trunc(rank) : null;
    }
  }
  return null; // not in the top 100
}

// Persist a check result with the same movement semantics as keywordUpdate in
// data.js: previous_rank rolls only when the rank actually changes, and a
// keyword_history point is appended only when it changes to a real value.
// checked_at always records this successful check, so the oldest-checked-first
// pick order rotates fairly through the whole auto-track set.
async function applyRank(sql, kw, rank) {
  const rankChanged = (rank ?? null) !== (kw.current_rank ?? null);
  const previous = rankChanged ? kw.current_rank : kw.previous_rank;
  await sql`update keywords set
    current_rank=${rank ?? null}, previous_rank=${previous ?? null}, checked_at=${new Date().toISOString()}
    where id=${kw.id}`;
  if (rankChanged && rank != null) {
    await sql`insert into keyword_history (keyword_id, rank) values (${kw.id}, ${rank})`;
  }
  return rankChanged;
}

export default async () => {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    console.log("rank-check: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set — skipping run.");
    return new Response("skipped: no DataForSEO credentials");
  }
  if (!process.env.NETLIFY_DATABASE_URL) {
    console.log("rank-check: NETLIFY_DATABASE_URL not set — skipping run.");
    return new Response("skipped: no database");
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const started = Date.now();
  let picked, checked = 0, updated = 0, failed = 0;

  try {
    const sql = neon();
    const kws = await sql`select id, keyword, current_rank, previous_rank, target_url, search_engine, location, platform
      from keywords
      where auto_track = true
      order by checked_at asc nulls first, created_at asc
      limit ${BATCH_LIMIT}`;
    picked = kws.length;

    // Sequential on purpose: keeps us inside DataForSEO rate limits and makes
    // the time budget predictable. One bad keyword never kills the run.
    for (const kw of kws) {
      if (Date.now() - started > RUN_BUDGET_MS) {
        console.log(`rank-check: ${RUN_BUDGET_MS / 1000}s budget reached — stopping early.`);
        break;
      }
      try {
        if (!String(kw.keyword || "").trim()) continue; // nothing to search for
        // No target URL means there is nothing to match against — skip the
        // (billable) SERP call and just record an unranked check.
        const rank = domainOf(kw.target_url) ? await fetchRank(kw, auth) : null;
        const changed = await applyRank(sql, kw, rank);
        checked += 1;
        if (changed) updated += 1;
      } catch (e) {
        failed += 1;
        console.error(`rank-check: "${kw.keyword}" failed: ${e?.message || e}`);
      }
    }
  } catch (e) {
    console.error("rank-check: run failed:", e?.message || e);
    return new Response("error", { status: 500 });
  }

  const summary = `rank-check: picked ${picked}, checked ${checked}, updated ${updated}, failed ${failed} in ${((Date.now() - started) / 1000).toFixed(1)}s`;
  console.log(summary);
  return new Response(summary);
};

// Daily at 06:00 UTC.
export const config = { schedule: "0 6 * * *" };

/* global process */

// Cloudflare Worker entry: runs the SAME API handlers that power the Netlify
// deployment (netlify/functions/*.js) on Cloudflare's free tier. The frontend
// is a static build hosted anywhere (e.g. Hostinger) and calls this Worker
// cross-origin, so responses carry CORS headers for the configured origin.
//
// Requires wrangler.toml's nodejs_compat flag: the handlers use node:crypto
// (scrypt, HMAC, RSA sign) and Buffer. Env vars/secrets are mirrored into
// process.env so the handlers' process.env reads work unchanged.
//
// Routes:
//   /api/data           → netlify/functions/data.js      (the whole CRM API)
//   /api/google         → netlify/functions/google.js    (OAuth + Gmail/Calendar)
//   /api/stripe-webhook → netlify/functions/stripe-webhook.mjs
// Cron triggers (UTC, mirroring each function's Netlify schedule):
//   30 5 * * *  gsc-sync        0 6 * * *  rank-check
//   0 7 * * *   overdue-digest  0 8 1 * *  monthly-report-email

import dataHandler from "../netlify/functions/data.js";
import googleHandler from "../netlify/functions/google.js";
import stripeWebhook from "../netlify/functions/stripe-webhook.mjs";
import gscSync from "../netlify/functions/gsc-sync.mjs";
import rankCheck from "../netlify/functions/rank-check.mjs";
import overdueDigest from "../netlify/functions/overdue-digest.mjs";
import monthlyReportEmail from "../netlify/functions/monthly-report-email.mjs";

// Copy string env values onto process.env. Newer runtimes populate it
// automatically; doing it explicitly keeps the Worker correct regardless of
// compatibility-flag drift, and lets secrets set via `wrangler secret` land too.
function syncEnv(env) {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") process.env[k] = v;
  }
}

// Origins allowed to call the API — set ALLOWED_ORIGIN to the site's origin
// (e.g. "https://crm.example.com"), comma-separated for several. "*" only if
// you really mean it. Unset = no CORS headers (same-origin/curl still work).
function corsHeaders(req, env) {
  const conf = String(env.ALLOWED_ORIGIN || "").trim();
  if (!conf) return null;
  const origin = req.headers.get("origin") || "";
  const list = conf.split(",").map((s) => s.trim()).filter(Boolean);
  const allow = list.includes("*") ? "*" : (list.includes(origin) ? origin : null);
  if (!allow) return null;
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-app-password",
    "access-control-max-age": "86400",
    ...(allow !== "*" ? { vary: "origin" } : {}),
  };
}

function withCors(res, cors) {
  if (!cors) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env) {
    syncEnv(env);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors ? 204 : 405, headers: cors || {} });
    }
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/api/data") return withCors(await dataHandler(request), cors);
      // The OAuth callback arrives as a top-level GET redirect from Google
      // (no CORS involved); POSTs from the app get the CORS treatment.
      if (pathname === "/api/google") return withCors(await googleHandler(request), cors);
      if (pathname === "/api/stripe-webhook") return await stripeWebhook(request); // called by Stripe, never the browser
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json", ...(cors || {}) } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { "content-type": "application/json", ...(cors || {}) } });
    }
  },

  async scheduled(controller, env, ctx) {
    syncEnv(env);
    const JOBS = {
      "30 5 * * *": gscSync,
      "0 6 * * *": rankCheck,
      "0 7 * * *": overdueDigest,
      "0 8 1 * *": monthlyReportEmail,
    };
    const job = JOBS[controller.cron];
    if (job) ctx.waitUntil(job());
  },
};

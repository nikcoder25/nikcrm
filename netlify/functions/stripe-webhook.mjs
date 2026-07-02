/* global process, console, Buffer, Response */

// Stripe webhook: marks a payments row paid when a Payment Link checkout
// completes. Entirely optional — without STRIPE_WEBHOOK_SECRET every delivery
// is answered 503 and nothing is ever marked paid. No stripe npm package: the
// signature is verified by hand (HMAC SHA-256, same scheme the SDK uses), and
// NOTHING is trusted from the body until that verification passes.
import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@netlify/neon";

// Reject events signed more than 5 minutes ago (replay protection).
const TOLERANCE_S = 5 * 60;

// Stripe-Signature header: "t=<unix seconds>,v1=<hex hmac>[,v1=...]".
// The signed payload is `${t}.${rawBody}`; any v1 may match (key rotation).
function validSignature(header, rawBody, secret) {
  let t = "";
  const v1s = [];
  for (const part of String(header || "").split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k === "t") t = part.slice(i + 1).trim();
    else if (k === "v1") v1s.push(part.slice(i + 1).trim());
  }
  if (!/^\d+$/.test(t) || !v1s.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return v1s.some((sig) => {
    const got = Buffer.from(sig);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.log("stripe-webhook: STRIPE_WEBHOOK_SECRET not set — rejecting delivery.");
    return new Response("Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET.", { status: 503 });
  }

  const rawBody = await req.text();
  if (!validSignature(req.headers.get("stripe-signature"), rawBody, secret)) {
    console.error("stripe-webhook: invalid signature — dropping event.");
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return new Response("Bad JSON", { status: 400 }); }
  console.log(`stripe-webhook: event ${event.type || "unknown"} (${event.id || "no id"})`);
  if (event.type !== "checkout.session.completed") return new Response("ignored");

  // Payment Links copy their metadata onto each Checkout Session they open,
  // so client_id + month arrive right on the session object.
  const session = event.data?.object || {};
  if (session.payment_status && session.payment_status !== "paid") {
    console.log(`stripe-webhook: session ${session.id} completed but payment_status=${session.payment_status} — not marking paid.`);
    return new Response("not paid yet");
  }
  const { client_id, month } = session.metadata || {};
  if (!UUID_RE.test(String(client_id || "")) || !month) {
    console.log("stripe-webhook: session has no client_id/month metadata — ignoring.");
    return new Response("no metadata");
  }
  if (!process.env.NETLIFY_DATABASE_URL) {
    console.error("stripe-webhook: NETLIFY_DATABASE_URL not set — cannot record payment.");
    return new Response("no database", { status: 503 });
  }

  try {
    const sql = neon();
    const paidDate = new Date().toISOString().slice(0, 10);
    const updated = await sql`update payments set status='paid', paid_date=${paidDate}
      where client_id=${client_id} and month=${month} returning id`;
    console.log(`stripe-webhook: marked ${updated.length} payment(s) paid for client ${client_id}, month ${month}.`);
  } catch (e) {
    console.error("stripe-webhook: DB update failed:", e?.message || e);
    return new Response("error", { status: 500 }); // Stripe retries on 5xx
  }
  return new Response("ok");
};

export const config = { path: "/api/stripe-webhook" };

/* global process, fetch */

// Outbound email via the Resend HTTP API — plain fetch, no SDK, so the
// scheduled functions add zero dependencies. Configure with:
//   RESEND_API_KEY      required to send anything (callers no-op without it)
//   REPORT_FROM_EMAIL   optional From address; the resend.dev default only
//                       delivers to your own Resend account's email, so set a
//                       verified-domain sender for real client delivery.

const DEFAULT_FROM = "Growth Atlas <onboarding@resend.dev>";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

// `to` is a single address or an array. Throws on any non-2xx response so
// callers can count/log failures. Only call once emailConfigured() is true.
export async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.REPORT_FROM_EMAIL || DEFAULT_FROM,
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

// Tiny HTML-email rendering helpers shared by the scheduled report/digest
// functions. Everything is inline-styled because email clients strip <style>
// blocks; no external assets so the emails are fully self-contained.

// DB text (client names, titles, narratives) goes straight into the emails —
// always escape it.
export function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const TH = "text-align:left;padding:6px 10px;border-bottom:2px solid #d1d5db;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#6b7280;";
const TD = "padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;";

// headers: plain-text strings (escaped here). rows: arrays of ALREADY-ESCAPED
// html strings, so callers can mix escaped data with markup like <strong>.
export function htmlTable(headers, rows) {
  const head = headers.map((h) => `<th style="${TH}">${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((cells) => `<tr>${cells.map((c) => `<td style="${TD}">${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 20px;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// A section heading + body. `title` is plain text; `bodyHtml` is markup.
export function section(title, bodyHtml) {
  return `<h2 style="margin:22px 0 4px;font-size:15px;color:#111827;">${escapeHtml(title)}</h2>${bodyHtml}`;
}

// The outer shell: card on a light background. `title` is plain text,
// `bodyHtml` is markup.
export function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<h1 style="margin:0 0 4px;font-size:19px;color:#111827;">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Sent automatically by Growth Atlas.</p>
</div></body></html>`;
}

// Date columns can arrive as 'YYYY-MM-DD' strings or Date objects depending on
// the driver's type parsing — normalize to the ISO date part. (Scheduled
// functions run in UTC, so Date -> ISO can't shift a day.)
export function isoDate(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// 'YYYY-MM-DD' (or Date) -> "Jun 15, 2026" for display; "—" when absent.
export function fmtDate(v) {
  const s = isoDate(v);
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

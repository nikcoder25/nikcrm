// Tiny client-side CSV export. Works on already-loaded data — no server round trip.
import { typeLabel, deliverableStatusLabel } from "./constants";

function esc(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => esc(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(c.value(r))).join(",")).join("\r\n");
  return head + "\r\n" + body;
}

export function downloadCsv(filename, csv) {
  // Prepend a BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const namesOf = (clients) => new Map(clients.map((c) => [c.id, c.name]));

/* ---------------- per-dataset builders ---------------- */
export const clientsCsv = (clients) => toCsv(clients, [
  { header: "Name", value: (c) => c.name },
  { header: "Niche", value: (c) => c.niche },
  { header: "Status", value: (c) => c.status },
  { header: "Source", value: (c) => c.source },
  { header: "Package", value: (c) => c.package },
  { header: "Monthly Fee", value: (c) => c.fee },
  { header: "Team Member", value: (c) => c.team_member },
  { header: "Start Month", value: (c) => c.start_month },
  { header: "Renewal Month", value: (c) => c.renewal_month },
  { header: "Risk", value: (c) => c.risk },
  { header: "Notes", value: (c) => c.notes },
]);

export const deliverablesCsv = (deliverables, clients) => {
  const names = namesOf(clients);
  return toCsv(deliverables, [
    { header: "Client", value: (d) => names.get(d.client_id) || "" },
    { header: "Title", value: (d) => d.title },
    { header: "Type", value: (d) => typeLabel(d.type) },
    { header: "Status", value: (d) => deliverableStatusLabel(d.status) },
    { header: "Quantity", value: (d) => d.quantity },
    { header: "Due Date", value: (d) => d.due_date || "" },
    { header: "Notes", value: (d) => d.notes },
  ]);
};

export const keywordsCsv = (keywords, clients) => {
  const names = namesOf(clients);
  return toCsv(keywords, [
    { header: "Client", value: (k) => names.get(k.client_id) || "" },
    { header: "Keyword", value: (k) => k.keyword },
    { header: "Current Rank", value: (k) => (k.current_rank == null ? "" : k.current_rank) },
    { header: "Previous Rank", value: (k) => (k.previous_rank == null ? "" : k.previous_rank) },
    { header: "Target URL", value: (k) => k.target_url },
    { header: "Checked At", value: (k) => (k.checked_at ? String(k.checked_at).slice(0, 10) : "") },
    { header: "Notes", value: (k) => k.notes },
  ]);
};

export const paymentsCsv = (payments, clients) => {
  const names = namesOf(clients);
  return toCsv(payments, [
    { header: "Client", value: (p) => names.get(p.client_id) || "" },
    { header: "Month", value: (p) => p.month },
    { header: "Amount", value: (p) => p.amount },
    { header: "Status", value: (p) => p.status },
    { header: "Paid Date", value: (p) => p.paid_date || "" },
  ]);
};

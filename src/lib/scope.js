// Retainer / scope logic. Compares a client's agreed monthly scope (included
// quantity per deliverable type) against what was actually delivered in a month.
//
// A deliverable counts toward month M when it's marked Delivered AND it's
// attributed to M. Attribution uses the explicit `month` field, falling back to
// the due_date's month for legacy rows written before that column existed.

// The calendar month ('YYYY-MM') a deliverable belongs to.
export const deliverableMonth = (d) =>
  d.month || (d.due_date ? String(d.due_date).slice(0, 7) : "");

export function deliveredCount(deliverables, clientId, type, month) {
  return deliverables.filter(
    (d) => d.client_id === clientId && d.type === type && d.status === "delivered" && deliverableMonth(d) === month
  ).length;
}

// One row per retainer line: { type, included, delivered, state, delta }
// state: 'over' (scope creep) | 'complete' | 'under'
export function scopeRows(retainers, deliverables, clientId, month) {
  return retainers
    .filter((r) => r.client_id === clientId)
    .map((r) => {
      const included = Number(r.quantity) || 0;
      const delivered = deliveredCount(deliverables, clientId, r.type, month);
      const delta = delivered - included;
      const state = delta > 0 ? "over" : delivered >= included ? "complete" : "under";
      return { id: r.id, type: r.type, included, delivered, delta, state };
    });
}

// True when any retainer line for the client is over scope in the month.
export function isOverScope(retainers, deliverables, clientId, month) {
  return scopeRows(retainers, deliverables, clientId, month).some((r) => r.state === "over");
}

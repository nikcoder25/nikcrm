/* ---------------- order archiving ----------------
   An order is ARCHIVED once its status is set to "Archive". Archiving is derived
   from the status field (there is no separate flag), so it lives on the order
   row itself — it persists in the same store/DB and survives reload, and is
   included in every JSON backup and CSV export for free.

   Restoring drops the order back to an active status (Delivered) so it returns
   to the Active list and doesn't immediately re-archive. */

export const ARCHIVE_STATUS = "archived";
// Where a restored order lands: the last active stage before Reviewed.
export const RESTORE_STATUS = "delivered";

export const isArchived = (o) => (o?.status || "") === ARCHIVE_STATUS;

// Split a flat order list into the two tabs. Every field is preserved — the same
// row simply appears under Active or Archived based on its status.
export function splitOrders(orders = []) {
  const active = [];
  const archived = [];
  for (const o of orders) (isArchived(o) ? archived : active).push(o);
  return { active, archived };
}

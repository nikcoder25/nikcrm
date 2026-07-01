/* ---------------- domain constants ---------------- */
export const STATUSES = ["lead", "upcoming", "active", "paused", "ended", "loss"];
export const STATUS_LABEL = { lead: "Lead", upcoming: "Upcoming", active: "Active", paused: "Paused", ended: "Ended", loss: "SEO Loss" };
export const SOURCES = ["Direct", "Fiverr", "Referral", "Other"];
export const PACKAGES = ["Basic", "Standard", "Premium", "Custom"];

export const TASK_TYPES = [
  { key: "guest", label: "Guest Post" }, { key: "onpage", label: "On-Page SEO" },
  { key: "backlink", label: "Backlink" }, { key: "anchor", label: "Anchor Text" },
  { key: "blog", label: "Blog Post" }, { key: "audit", label: "Technical Audit" },
  { key: "schema", label: "Schema" }, { key: "other", label: "Other" },
];
export const typeLabel = (k) => (TASK_TYPES.find((t) => t.key === k) || TASK_TYPES[7]).label;

export const TASK_STATES = [{ key: "todo", label: "To Do" }, { key: "doing", label: "In Progress" }, { key: "done", label: "Done" }];
export const PAY_STATES = [{ key: "pending", label: "Pending" }, { key: "paid", label: "Paid" }, { key: "overdue", label: "Overdue" }];

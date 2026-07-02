/* ---------------- domain constants ---------------- */
export const STATUSES = ["lead", "upcoming", "active", "paused", "ended", "loss"];
export const STATUS_LABEL = { lead: "Lead", upcoming: "Upcoming", active: "Active", paused: "Paused", ended: "Ended", loss: "SEO Loss" };
export const SOURCES = ["Direct", "Fiverr", "Referral", "Other"];
export const PACKAGES = ["Basic", "Standard", "Premium", "Custom"];
export const RISKS = ["low", "medium", "high"];

export const TASK_TYPES = [
  { key: "guest", label: "Guest Post" }, { key: "onpage", label: "On-Page SEO" },
  { key: "backlink", label: "Backlink" }, { key: "anchor", label: "Anchor Text" },
  { key: "blog", label: "Blog Post" }, { key: "audit", label: "Technical Audit" },
  { key: "schema", label: "Schema" }, { key: "other", label: "Other" },
];
export const typeLabel = (k) => (TASK_TYPES.find((t) => t.key === k) || TASK_TYPES[7]).label;

export const TASK_STATES = [{ key: "todo", label: "To Do" }, { key: "doing", label: "In Progress" }, { key: "done", label: "Done" }];
export const PAY_STATES = [{ key: "pending", label: "Pending" }, { key: "paid", label: "Paid" }, { key: "overdue", label: "Overdue" }];

// Deliverables reuse TASK_TYPES for their "type"; these are their workflow states.
export const DELIVERABLE_STATES = [
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In Progress" },
  { key: "delivered", label: "Delivered" },
  { key: "blocked", label: "Blocked" },
];
export const deliverableStatusLabel = (k) => (DELIVERABLE_STATES.find((s) => s.key === k) || DELIVERABLE_STATES[0]).label;

// Backlinks: lifecycle of a link-building placement.
export const BACKLINK_STATES = [
  { key: "prospect", label: "Prospect" },
  { key: "outreach", label: "Outreach" },
  { key: "placed", label: "Placed" },
  { key: "live", label: "Live" },
  { key: "lost", label: "Lost" },
];
export const backlinkStatusLabel = (k) => (BACKLINK_STATES.find((s) => s.key === k) || BACKLINK_STATES[3]).label;

// AI answer engines tracked by the AI-visibility (AEO) module.
export const AI_ENGINES = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "perplexity", label: "Perplexity" },
  { key: "google_ai", label: "Google AI Overviews" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "other", label: "Other" },
];
export const aiEngineLabel = (k) => (AI_ENGINES.find((e) => e.key === k) || AI_ENGINES[5]).label;

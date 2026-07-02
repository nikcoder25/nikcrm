# Growth Atlas — Research & Roadmap (July 2026)

Senior-dev review of the deployed app (growth-atlas-app.netlify.app) and codebase, plus market
research on what SEO-agency management tools ship in 2026. Each item below is written as a
self-contained brief a junior developer can pick up: scope, files, and acceptance criteria.

> **Implementation status (July 2026):** DONE on this branch — all of P0; P1.1 client portal;
> P1.3 Serpfox-style keyword tracking + DataForSEO auto-checks; P1.4 scheduled report emails;
> P1.5 Stripe payment links; P2.2 activity log; P2.4 overdue digest; P2.5 drag-and-drop kanban;
> keyword-history loading capped (part of P2.3). REMAINING — P1.2 Google Search Console
> integration, P2.1 per-user accounts, P2.3 full per-entity refresh, recurring deliverable
> templates, and the P3 ideas.

**What we have today:** Overview KPIs + "needs attention", Clients (+ detail page, resources,
file uploads), kanban Task Board, Deliverables, Retainer/scope tracking, manual Keyword rank
tracking with history chart, Revenue/MRR + payment tracker, Team workload view, printable
per-client Monthly Report, CSV exports. Stack: React 18 + Vite, one Netlify Function
(`netlify/functions/data.js`), Neon Postgres, Netlify Blobs, shared-password auth.

---

## P0 — Fix before adding features (security & correctness)

These are small, hours-each, and protect what already exists.

### P0.1 Stop serving uploaded files inline (stored XSS)
`data.js` (~line 188) serves uploads with `content-disposition: inline` and the user-supplied
content type. An uploaded HTML/SVG file runs scripts on our origin and can read the password
from localStorage.
- Force `content-disposition: attachment`; whitelist safe content types (images, pdf,
  docs, sheets, zip); serve everything else as `application/octet-stream`.
- **Accept:** uploading an `.html` file and opening it downloads instead of rendering.

### P0.2 Validate URLs on save (`javascript:` XSS)
Resource links (`data.js` resourceLinkAdd) and keyword `target_url` are rendered straight into
`href`. Reject anything that isn't `http:`/`https:` server-side; normalize missing scheme to
`https://` client-side.
- **Accept:** saving a `javascript:alert(1)` link is rejected with a friendly error.

### P0.3 Login hardening
- Constant-time password compare (`crypto.timingSafeEqual`) in `data.js` (~line 162).
- Basic throttle: after N failed logins per IP in a window, return 429 (an in-memory map per
  function instance is fine for now).
- **Accept:** wrong-password spam gets 429; correct login still works.

### P0.4 Confirm before delete
Client / task / keyword / resource / deliverable deletes fire on a single click with no undo.
Add a shared `confirmDialog` (or `window.confirm` as v1) to every delete handler in
`Dashboard.jsx`, `ClientDetail.jsx`, `Board.jsx`.
- **Accept:** deleting a client requires an explicit confirmation naming the client.

### P0.5 Make "everyone sees changes" true (background refresh)
Data currently loads once on mount; teammates' changes appear only after your own action.
Add a `setInterval` background `refresh()` (e.g. every 60s, paused when tab hidden via
`document.visibilityState`) in `Dashboard.jsx`.
- **Accept:** a change made in browser A appears in browser B within a minute, no interaction.

### P0.6 Server-side enum validation
`clientSave` accepts any string for status/source/package/risk; a typo silently drops the
client from rollups. Validate against the lists in `src/lib/constants.js` (share or duplicate
them in the function).
- **Accept:** API rejects an unknown status with 400.

### P0.7 Tests + CI (thin slice)
Vitest unit tests for `lib/scope.js`, `lib/format.js`, keyword movement/summary logic; ESLint;
a GitHub Actions workflow running lint + test + `vite build` on PRs.
- **Accept:** CI is red when a scope-math test breaks.

---

## P1 — Highest-value new capabilities

Market scan (AgencyAnalytics, SE Ranking, OneSuite/Assembly roundups) says the 2026 table
stakes for agency tools are: **client portal, automated white-label reporting, integrated
data (GSC/GA4/rank APIs), and billing**. These map cleanly onto what we already store.

### P1.1 Read-only client portal (white-label)
Biggest differentiator vs. what we have. Every competitor roundup leads with this: clients get
a link, see their own deliverables, keyword trends, and monthly report — no more "can you send
me the report?" emails.
- New table `client_portal_tokens (client_id, token, enabled)`; "Share portal link" button in
  ClientDetail generates `/portal/:token`.
- Portal route renders a stripped, read-only version of the existing `ClientReport` +
  deliverables + keyword chart for that one client. No team data, no revenue of other clients,
  no editing. Token check happens in the function (new `portalLoad` action returning only that
  client's rows).
- Optional agency logo/name setting for branding.
- **Accept:** an incognito browser with only the link sees exactly one client's data; revoking
  the token kills access.

### P1.2 Google Search Console integration (free, real data)
Replaces guesswork in monthly reports with Google's own clicks/impressions/position data.
GSC API is free for properties the client grants access to — no per-keyword fees.
- Store a per-client GSC property + OAuth refresh token (server-side only); nightly Netlify
  Scheduled Function pulls top queries + clicks/impressions/avg position into new tables.
- Surface in ClientDetail and the Monthly Report ("organic clicks this month vs last").
- **Accept:** connecting a property shows a clicks/impressions trend without manual entry.

### P1.3 Automated rank checks (upgrade manual keyword tracking)
Manual entry is our current model; competitors auto-track. DataForSEO SERP API is
pay-as-you-go (~$0.002–0.009 per keyword check — a 500-keyword daily portfolio is roughly
$30–140/mo depending on queue vs live). Keep manual entry as the fallback.
- Netlify Scheduled Function (weekly per keyword by default) calls the SERP API for keywords
  flagged `auto_track`, writes into the existing `keyword_history` flow so the trend chart and
  movement logic just work.
- API key via env var; per-client toggle to control spend.
- **Accept:** an auto-tracked keyword updates rank + history weekly with no human input.

### P1.4 Scheduled, emailed, white-label monthly reports
We already generate the report; competitors *deliver* it. Add "email this report as PDF
monthly" per client.
- Netlify Scheduled Function on the 1st of each month renders the report (or links to the
  portal) and emails via Resend/Postmark; store recipient + toggle on the client.
- **Accept:** enabling the toggle sends the report email on schedule; disabled clients get none.

### P1.5 Invoicing via Stripe payment links
Revenue tab tracks who paid but collecting is manual. Cheapest useful slice: a "Create payment
link" button on a pending payment that creates a Stripe Payment Link for the client's monthly
fee, stores the URL, and marks the payment Paid via Stripe webhook.
- **Accept:** clicking the link and paying (test mode) flips the payment to Paid automatically.

---

## P2 — Team & scale improvements

### P2.1 Real per-user accounts
Shared password means no identity, no per-user permissions, no revoking one person. Replace
with a `users` table (email + hashed password + role) and signed HTTP-only session cookies;
stop storing the password in localStorage. Keep roles admin/member.
- **Accept:** each teammate logs in individually; removing a user blocks only them.

### P2.2 Activity log / audit trail
New `activity` table written by every mutation in `data.js` (who, what, entity, when); an
"Activity" feed tab + "recent changes" on ClientDetail. Prerequisite: P2.1 for trustworthy
identity (works with self-typed names before that, just weaker).
- **Accept:** moving a task shows "Nik moved 'Guest post' to Done · 2m ago" in the feed.

### P2.3 Per-entity refresh instead of whole-DB reload
Every mutation currently re-fetches all nine tables including unbounded `keyword_history`.
Split the `load` action (`loadCore` + per-client lazy detail), cap history reads
(`LIMIT` per keyword), and have `run()` refresh only the affected dataset.
- **Accept:** moving a task triggers one small fetch, not a full reload (verify in devtools).

### P2.4 Notifications / overdue digest
Daily scheduled function emails (or Slack-webhooks) the "Needs attention" list — overdue
deliverables/tasks/payments and over-scope clients — to the team.
- **Accept:** a deliverable due yesterday appears in today's digest.

### P2.5 Kanban drag-and-drop + recurring tasks
Cards currently move via ‹ › buttons. Add HTML5 drag-and-drop (or `@dnd-kit`), plus recurring
deliverable templates ("4 blogs every month") that auto-create next month's rows — pairs
naturally with the retainer scope module.
- **Accept:** dragging a card between columns persists; monthly deliverables self-create.

---

## P3 — Differentiators to consider later

- **AI-visibility (AEO) tracking** — 2026 trend: track whether clients get cited in AI answers
  (ChatGPT/Perplexity/AI Overviews). Manual-entry v1 mirroring the keyword module; APIs are
  emerging.
- **Backlink module** — track built links per client (URL, DR, anchor, status, cost); feeds
  Deliverables and the Monthly Report. Manual v1, Ahrefs/DataForSEO later.
- **Site-audit snapshot** — free Google PageSpeed Insights API per client domain, monthly
  score history in the report.
- **Leads/pipeline mini-CRM** — prospect → proposal → won/lost, converting a won lead into a
  client; revenue forecast from pipeline.
- **Mobile polish + dark mode** — modals and report tables overflow on phones (`theme.js`
  media query covers only sidebar/board).
- **TypeScript migration + Dashboard split** — do gradually alongside the above, not as a
  standalone rewrite.

---

## Suggested order of work

1. **Sprint 1:** all of P0 (it's a week of small tickets).
2. **Sprint 2–3:** P1.1 client portal, then P1.4 scheduled reports (portal makes reports shareable).
3. **Sprint 4:** P1.2 GSC integration (free data, big report upgrade).
4. **Sprint 5:** P1.3 auto rank checks + P1.5 Stripe links.
5. **Then:** P2.1 real accounts → P2.2 activity log → P2.3 perf, with P2.4/P2.5 slotted between.

Sources consulted: OneSuite/Assembly/Digital PM 2026 SEO-agency software roundups (client
portal, white-label automated reporting, billing as table stakes), DataForSEO pricing docs,
rank-tracking API comparisons (ScrapingBee, Link-Assistant), Google Search Console API docs.

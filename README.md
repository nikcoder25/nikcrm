# Growth Atlas — Online SEO Ops (team board)

A real, online, multi-user SEO tool. Your team logs in with a shared password and works the same board. Everything is saved in a real database, so whatever one person changes, everyone sees.

Built with **React + Vite** on the front end and **Netlify** end-to-end:
**Netlify DB (Neon Postgres)** for data, **Netlify Functions** for the API, and a simple **shared team password** for login. No separate database account to sign up for.

---

## What you get
- **Overview**: a home dashboard with rollup KPIs (clients, open tasks, deliverables delivered/overdue, MRR + collected, avg keyword rank) and a **"Needs attention"** list of everything overdue
- **Team login** with one shared password (set an optional second password for admins), plus optional **per-user accounts** (email + personal password, managed by admins from the Team tab) — see [Per-user accounts](#per-user-accounts)
- **Roles**: admins can delete clients and manage user accounts; everyone else can do everything else
- **Clients**: add, edit, delete — status, source, package, team, dates, notes, monthly fee
- **Monthly Report**: inside each client's detail view, generate a printable monthly snapshot — keyword rankings (current/previous/movement, top-10, avg, net improvement), deliverables with a delivered/total rollup, and a saved free-text "wins" narrative. **Print / Export** opens a clean print-friendly layout (Save as PDF)
- **Client detail view**: click any client to see everything in one place, plus a **Resources** panel — attach links (Google Drive, Canva, Sheets…) *and* upload job files (stored in Netlify Blobs, up to 4 MB each)
- **Client portal**: give each client a private, read-only share link (`/portal/<token>`, no login) showing their keyword rankings with movement and rank-over-time charts, the month's deliverables, retainer scope progress and the saved monthly narrative — and nothing internal (no fees, notes or team data). Create, copy, disable/enable or regenerate the link from the client's detail view; regenerating or disabling revokes the old link instantly. Set the optional `AGENCY_NAME` env var to white-label the portal branding (defaults to "Growth Atlas"). The same panel also sets the **monthly report email** recipient used by the scheduled report emailer
- **Task Board** (kanban): Guest Post, On-Page, Backlink, Anchor Text, Blog, Audit, Schema. Assign people, **drag cards** between To Do → In Progress → Done (the ‹ › buttons remain for mobile/keyboard)
- **Activity** log: a team-wide audit trail — who created/edited/deleted clients, tasks, keywords, deliverables, payments and more, with relative timestamps. Full feed in its own tab, plus a "Recent activity" panel on the Overview
- **Deliverables**: track what you owe each client — type, quantity, due date, and status (Planned / In Progress / Delivered / Blocked), grouped by client with a per-client delivered/total summary
- **Retainer / scope tracking**: set each client's agreed monthly scope (included quantity per deliverable type) and see included-vs-delivered per month with an **over scope / complete / to-go** flag — catches scope creep. Surfaced in the client detail, the Monthly Report, and the Overview's "Needs attention" list. Scopes also drive **monthly generation**: one click creates the month's missing deliverables (status Planned, due on the month's last day) from the retainer lines — per client from the scope panel, or for **every active client** via "Generate this month" on the Deliverables tab. Idempotent: re-running only tops up the shortfall, never duplicates
- **Backlinks tracker**: log every link-building placement per client — URL, anchor text, target page, domain rating, cost, placed date and a Prospect → Outreach → Placed → Live → Lost status with inline updates. Grouped by client with a live/total rollup, client + status filters, search and CSV export; each client's detail view gets a compact backlinks panel and the printable Monthly Report gains a "Link building" section for links placed that month
- **AI Visibility / AEO tracking**: track whether AI answers (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini) cite each client for the prompts you care about — manual checks with a click-to-toggle cited ✓/✗, citation position and cited URL. Summary KPIs (prompts tracked, citation rate, per-engine breakdown), client + engine filters, search and CSV export; changes to cited/position stamp "last checked" and append a history row, and the Monthly Report gains an "AI visibility" section with per-engine counts
- **Keywords**: a Serpfox-style rank tracker. The tab groups keywords **by URL/client** — net change, best/worst rank, keyword count and a green/gray/red movement bar per group — with a **Last / Week / Month** period toggle. Expanding a group shows every keyword with rank, change, **search volume, search engine, location and desktop/mobile platform**, a per-keyword **rank-over-time chart** (rank 1 on top, date ticks, zoom), **starring**, and **bulk actions** (star / unstar / delete selected). **Bulk add** pastes up to 200 keywords at once (one per line, shared target URL / engine / location / platform). Optional **automatic daily rank checks** via DataForSEO: set `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` env vars and tick "Auto-check rank" on a keyword — a scheduled function (`netlify/functions/rank-check.mjs`, 06:00 UTC) looks up the target domain's live Google/Bing position and records the history; without the keys, tracking stays fully manual. Also surfaced inside each client's detail view
- **Google Search Console integration** *(optional)*: link each client to their Search Console property (`sc-domain:example.com` or `https://example.com/`) and a scheduled function (`netlify/functions/gsc-sync.mjs`, 05:30 UTC) pulls their organic performance nightly via one agency-wide **Google service account** (`GSC_SERVICE_ACCOUNT_JSON` env var). The client detail view gets an **"Organic search"** panel — clicks + impressions for the last 28 days with change vs the previous 28, a daily-clicks chart, and a top-queries table — and the printable **Monthly Report** gains an Organic search section (month totals vs previous month + top 10 queries). Without the env var everything stays hidden and manual
- **Revenue**: MRR, collected vs pending per month, revenue by source, and a per-client payment tracker (Pending / Paid / Overdue). Optional **Stripe payment links**: with `STRIPE_SECRET_KEY` set, every unpaid row gets a "Payment link" button that creates (once) and copies a Stripe Payment Link for that client's monthly fee — and a webhook (`/api/stripe-webhook`) marks the payment **Paid automatically** when the client pays. Without the key the buttons simply don't appear
- **Team** view: who has how many clients and tasks

---

## Deploy it on Netlify (about 10 minutes, one time)

### 1. Get the code on Netlify
- In Netlify: **Add new site → Import an existing project → GitHub**, and pick this repo.
- Build settings fill in automatically from `netlify.toml` (build `npm run build`, publish `dist`, functions `netlify/functions`). Leave them as-is.

### 2. Add a database (Netlify DB / Neon)
- On the site: **Project configuration → Netlify DB** (or the **Extensions** tab → Netlify DB) → **enable / provision** it.
- This creates a free Neon Postgres database. Provisioning usually sets the required **`NETLIFY_DATABASE_URL`** environment variable for you.
- **If data loads fail** with `Database not configured. Set NETLIFY_DATABASE_URL.` (HTTP 503), the variable didn't reach the function. Set it manually: **Project configuration → Environment variables → Add a variable → `NETLIFY_DATABASE_URL`**, paste the connection string from the **Neon dashboard** (Netlify DB → open in Neon → connection string), scope it to **Builds + Functions + Runtime**, then redeploy. Never paste this value into the repo.
- The tables are created automatically the first time the app talks to the database — there is no SQL step. (Reference schema lives in `db/schema.sql` if you ever want it.)

### 3. Set your team passwords
- **Project configuration → Environment variables → Add a variable**:
  - `APP_PASSWORD` — the shared password your team logs in with.
  - `ADMIN_PASSWORD` — *(optional)* a separate password that unlocks deleting clients. Skip it and everyone with `APP_PASSWORD` can delete too.
  - `SESSION_SECRET` — *(optional but recommended)* a long random string (e.g. `openssl rand -hex 32`) used to sign login session tokens. Without it, the signing key is derived from `APP_PASSWORD` + `ADMIN_PASSWORD` so everything works with zero extra config — but then changing either password signs everyone out, and per-user login ([see below](#per-user-accounts)) stops working if you ever remove the shared passwords. Set it once and forget it.
  - `AGENCY_NAME` — *(optional)* the agency name shown on client portal pages (defaults to "Growth Atlas"). Portal share links themselves need no setup — they're unguessable per-client tokens you create in the app, and you can disable or regenerate them at any time to revoke access.
  - `STRIPE_SECRET_KEY` — *(optional)* your Stripe secret key; enables the "Payment link" buttons on the Revenue tab. Skip it and the feature stays hidden.
  - `STRIPE_WEBHOOK_SECRET` — *(optional, but needed for auto-marking paid)* the signing secret of a Stripe **webhook endpoint** (Stripe dashboard → Developers → Webhooks) pointed at `https://YOUR-SITE/api/stripe-webhook` and listening to the `checkout.session.completed` event. When a client pays through their link, the matching payment flips to **Paid** by itself.
  - `STRIPE_CURRENCY` — *(optional)* currency for payment links (defaults to `usd`).
  - `GSC_SERVICE_ACCOUNT_JSON` — *(optional)* enables the nightly Google Search Console sync. Three-step setup:
    1. **Create a service account**: in [Google Cloud Console](https://console.cloud.google.com/) create (or pick) a project, enable the **Google Search Console API**, then create a **service account** (no roles needed).
    2. **Download its JSON key** (service account → Keys → Add key → JSON) and paste the *entire file contents* as the value of this env var, scoped to **Functions**. Never commit the key to the repo.
    3. **Grant it access in Search Console**: for each client's property, open [Search Console](https://search.google.com/search-console) → Settings → Users and permissions → **Add user**, and add the service account's email (`...@...iam.gserviceaccount.com`) with at least **Restricted** access. Then set the matching property (e.g. `sc-domain:example.com` or `https://example.com/`) on the client in the CRM — data appears after the next nightly sync (05:30 UTC). A `403` in the sync logs means this step was missed for that property.

### 4. Deploy
- **Deploys → Trigger deploy → Deploy site.** You get a public link.
- Open it, enter your name and the team password, and you're in.

> Tip: any time you change an environment variable, trigger a fresh deploy so it takes effect.

---

## Invite your team
1. Send them the live link and the shared **team password**.
2. Each person enters their name + the password and starts working the board.
3. Give the **admin password** only to people who should be able to delete clients.

Or skip the shared password for day-to-day use and give people **personal accounts** — see the next section.

---

## Per-user accounts

Optional personal logins (email + password) that live **alongside** the shared team password — nothing changes for teams that keep using the shared password, and both can be used at the same time while you migrate.

**Create the first user:**
1. Log in with the shared password using the **admin** password (the "Team password" tab on the login screen).
2. Open the **Team** tab → **User accounts** panel → **Add user**. Enter their name, email, a password (min 8 characters) and a role (**Member** or **Admin**).
3. That person can now sign in via the **"My account"** tab on the login screen with their email + password. Their name and role come from their account (no more typing a name at login).

**Managing accounts** (admins only, Team tab): deactivate an account to block new logins without deleting it, reactivate it later, or delete it outright. Leaving the password blank when editing keeps the current password; filling it in resets it.

**Good to know:**
- Passwords are stored as salted **scrypt hashes** — never plaintext — and hashes are never sent to the browser.
- Logins hand the browser a signed, stateless **session token** (valid 30 days) instead of storing the password. Set `SESSION_SECRET` (recommended) so tokens survive password rotations; without it the signing key falls back to `APP_PASSWORD` + `ADMIN_PASSWORD`, which works with zero extra config but ties every session's validity to those passwords.
- Because tokens are stateless, **deactivating or deleting a user blocks their next login but does not kill an already-issued token** (up to 30 days). To revoke sessions immediately, rotate `SESSION_SECRET` (or the shared passwords, if you're on the fallback) and redeploy — that invalidates every outstanding token.
- **Migration / going passwordless:** once everyone has an account you *can* remove `APP_PASSWORD` / `ADMIN_PASSWORD` — but only if `SESSION_SECRET` is set, otherwise there is no signing key and the API fails closed for everyone. Removing the shared passwords disables the "Team password" login (and any browsers still on old shared-password sessions); email login keeps working.

---

## Run it locally (optional)
You need the Netlify CLI so the API function and database URL are available:
```
npm install
npm install -g netlify-cli
netlify link          # link to your Netlify site (for NETLIFY_DATABASE_URL)
netlify dev           # runs Vite + the function together
```
Copy `.env.example` to `.env` to set `APP_PASSWORD` / `ADMIN_PASSWORD` for local use. (Plain `npm run dev` serves the UI but not the `/api` function.)

---

## Project structure
```
.
├── index.html              App entry HTML
├── package.json            Scripts + dependencies
├── netlify.toml            Netlify build config (build, publish, functions dir)
├── vite.config.js          Vite + React setup
├── .env.example            Local dev env template (APP_PASSWORD / ADMIN_PASSWORD)
├── netlify/
│   ├── lib/
│   │   └── auth.js         Pure auth helpers: scrypt hashing + signed session tokens
│   └── functions/
│       ├── data.js         API: auth check + all DB reads/writes (Neon)
│       ├── rank-check.mjs  Scheduled daily DataForSEO rank checks (optional)
│       ├── gsc-sync.mjs    Scheduled nightly Google Search Console pull (optional)
│       └── stripe-webhook.mjs  Stripe webhook: marks payments paid (optional)
├── db/
│   ├── schema.sql          Reference schema (auto-created by the function)
│   └── seed-clients.sql    Optional: preload clients
└── src/
    ├── main.jsx            React entry point
    ├── App.jsx             Top-level: login vs. dashboard
    ├── lib/                Non-UI modules
    │   ├── api.js          Talks to /api/data + stores the session
    │   ├── constants.js    Statuses, sources, task types, pay states
    │   ├── format.js       money / month helpers
    │   ├── csv.js          CSV export builders + download
    │   ├── scope.js        Retainer scope vs delivered logic
    │   └── theme.js        Colors, borders, shared style tokens, global CSS
    └── components/         One file per screen / shared UI
        ├── Login.jsx           Team password or personal account login
        ├── Dashboard.jsx       Shell, nav, data loading, tab routing
        ├── Overview.jsx        Home dashboard: KPI rollups + overdue list
        ├── Activity.jsx        Activity feed (audit trail)
        ├── Clients.jsx         Clients list
        ├── Board.jsx           Kanban task board
        ├── Deliverables.jsx    Per-client deliverables + add/edit form
        ├── Keywords.jsx        Keyword-rank tracking (tab + shared rows/form)
        ├── Revenue.jsx         MRR, collected/pending, payment tracker
        ├── Team.jsx            Per-member workload
        ├── ClientForm.jsx      Add / edit client modal
        ├── ClientDetail.jsx    Client detail view + resources, portal link, report email
        ├── Portal.jsx          Public read-only client portal (/portal/:token)
        ├── ClientReport.jsx    Printable per-client monthly report + narrative
        ├── ClientScope.jsx     Retainer scope: included vs delivered per month
        └── ui.jsx              Small shared pieces (Field, Pick, Panel, RevCard...)
```

---

## Notes
- **Security model.** This is a lightweight internal tool: access is gated by a shared team password and/or per-user accounts. Logging in hands the browser a signed 30-day session token that it sends with each API request (the raw password is not stored in the browser), and the database is only reachable through the Netlify Function — never directly from the browser. Set strong passwords and share them carefully.
- **Uploaded files** are stored in **Netlify Blobs**, which is enabled automatically for any site with functions — no setup. Downloads are also password-gated (served through the function, never a public URL). Limit is 4 MB per file; for bigger assets, attach a link instead.
- **Keyword ranks are entered manually by default**; keywords with "Auto-check rank" ticked are refreshed daily by the scheduled DataForSEO function when `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` are set. Either way, when a keyword's rank changes the old value automatically rolls into "previous" so the up/down movement stays meaningful.
- **Built for 100+ clients.** All foreign keys are indexed (auto-created like the tables), status changes apply instantly (optimistic UI with background sync), refreshes never blank the screen, and every list has search/filter controls.
- Set each client's monthly fee in the client form — the Revenue tab rolls up from there.
- **Export to CSV**: each list (Clients, Deliverables, Keywords, Payments) has an "Export CSV" button that downloads the data — opens straight in Excel / Google Sheets. Runs entirely in the browser on already-loaded data.

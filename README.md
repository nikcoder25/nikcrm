# Growth Atlas — Online SEO Ops (team board)

A real, online, multi-user SEO tool. Your team logs in with a shared password and works the same board. Everything is saved in a real database, so whatever one person changes, everyone sees.

Built with **React + Vite** on the front end and **Netlify** end-to-end:
**Netlify DB (Neon Postgres)** for data, **Netlify Functions** for the API, and a simple **shared team password** for login. No separate database account to sign up for.

---

## What you get
- **Overview**: a home dashboard with rollup KPIs (clients, open tasks, deliverables delivered/overdue, MRR + collected, avg keyword rank), a **client-status breakdown** bar, a **"Needs attention"** list of everything overdue or over scope (including due follow-ups), a **"Recent activity"** feed of the latest client touchpoints, and a "Recent changes" audit panel. Optionally a scheduled function (`netlify/functions/overdue-digest.mjs`, 07:00 UTC daily) emails the overdue list to the team — set `RESEND_API_KEY` + `DIGEST_EMAIL`
- **Quick-jump search** (**⌘K / Ctrl-K** from anywhere, or the sidebar Search button): fuzzy-search every client and jump straight to their page, or hop to any section — keyboard-first (↑/↓/Enter/Esc)
- **Activity timeline**: inside each client's detail view, log every touchpoint — **note, call, email, or meeting** — with the author and a timestamp you can backdate. The newest interactions surface on the Overview's "Recent activity" feed, turning the board into a real relationship record
- **Follow-up reminders**: attach a **next-follow-up date** to any logged activity. Overdue and due-today follow-ups show up on the Overview's "Needs attention" list (click straight through to the client) and as a badge on the timeline entry; mark one done with a click
- **Client health score**: every client gets a computed **0–100 health score** (Healthy / Watch / At risk) from money owed, overdue & blocked work, keyword momentum, overdue follow-ups, and how recently they were engaged. Shown as a badge on the client list, the detail page, and filterable by health
- **Add to calendar (.ics)**: export a client's follow-ups and meetings as a standard **calendar file** that imports into Google / Apple / Outlook Calendar — one-way, no account connection needed
- **Clients**: add, edit, delete — status, source, package, team, dates, notes, monthly fee. Click any client for a linkable **detail view** (`/clients/:id`) with everything in one place, plus a **Resources** panel — attach links (Google Drive, Canva, Sheets…) *and* upload job files (stored in Netlify Blobs, up to 4 MB each)
- **Task Board** (kanban): Guest Post, On-Page, Backlink, Anchor Text, Blog, Audit, Schema. Assign people, filter by client/assignee, **drag cards** between To Do → In Progress → Done (the ‹ › buttons remain for mobile/keyboard)
- **Deliverables**: track what you owe each client — type, quantity, due date, and status (Planned / In Progress / Delivered / Blocked), grouped by client with a per-client delivered/total summary. **Monthly generation** creates the month's missing deliverables from each client's retainer scope in one click ("Generate this month", also available per client) — idempotent, so re-running only tops up the shortfall, never duplicates
- **Retainer / scope tracking**: set each client's agreed monthly scope (included quantity per deliverable type) and see included-vs-delivered per month with an **over scope / complete / to-go** flag — catches scope creep. Surfaced in the client detail, the Monthly Report, the client portal and the Overview's "Needs attention" list, and drives the monthly deliverable generation above
- **Keywords**: a Serpfox-style rank tracker. The tab groups keywords **by URL/client** — net change, best/worst rank, keyword count and a green/gray/red movement bar per group — with a **Last / Week / Month** period toggle. Expanding a group shows every keyword with rank, change, **search volume, search engine, location and desktop/mobile platform**, a per-keyword **rank-over-time chart** (rank 1 on top, date ticks, zoom), **starring**, and **bulk actions** (star / unstar / delete selected). **Bulk add** pastes up to 200 keywords at once (one per line, shared target URL / engine / location / platform). Optional **automatic daily rank checks** via DataForSEO: set `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` env vars and tick "Auto-check rank" on a keyword — a scheduled function (`netlify/functions/rank-check.mjs`, 06:00 UTC) looks up the target domain's live Google/Bing position and records the history; without the keys, tracking stays fully manual. Also surfaced inside each client's detail view
- **Backlinks tracker**: log every link-building placement per client — URL, anchor text, target page, domain rating, cost, placed date and a Prospect → Outreach → Placed → Live → Lost status with inline updates. Grouped by client with a live/total rollup, client + status filters and search; each client's detail view gets a compact backlinks panel and the printable Monthly Report gains a "Link building" section for links placed that month
- **AI Visibility / AEO tracking**: track whether AI answers (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini) cite each client for the prompts you care about — manual checks with a click-to-toggle cited ✓/✗, citation position and cited URL. Summary KPIs (prompts tracked, citation rate, per-engine breakdown), client + engine filters and search; changes to cited/position stamp "last checked" and append a history row, and the Monthly Report gains an "AI visibility" section with per-engine counts
- **Revenue**: MRR, collected vs pending per month, revenue by source, and a per-client payment tracker (Pending / Paid / Overdue). Optional **Stripe payment links**: with `STRIPE_SECRET_KEY` set, every unpaid row gets a "Payment link" button that creates (once) and copies a Stripe Payment Link for that client's monthly fee — and a webhook (`/api/stripe-webhook`) marks the payment **Paid automatically** when the client pays. Without the key the buttons simply don't appear
- **Monthly Report**: inside each client's detail view, generate a printable monthly snapshot — keyword rankings (current/previous/movement, top-10, avg, net improvement), an **Organic search** section when Search Console is linked (month totals vs previous month + top 10 queries), link building, AI visibility, deliverables with a delivered/total rollup, scope-delivered, and a saved free-text "wins" narrative. **Print / Export** opens a clean print-friendly layout (Save as PDF). A scheduled function (`netlify/functions/monthly-report-email.mjs`, 08:00 UTC on the 1st) **emails each opted-in client their report** for the month that just ended — set `RESEND_API_KEY` and a recipient per client in the detail view
- **Google Search Console integration** *(optional)*: link each client to their Search Console property (`sc-domain:example.com` or `https://example.com/`) and a scheduled function (`netlify/functions/gsc-sync.mjs`, 05:30 UTC) pulls their organic performance nightly via one agency-wide **Google service account** (`GSC_SERVICE_ACCOUNT_JSON` env var). The client detail view gets an **"Organic search"** panel — clicks + impressions for the last 28 days with change vs the previous 28, a daily-clicks chart, and a top-queries table — and feeds the Monthly Report's Organic search section. Without the env var everything stays hidden and manual
- **Google integration (sign-in + Gmail + Calendar)** *(optional)*: **Sign in with Google** on the login screen (matches existing team accounts — no auto-signup), and **per-user Gmail & Calendar**: each teammate connects their own Google account in Settings to **pull** recent Gmail messages to/from a client's contact address into their activity timeline, and **push** a follow-up or meeting straight to **Google Calendar**. A workspace-wide fallback account is still supported. Requires a one-time Google Cloud OAuth setup (see [Google integration](#google-integration-sign-in--per-user-gmail--calendar--optional))
- **Client portal**: give each client a private, read-only share link (`/portal/<token>`, no login) showing their keyword rankings with movement and rank-over-time charts, the month's deliverables, retainer scope progress and the saved monthly narrative — and nothing internal (no fees, notes or team data). Create, copy, disable/enable or regenerate the link from the client's detail view; regenerating or disabling revokes the old link instantly. Set the optional `AGENCY_NAME` env var to white-label the portal branding (defaults to "Growth Atlas"). The same panel also sets the **monthly report email** recipient used by the scheduled report emailer
- **Activity** log: a team-wide audit trail — who created/edited/deleted clients, tasks, keywords, deliverables, payments and more, with relative timestamps. Full feed in its own tab, plus a "Recent changes" panel on the Overview (distinct from the client touchpoint timeline above)
- **Team**: a workload view (who has how many clients and tasks) plus login management. Everyone logs in with one shared password (set an optional second password for admins), and admins can add optional **per-user accounts** (email + personal password) from the Team tab — see [Per-user accounts](#per-user-accounts). **Roles**: admins can delete clients and manage user accounts; everyone else can do everything else
- **CSV exports**: Clients, Deliverables, Keywords, Backlinks, AI visibility and Payments each have an "Export CSV" button — opens straight in Excel / Google Sheets, built entirely in the browser from already-loaded data
- **Background sync**: data refreshes every 60 seconds in the background (paused while the tab is hidden) and high-frequency changes (task moves, status flips, stars) apply optimistically — teammates' changes show up on their own and the screen never blanks mid-work

---

## Hosting options

The app runs on either of two setups — same code, same database:

1. **Netlify** (below): functions + hosting in one place.
2. **Hostinger + Cloudflare Workers**: static frontend on any web hosting
   (e.g. Hostinger shared/cloud), the API as a free Cloudflare Worker —
   see **[HOSTINGER-DEPLOY.md](HOSTINGER-DEPLOY.md)**. Useful when Netlify's
   free-tier limits are a problem (Workers' free tier is 100k requests/day).

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

Everything else (Stripe billing, Search Console, automatic rank checks, report/digest emails, portal branding) is optional — see [Optional integrations & environment variables](#optional-integrations--environment-variables).

### 4. Deploy
- **Deploys → Trigger deploy → Deploy site.** You get a public link.
- Open it, enter your name and the team password, and you're in.

> Tip: any time you change an environment variable, trigger a fresh deploy so it takes effect.

---

## Google integration (sign-in + per-user Gmail & Calendar) — optional

The app is fully functional without this. One Google OAuth client (and **one** redirect URI) powers two separate things:

- **Sign in with Google (SSO)** — a third option on the login screen. It only asks for `openid email profile`, matches an **existing** account in the Team tab by the Google email (accounts are never auto-created), and issues the same signed session token as the email/password login.
- **Per-user Gmail + Calendar** — each teammate connects **their own** Google account from **Settings** (a separate consent asking for read-only Gmail + Calendar events). Gmail imports and Calendar pushes then run as the current user. A legacy **workspace fallback** account (admin-connected) is still supported and is used for anyone who hasn't connected their own; a personal connection always takes precedence. All tokens are stored server-side in the database, per user — never sent to the browser.

**1. Create an OAuth client in Google Cloud**
- In the [Google Cloud Console](https://console.cloud.google.com/): create (or pick) a project.
- **APIs & Services → Enabled APIs & services → + Enable APIs** — enable the **Gmail API** and the **Google Calendar API**.
- **APIs & Services → OAuth consent screen** — configure it (External is fine), and add these scopes: `openid`, `email`, `profile`, `.../auth/gmail.readonly`, `.../auth/calendar.events`. While the app is in "Testing", add the Google accounts that will sign in / connect as **Test users**.
- **APIs & Services → Credentials → + Create credentials → OAuth client ID → Web application.**
  - **Authorized redirect URIs**: add exactly one — `<API-ORIGIN>/api/google`. On the Cloudflare deployment that is the **Worker** origin (e.g. `https://growth-atlas-api.YOURNAME.workers.dev/api/google`), NOT the static site; on Netlify it's the site origin (e.g. `https://your-site.netlify.app/api/google`). Every flow (sign-in and connect) goes through this single URI — they're told apart by the OAuth `state`.
- Copy the **Client ID** and **Client secret**.

**2. Set the environment variables**
- On Cloudflare: **Workers & Pages → your worker → Settings → Variables and Secrets** (on Netlify: Project configuration → Environment variables, scoped to Builds + Functions + Runtime):
  - `GOOGLE_CLIENT_ID` — the OAuth client ID.
  - `GOOGLE_CLIENT_SECRET` — the OAuth client secret.
  - `GOOGLE_REDIRECT_URI` — *(optional)* only if you want to pin the redirect; otherwise it defaults to `<api-origin>/api/google`. If you set it, it must match the Authorized redirect URI exactly.
- On the Cloudflare split deployment, `ALLOWED_ORIGIN` (wrangler.toml) must include the static site's origin — the OAuth callback only redirects browsers back to origins on that list.

**3. Use it**
- **Sign in**: login screen → **Google** → Continue with Google. Works for anyone whose email an admin added in the **Team** tab; others see "No account for this Google email".
- **Connect Gmail/Calendar**: **Settings** → **Connect your Google account** (any signed-in personal account; the shared team-password login has no profile to attach to). Admins can also connect/disconnect the workspace fallback there.
- Then on any client page: set the client's **Contact email** (in the client form) to enable **Sync Gmail**, and use **Add to Google Calendar** on any follow-up or meeting.

**Notes & limits**
- Signing in with Google never asks for mailbox access; the Gmail/Calendar consent is a separate, explicit step. Gmail access is **read-only**; Calendar access is limited to **events** the app creates. Disconnecting (Settings) deletes your stored tokens; deleting a user deletes theirs.
- Gmail sync imports up to ~15 recent messages matching the contact email per run, de-duplicated by message id, and logs each as an **email** activity — using the current user's connection, else the workspace fallback.

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

## Optional integrations & environment variables

Everything the app reads from the environment, in one place. Set these in Netlify (**Project configuration → Environment variables**) and trigger a redeploy. Each integration is a graceful no-op when its variable is missing — the app never breaks, the feature just stays hidden or skipped.

| Variable | What it enables · where to get it |
| --- | --- |
| `NETLIFY_DATABASE_URL` | **Required.** Neon Postgres connection string the API uses. Usually set automatically when you provision Netlify DB; otherwise copy it from the Neon dashboard (see [step 2](#2-add-a-database-netlify-db--neon)). |
| `APP_PASSWORD` | The shared team login password. You choose it. |
| `ADMIN_PASSWORD` | *(optional)* A second password that unlocks admin actions (deleting clients, managing user accounts). Skip it and everyone with `APP_PASSWORD` is an admin. |
| `SESSION_SECRET` | *(recommended)* Random string (`openssl rand -hex 32`) that signs login session tokens so sessions survive password rotations. |
| `AGENCY_NAME` | *(optional)* White-labels the client portal branding (defaults to "Growth Atlas"). |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Enables **automatic daily rank checks** (06:00 UTC) for keywords with "Auto-check rank" ticked. API credentials from [dataforseo.com](https://dataforseo.com/) (pay-as-you-go). |
| `RESEND_API_KEY` | Enables **all outgoing email** — the monthly client report emails and the daily overdue digest. Create a key at [resend.com](https://resend.com/) → API Keys. |
| `REPORT_FROM_EMAIL` | *(optional)* The From address for those emails; must be on a domain you verified in Resend. The `onboarding@resend.dev` default only delivers to your own Resend account's email. |
| `DIGEST_EMAIL` | Recipient(s) of the **daily overdue digest** (07:00 UTC), comma-separated for several. Without it the digest is skipped. |
| `STRIPE_SECRET_KEY` | Enables the **"Payment link"** buttons on the Revenue tab. Stripe dashboard → Developers → API keys. |
| `STRIPE_WEBHOOK_SECRET` | Auto-marks payments **Paid** when a client pays their link. Signing secret of a Stripe **webhook endpoint** (Stripe dashboard → Developers → Webhooks) pointed at `https://YOUR-SITE/api/stripe-webhook`, listening to `checkout.session.completed`. |
| `STRIPE_CURRENCY` | *(optional)* Currency for payment links (defaults to `usd`). |
| `GSC_SERVICE_ACCOUNT_JSON` | Enables the **nightly Google Search Console sync** (05:30 UTC). Full JSON key of a Google Cloud service account — setup below. |

**Search Console setup** (for `GSC_SERVICE_ACCOUNT_JSON`), three steps:
1. **Create a service account**: in [Google Cloud Console](https://console.cloud.google.com/) create (or pick) a project, enable the **Google Search Console API**, then create a **service account** (no roles needed).
2. **Download its JSON key** (service account → Keys → Add key → JSON) and paste the *entire file contents* as the value of this env var, scoped to **Functions**. Never commit the key to the repo.
3. **Grant it access in Search Console**: for each client's property, open [Search Console](https://search.google.com/search-console) → Settings → Users and permissions → **Add user**, and add the service account's email (`...@...iam.gserviceaccount.com`) with at least **Restricted** access. Then set the matching property (e.g. `sc-domain:example.com` or `https://example.com/`) on the client in the CRM — data appears after the next nightly sync. A `403` in the sync logs means this step was missed for that property.

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
├── .env.example            Local dev env template (all env vars, commented)
├── .github/workflows/
│   └── ci.yml              CI: lint + tests + build on every push/PR
├── netlify/
│   ├── lib/
│   │   ├── auth.js         Pure auth helpers: scrypt hashing + signed session tokens
│   │   └── auth.test.js    Unit tests for the auth helpers
│   └── functions/
│       ├── data.js         API: auth check + all DB reads/writes (Neon)
│       ├── google.js       Google OAuth + Gmail/Calendar sync (/api/google)
│       ├── rank-check.mjs  Scheduled daily DataForSEO rank checks (optional)
│       ├── gsc-sync.mjs    Scheduled nightly Google Search Console pull (optional)
│       ├── monthly-report-email.mjs  Scheduled monthly client report emails (optional)
│       ├── overdue-digest.mjs  Scheduled daily internal overdue digest (optional)
│       ├── stripe-webhook.mjs  Stripe webhook: marks payments paid (optional)
│       └── lib/
│           ├── email.mjs   Resend HTTP API wrapper (no SDK)
│           ├── google.mjs  Google service-account auth (JWT → access token)
│           └── html.mjs    Shared HTML-email rendering helpers
├── db/
│   ├── schema.sql          Reference schema (auto-created by the function)
│   └── seed-clients.sql    Optional: preload clients
└── src/
    ├── main.jsx            React entry point
    ├── App.jsx             Top-level: login vs. dashboard vs. portal route
    ├── lib/                Non-UI modules
    │   ├── api.js          Talks to /api/data + stores the session
    │   ├── constants.js    Statuses, sources, task types, pay states, AI engines, activity types
    │   ├── format.js       money / month / date-time helpers (+ format.test.js)
    │   ├── csv.js          CSV export builders + download
    │   ├── ics.js          iCalendar (.ics) export for follow-ups & meetings
    │   ├── health.js       Client health score (0–100) computation
    │   ├── google.js       Client for /api/google (status, connect, sync)
    │   ├── router.js       Tiny history-based router (+ router.test.js)
    │   ├── scope.js        Retainer scope vs delivered logic (+ scope.test.js)
    │   └── theme.js        Colors, borders, shared style tokens, global CSS
    └── components/         One file per screen / shared UI
        ├── Login.jsx           Team password or personal account login
        ├── Dashboard.jsx       Shell, nav, data loading, tab routing
        ├── Overview.jsx        Home dashboard: KPI rollups + overdue list
        ├── ActivityLog.jsx     Activity feed (audit trail: who changed what)
        ├── Clients.jsx         Clients list
        ├── Board.jsx           Kanban task board (drag-and-drop)
        ├── Deliverables.jsx    Per-client deliverables + add/edit form + monthly generation
        ├── Backlinks.jsx       Link-building tracker (tab + add/edit form)
        ├── Keywords.jsx        Serpfox-style rank tracker (tab + shared rows/forms/charts)
        ├── AiVisibility.jsx    AI answer citation (AEO) tracking
        ├── Revenue.jsx         MRR, collected/pending, payment tracker + Stripe links
        ├── Team.jsx            Per-member workload + user account management
        ├── ClientForm.jsx      Add / edit client modal
        ├── CommandPalette.jsx  ⌘K quick-jump search (clients + pages)
        ├── Activity.jsx        Per-client interaction timeline (note/call/email/meeting)
        ├── ClientDetail.jsx    Client detail view: resources, portal link, report email, GSC panel
        ├── Portal.jsx          Public read-only client portal (/portal/:token)
        ├── ClientReport.jsx    Printable per-client monthly report + narrative
        ├── ClientScope.jsx     Retainer scope: included vs delivered per month
        ├── Settings.jsx        Workspace settings: Google (Gmail/Calendar) connect
        └── ui.jsx              Small shared pieces (Field, Pick, Panel, RevCard...)
```

---

## Notes
- **Security model.** This is a lightweight internal tool: access is gated by a shared team password and/or per-user accounts. Logging in hands the browser a signed 30-day session token that it sends with each API request (the raw password is not stored in the browser), and the database is only reachable through the Netlify Function — never directly from the browser. Set strong passwords and share them carefully.
- **Uploaded files** are stored in **Netlify Blobs**, which is enabled automatically for any site with functions — no setup. Downloads are also password-gated (served through the function, never a public URL). Limit is 4 MB per file; for bigger assets, attach a link instead.
- **Keyword ranks are entered manually by default**; keywords with "Auto-check rank" ticked are refreshed daily by the scheduled DataForSEO function when `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` are set. Either way, when a keyword's rank changes the old value automatically rolls into "previous" so the up/down movement stays meaningful.
- **Built for 100+ clients.** All foreign keys are indexed (auto-created like the tables), status changes apply instantly (optimistic UI with background sync), refreshes never blank the screen, and every list has search/filter controls.
- Set each client's monthly fee in the client form — the Revenue tab rolls up from there.

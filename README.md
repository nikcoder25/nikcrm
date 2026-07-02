# Growth Atlas — Online SEO Ops (team board)

A real, online, multi-user SEO tool. Your team logs in with a shared password and works the same board. Everything is saved in a real database, so whatever one person changes, everyone sees.

Built with **React + Vite** on the front end and **Netlify** end-to-end:
**Netlify DB (Neon Postgres)** for data, **Netlify Functions** for the API, and a simple **shared team password** for login. No separate database account to sign up for.

---

## What you get
- **Overview**: a home dashboard with rollup KPIs (clients, open tasks, deliverables delivered/overdue, MRR + collected, avg keyword rank), a **client-status breakdown** bar, a **"Needs attention"** list of everything overdue, and a **"Recent activity"** feed of the latest client touchpoints
- **Quick-jump search** (**⌘K / Ctrl-K** from anywhere, or the sidebar Search button): fuzzy-search every client and jump straight to their page, or hop to any section — keyboard-first (↑/↓/Enter/Esc)
- **Activity timeline**: inside each client's detail view, log every touchpoint — **note, call, email, or meeting** — with the author and a timestamp you can backdate. The newest interactions surface on the Overview's "Recent activity" feed, turning the board into a real relationship record
- **Follow-up reminders**: attach a **next-follow-up date** to any logged activity. Overdue and due-today follow-ups show up on the Overview's "Needs attention" list (click straight through to the client) and as a badge on the timeline entry; mark one done with a click
- **Client health score**: every client gets a computed **0–100 health score** (Healthy / Watch / At risk) from money owed, overdue & blocked work, keyword momentum, overdue follow-ups, and how recently they were engaged. Shown as a badge on the client list, the detail page, and filterable by health
- **Add to calendar (.ics)**: export a client's follow-ups and meetings as a standard **calendar file** that imports into Google / Apple / Outlook Calendar — one-way, no account connection needed
- **Team login** with one shared password (set an optional second password for admins)
- **Roles**: admins can delete clients; everyone else can do everything else
- **Clients**: add, edit, delete — status, source, package, team, dates, notes, monthly fee
- **Monthly Report**: inside each client's detail view, generate a printable monthly snapshot — keyword rankings (current/previous/movement, top-10, avg, net improvement), deliverables with a delivered/total rollup, and a saved free-text "wins" narrative. **Print / Export** opens a clean print-friendly layout (Save as PDF)
- **Client detail view**: click any client to see everything in one place, plus a **Resources** panel — attach links (Google Drive, Canva, Sheets…) *and* upload job files (stored in Netlify Blobs, up to 4 MB each)
- **Task Board** (kanban): Guest Post, On-Page, Backlink, Anchor Text, Blog, Audit, Schema. Assign people, move To Do → In Progress → Done
- **Deliverables**: track what you owe each client — type, quantity, due date, and status (Planned / In Progress / Delivered / Blocked), grouped by client with a per-client delivered/total summary
- **Retainer / scope tracking**: set each client's agreed monthly scope (included quantity per deliverable type) and see included-vs-delivered per month with an **over scope / complete / to-go** flag — catches scope creep. Surfaced in the client detail, the Monthly Report, and the Overview's "Needs attention" list
- **Keywords**: manual keyword-rank tracking per client — current rank, movement vs the previous rank (up/down/same), target URL, and a **rank-over-time trend chart** (each rank change is recorded), with avg-rank and top-10 summaries. Also surfaced inside each client's detail view
- **Revenue**: MRR, collected vs pending per month, revenue by source, and a per-client payment tracker (Pending / Paid / Overdue)
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

### 4. Deploy
- **Deploys → Trigger deploy → Deploy site.** You get a public link.
- Open it, enter your name and the team password, and you're in.

> Tip: any time you change an environment variable, trigger a fresh deploy so it takes effect.

---

## Invite your team
1. Send them the live link and the shared **team password**.
2. Each person enters their name + the password and starts working the board.
3. Give the **admin password** only to people who should be able to delete clients.

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
│   └── functions/
│       └── data.js         API: auth check + all DB reads/writes (Neon)
├── db/
│   ├── schema.sql          Reference schema (auto-created by the function)
│   └── seed-clients.sql    Optional: preload clients
└── src/
    ├── main.jsx            React entry point
    ├── App.jsx             Top-level: login vs. dashboard
    ├── lib/                Non-UI modules
    │   ├── api.js          Talks to /api/data + stores the session
    │   ├── constants.js    Statuses, sources, task types, pay states, activity types
    │   ├── format.js       money / month / date-time helpers
    │   ├── csv.js          CSV export builders + download
    │   ├── ics.js          iCalendar (.ics) export for follow-ups & meetings
    │   ├── health.js       Client health score (0–100) computation
    │   ├── scope.js        Retainer scope vs delivered logic
    │   └── theme.js        Colors, borders, shared style tokens, global CSS
    └── components/         One file per screen / shared UI
        ├── Login.jsx           Name + team password
        ├── Dashboard.jsx       Shell, nav, data loading, tab routing
        ├── Overview.jsx        Home dashboard: KPI rollups + overdue list
        ├── Clients.jsx         Clients list
        ├── Board.jsx           Kanban task board
        ├── Deliverables.jsx    Per-client deliverables + add/edit form
        ├── Keywords.jsx        Keyword-rank tracking (tab + shared rows/form)
        ├── Revenue.jsx         MRR, collected/pending, payment tracker
        ├── Team.jsx            Per-member workload
        ├── ClientForm.jsx      Add / edit client modal
        ├── CommandPalette.jsx  ⌘K quick-jump search (clients + pages)
        ├── Activity.jsx        Per-client interaction timeline (note/call/email/meeting)
        ├── ClientDetail.jsx    Client detail view + resources (links & files)
        ├── ClientReport.jsx    Printable per-client monthly report + narrative
        ├── ClientScope.jsx     Retainer scope: included vs delivered per month
        └── ui.jsx              Small shared pieces (Field, Pick, Panel, RevCard...)
```

---

## Notes
- **Security model.** This is a lightweight internal tool: access is gated by a shared password that the browser sends with each API request, and the database is only reachable through the Netlify Function — never directly from the browser. Set strong passwords and share them carefully. For per-person accounts you'd add a real auth provider later.
- **Uploaded files** are stored in **Netlify Blobs**, which is enabled automatically for any site with functions — no setup. Downloads are also password-gated (served through the function, never a public URL). Limit is 4 MB per file; for bigger assets, attach a link instead.
- **Keyword ranks are entered manually** (no third-party rank API). When you change a keyword's rank, the old value automatically rolls into "previous" so the up/down movement stays meaningful.
- **Built for 100+ clients.** All foreign keys are indexed (auto-created like the tables), status changes apply instantly (optimistic UI with background sync), refreshes never blank the screen, and every list has search/filter controls.
- Set each client's monthly fee in the client form — the Revenue tab rolls up from there.
- **Export to CSV**: each list (Clients, Deliverables, Keywords, Payments) has an "Export CSV" button that downloads the data — opens straight in Excel / Google Sheets. Runs entirely in the browser on already-loaded data.

# Growth Atlas — Online SEO Ops (team board)

A real, online, multi-user SEO tool. Your team logs in with a shared password and works the same board. Everything is saved in a real database, so whatever one person changes, everyone sees.

Built with **React + Vite** on the front end and **Netlify** end-to-end:
**Netlify DB (Neon Postgres)** for data, **Netlify Functions** for the API, and a simple **shared team password** for login. No separate database account to sign up for.

---

## What you get
- **Team login** with one shared password (set an optional second password for admins)
- **Roles**: admins can delete clients; everyone else can do everything else
- **Clients**: add, edit, delete — status, source, package, team, dates, notes, monthly fee
- **Task Board** (kanban): Guest Post, On-Page, Backlink, Anchor Text, Blog, Audit, Schema. Assign people, move To Do → In Progress → Done
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
    │   ├── constants.js    Statuses, sources, task types, pay states
    │   ├── format.js       money / month helpers
    │   └── theme.js        Colors, borders, shared style tokens, global CSS
    └── components/         One file per screen / shared UI
        ├── Login.jsx           Name + team password
        ├── Dashboard.jsx       Shell, nav, data loading, tab routing
        ├── Clients.jsx         Clients list
        ├── Board.jsx           Kanban task board
        ├── Revenue.jsx         MRR, collected/pending, payment tracker
        ├── Team.jsx            Per-member workload
        ├── ClientForm.jsx      Add / edit client modal
        └── ui.jsx              Small shared pieces (Field, Pick, Panel, RevCard...)
```

---

## Notes
- **Security model.** This is a lightweight internal tool: access is gated by a shared password that the browser sends with each API request, and the database is only reachable through the Netlify Function — never directly from the browser. Set strong passwords and share them carefully. For per-person accounts you'd add a real auth provider later.
- Deliverables and keyword-rank tracking can be added next; the data layer is ready to extend.
- Set each client's monthly fee in the client form — the Revenue tab rolls up from there.

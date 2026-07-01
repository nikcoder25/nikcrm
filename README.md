# Growth Atlas - Online SEO Ops (login + team)

A real, online, multi-user version of your SEO tool. Team members sign up, log in, and work the same board. Built with **React + Supabase (login + database) + Netlify/Vercel (hosting)**.

Everything is saved in a real database, not in one browser. Whatever one person changes, everyone sees.

---

## What you get
- Email + password **login / signup**
- **Roles**: admin (you) can delete clients; members can do everything else
- **Clients**: add, edit, delete, with status, source, package, team, dates, notes
- **Task Board** (kanban): Guest Post, On-Page, Backlink, Anchor Text, Blog, Audit, Schema. Assign to people, move To Do -> In Progress -> Done
- **Revenue**: monthly recurring revenue (MRR), collected vs pending per month, revenue by source, and a per-client payment tracker (Pending / Paid / Overdue). Set each client's monthly fee in the client form; revenue rolls up from there.
- **Team** view: who has how many clients and tasks

---

## Setup (about 15 minutes, one time)

### 1. Create the database (Supabase, free)
1. Go to https://supabase.com , sign up, click **New project**. Pick a name and a password, wait ~2 min.
2. Open **SQL Editor** (left menu) > **New query**.
3. Open the file `supabase/schema.sql` from this folder, copy everything, paste, click **Run**.
4. (Optional) To preload your 11 clients: open `supabase/seed-clients.sql`, copy, paste in a new query, **Run**.

### 2. Get your keys
In Supabase: **Project Settings > API**. Copy:
- **Project URL**
- **anon public** key

### 3. Put keys in the app
1. In this folder, copy `.env.example` to a new file named `.env`.
2. Paste your URL and anon key into it.

### 4. Run it on your computer (to test)
Install Node.js first (https://nodejs.org). Then in this folder:
```
npm install
npm run dev
```
Open the link it prints (usually http://localhost:5173). Sign up with your email. That is your first account.

### 5. Make yourself admin
Back in Supabase **SQL Editor**, run (use your signup email):
```
update public.profiles set role = 'admin' where full_name = 'your@email.com';
```

---

## Put it online (so the team can use it)

You already use Netlify and Vercel. Either works.

### Netlify
1. Push this folder to a GitHub repo (or drag-drop the built `dist` folder).
2. On Netlify: **Add new site > Import** the repo.
3. Build command: `npm run build` . Publish directory: `dist` .
4. Add the two environment variables (**Site settings > Environment variables**): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Deploy. You get a public link.

### Vercel
Same idea: import the repo, framework **Vite**, add the same two environment variables, deploy.

---

## Invite your team
1. Send them the live link.
2. Each person clicks **Create account** and signs up.
3. They log in and start working the board. They stay **member** by default.
4. Only you (admin) can delete clients.

### Turn off email confirmation (optional, easier signup)
Supabase > **Authentication > Providers > Email** > turn off "Confirm email" if you want people to log in instantly without a confirmation email.

---

## Notes
- The old single-file tool (`seo-ops-system.jsx`) still works for solo use. This new app is the online, team version.
- Deliverables and keyword-rank tracking tables already exist in the database (`deliverables`, `keywords`). The UI for those can be added next; the foundation is ready.
- Keep your keys private. The `anon` key is safe for the frontend (protected by the database security rules in `schema.sql`); never share the `service_role` key.

## Want me to build the rest or deploy it for you?
Building and deploying a real app is much smoother in **Claude Code** (desktop) or **Cowork**, where I can run the setup, wire the keys, add the remaining tabs, and push it live for you step by step.

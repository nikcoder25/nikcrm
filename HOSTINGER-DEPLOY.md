# Running Growth Atlas on Hostinger (+ Cloudflare Workers)

Hostinger's shared/cloud website hosting serves static files (and PHP) but
cannot run this app's Node.js API. So the app splits in two — both halves free
to run:

- **Frontend** (the React app): static files uploaded to **Hostinger**.
- **API** (`/api/data`, `/api/google`, Stripe webhook, scheduled jobs): a
  **Cloudflare Worker** — free tier is 100,000 requests **per day**.
- **Database**: your existing **Neon Postgres** — unchanged, nothing to move.

Total time: ~30–45 minutes, one time.

---

## Step 0 — SECURE YOUR DATABASE FIRST (do this today)

Your data lives in Neon, not Netlify — but if the database was provisioned
through **Netlify DB** and never claimed, it is tied to the Netlify account.

1. Log in to Netlify → your site → **Extensions / Netlify DB** → follow
   **"Claim database"** to attach it to a free account at
   [neon.tech](https://neon.tech). (Already claimed? You're done.)
2. In the Neon dashboard, open your project → **Connection string** → copy it
   somewhere safe. It looks like
   `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`.
   This one string is your entire CRM's data — treat it like a password.

> If you can't get into Netlify at all, log in to neon.tech directly — if you
> ever claimed the DB it's there. Worst case, contact Netlify support before
> the account lapses.

## Step 1 — Deploy the API to Cloudflare (free)

You need [Node.js](https://nodejs.org) installed locally, and a free
[Cloudflare account](https://dash.cloudflare.com/sign-up) (no card needed).

From this repo's folder:

```bash
npm install
npx wrangler login          # opens a browser — approve access

# Required secrets (each command prompts you to paste the value):
npx wrangler secret put NETLIFY_DATABASE_URL   # the Neon connection string from step 0
npx wrangler secret put APP_PASSWORD           # your team login password
npx wrangler secret put ADMIN_PASSWORD         # optional admin password
npx wrangler secret put SESSION_SECRET         # run: openssl rand -hex 32  (or any long random string)

# Optional integrations — only the ones you use (same values as on Netlify):
# npx wrangler secret put GOOGLE_CLIENT_ID
# npx wrangler secret put GOOGLE_CLIENT_SECRET
# npx wrangler secret put STRIPE_SECRET_KEY
# npx wrangler secret put STRIPE_WEBHOOK_SECRET
# npx wrangler secret put DATAFORSEO_LOGIN
# npx wrangler secret put DATAFORSEO_PASSWORD
# npx wrangler secret put RESEND_API_KEY
# npx wrangler secret put GSC_SERVICE_ACCOUNT_JSON

npx wrangler deploy
```

The deploy prints your API's URL, e.g.
`https://growth-atlas-api.<your-subdomain>.workers.dev`. **Copy it.**

Now allow your website to call it: edit `wrangler.toml` → set

```toml
ALLOWED_ORIGIN = "https://yourdomain.com,https://www.yourdomain.com"
```

(use the domain your Hostinger site is served from) and run
`npx wrangler deploy` once more.

## Step 2 — Build the frontend pointed at the Worker

```bash
VITE_API_BASE=https://growth-atlas-api.<your-subdomain>.workers.dev npm run build
```

(Use your real Worker URL. No trailing slash.) This produces a `dist/` folder.

## Step 3 — Upload to Hostinger

1. hPanel → your website → **File Manager** → open **public_html**.
2. Delete any placeholder files, then upload **the contents of `dist/`**
   (including the hidden `.htaccess` — enable "show hidden files" if needed;
   it makes page refreshes on `/clients/...` links work).
   Tip: zip `dist/`, upload the zip, extract in File Manager, move the files up.
3. Open your domain — log in with your team password. Done. 🎉

## Step 4 — Re-point the optional integrations (only if you use them)

- **Google (Gmail/Calendar)**: Google Cloud Console → your OAuth client →
  add `https://<your-worker-url>/api/google` as an **Authorized redirect URI**.
- **Stripe**: Dashboard → Webhooks → change the endpoint to
  `https://<your-worker-url>/api/stripe-webhook`.
- **Scheduled jobs** (rank checks, GSC sync, report emails, overdue digest)
  run automatically as Cloudflare cron triggers — nothing to do.

## Updating the app later

```bash
npx wrangler deploy                                   # API changes
VITE_API_BASE=https://<worker-url> npm run build      # frontend changes →
#   then re-upload dist/ to public_html
```

## Notes & gotchas

- **Previously uploaded client files** (stored in Netlify Blobs) do not carry
  over — file bytes now live inside your Postgres database (portable
  everywhere). Re-upload anything you still need via each client's Resources
  panel.
- The **Netlify deployment still works** as before if you ever go back — same
  code, same database, nothing was removed.
- If login says "Login isn't set up yet", a required secret is missing — re-run
  the `wrangler secret put` commands from step 1.
- If the browser console shows CORS errors, `ALLOWED_ORIGIN` in `wrangler.toml`
  doesn't exactly match your site's origin (scheme + domain, no trailing
  slash). Fix and `npx wrangler deploy`.

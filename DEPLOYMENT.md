# Production Deployment — Hostinger (Business/Cloud) + GitHub + Supabase

Exact, ordered steps. Do them top to bottom.

**Domain:** `investor.socialriser.com` (subdomain of socialriser.com you
already own — zero extra cost). **Brand/app name:** Investor.
**Android package id:** `com.socialriser.investor` (already set everywhere).

**Architecture (why each piece lives where it lives):**

| Piece | Where | Why |
|---|---|---|
| Website (Next.js) | Hostinger **Node.js Web App** on your Business/Cloud plan | [Officially supported](https://docs.hostinger.com/node.js/creating-an-app): Git connect, auto-deploy on push, Node 18/20/22/24. `next start` runs as a real server, so per-request rendering works |
| Scraper (every 30 min) | **GitHub Actions** (free) | Hostinger web hosting has no supported Python runtime ([Hostinger recommends VPS for Python](https://www.hostinger.com/tutorials/install-pip-in-ubuntu/)); Actions is always-on and already wired up in `.github/workflows/scrape.yml` |
| Database | Supabase (free tier) | Postgres + REST, row-level security already in `database/schema.sql` |
| Domain + DNS | Hostinger | You already have the account |

Total cost: **₹0/month** + ₹2,000 one-time Play Store fee. (The domain is
a subdomain of socialriser.com, which you already own.)

---

## Phase 0 — Domain (done ✅)

Everything is pre-configured for `investor.socialriser.com` with package id
`com.socialriser.investor`:

- `app/twa-manifest.reference.json` — host, icon URLs, package id ✅
- `web/public/.well-known/assetlinks.json` — package name ✅
- `web/lib/config.js` — brand name "Investor" ✅

The subdomain itself gets created in Phase 3 step 7, when you attach it to
the web app in hPanel — nothing to buy, nothing to do now.

> The package id can never change after the first Play Store upload — it is
> deliberately fixed now.

## Phase 1 — Supabase database (done ✅)

1. [supabase.com](https://supabase.com) → **New project**
   - Region: **Mumbai (ap-south-1)** — closest to your users and to NSE.
   - Save the database password somewhere safe (not needed by the app, but
     needed to restore access later).
2. **SQL Editor → New query** → paste ALL of
   [`database/schema.sql`](database/schema.sql) → **Run**. You should see
   "Success. No rows returned".
3. **Settings → API** — copy three values:

| Value | Used in |
|---|---|
| Project URL | Phase 2 secret + Phase 3 env var |
| `anon` `public` key | Phase 3 env var (safe in browser) |
| `service_role` key | Phase 2 secret ONLY — never in the website |

> Free tier pauses after ~1 week without traffic. The 30-minute scraper
> keeps it permanently awake, so this stops mattering after Phase 2.

## Phase 2 — GitHub repo + scraper goes live (done ✅)

1. Create a GitHub account if you don't have one → **New repository**
   (private is fine). Ours is `Yashaswi-Anand/investor-tracker`.
2. Push this project (secrets are already git-ignored):

   ```bash
   cd "C:\Users\yasha\OneDrive\Desktop\AI Projects\IPO Tracker"
   git init -b main
   git add .
   git commit -m "IPO tracker: web + scraper + TWA config"
   git remote add origin https://github.com/Yashaswi-Anand/investor-tracker.git
   git push -u origin main
   ```

3. Repo → **Settings → Secrets and variables → Actions → New repository
   secret** — add exactly two:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_KEY` = the `service_role` key
4. **Actions** tab → workflow **scrape** → **Run workflow** (manual test).
5. Wait ~1 minute, open the run → the log should end with
   `Done in …s — N IPOs, …`.
6. Confirm in Supabase → **Table Editor → ipos** — rows are there.

That's the scraper deployed: it now runs every 30 minutes forever, no
machine of yours involved. (`.github/workflows/scrape.yml` defines it.)

### Agar GitHub Actions se NSE block ho (403 / "NSE returned no records")

NSE sometimes blocks datacenter IPs. If the manual run in step 4 fails that
way, in order of preference:

1. **Retry once** — transient blocks happen.
2. **Hostinger hPanel cron** — only if your plan's SSH has Python:
   ```bash
   ssh YOUR_USER@YOUR_HOST -p 65002        # from hPanel -> SSH Access
   python3 --version                        # exists?
   pip3 install --user requests beautifulsoup4
   ```
   If both work: upload `scraper/` via File Manager, then hPanel →
   **Cron Jobs → Create** → type **Custom**:
   ```
   cd /home/YOUR_USER/scraper && SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 run_once.py
   ```
   Schedule: every 30 minutes.
3. **Cheapest Hostinger KVM VPS** (~₹300/mo) — you said you're open to
   buying one; a system cron there is bulletproof. Ask and I'll write the
   exact VPS runbook.

## Phase 3 — Website live on Hostinger (done ✅)

Based on [Hostinger's Node.js Web Apps docs](https://docs.hostinger.com/node.js/creating-an-app)
and their [Next.js deploy guide](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/):

1. hPanel → **Websites → Add Website → Node.js Web App** (wording may be
   "Deploy Web App" / "Node.js Apps").
2. **Import Git Repository** → authorize GitHub → pick `investor-tracker`.
3. **Root directory:** Hostinger auto-detected `web` (verified) — the
   `publish-web-branch` fallback workflow was not needed.
4. Build settings (auto-detected as Next.js; verify against
   [Hostinger's own Next.js starter](https://github.com/agneliutkiene/deploy-nextjs)):
   - Install: `npm ci`
   - Build: `npm run build`
   - Start: `npm run start -- -p $PORT`  ← the `$PORT` part is required
   - Node version: 20 (or 22)
5. **Environment variables** — add three:
   ```
   NEXT_PUBLIC_SUPABASE_URL      = https://YOUR-PROJECT-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = (anon public key)
   NEXT_PUBLIC_SITE_URL          = https://investor.socialriser.com
   ```
6. **Deploy.** First build takes a few minutes. Open the temporary URL
   Hostinger gives — the dashboard should show live IPO data (the scraper
   already filled the database in Phase 2).
7. **Attach the domain:** in the web app's settings → Domains → assign
   `investor.socialriser.com` (bought at Hostinger, so DNS wires up automatically;
   SSL certificate is issued for you). Wait for HTTPS to go green.
8. **PWA check (required before the app):** open
   `https://investor.socialriser.com` in desktop Chrome:
   - DevTools → Application → **Manifest**: no errors, icons load
   - DevTools → Application → **Service Workers**: `activated and running`
   - DevTools → **Lighthouse** → run the PWA/installability audit → pass
   - Address bar shows the install icon
   These four must pass — the Android app cannot work otherwise
   (details: [`app/README.md`](app/README.md) Step 0).

After this phase: **every future change = edit code → `git push` → site
auto-updates → app auto-updates.** No republishing, ever.

**Verified live on 20 Aug 2026:** all endpoints 200, service worker
`activated` on HTTPS, manifest valid (3 icons, standalone), JSON-LD valid.
One note: Hostinger's proxy does not forward the custom `Cache-Control`
header on `/sw.js` (it arrives with none). Registration still works; the
only effect is that Chrome may cache `sw.js` for up to 24 h, so service
worker *logic* changes can take up to a day to reach installed apps. Site
content is unaffected.

## Phase 4 — Play Store app (1–3 days incl. Google review)

Full walkthrough with screenshots-level detail:
[`app/README.md`](app/README.md). Condensed order:

1. [Play Console](https://play.google.com/console) developer account —
   ₹2,000 one-time, identity verification can take a day.
2. On your PC:
   ```bash
   npm install -g @bubblewrap/cli
   cd app
   bubblewrap init --manifest https://investor.socialriser.com/manifest.webmanifest
   bubblewrap build
   ```
   Use the package id chosen in Phase 0. **Back up `android.keystore` +
   passwords immediately** — losing them permanently locks you out of
   updating the app.
3. Play Console → Create app → upload `app-release-bundle.aab` to
   **Internal testing** → install on your own phone.
4. **Digital Asset Links — the two-fingerprint step** (this is what removes
   the browser bar; most-missed step):
   - Local key: `keytool -list -v -keystore android.keystore -alias investor`
   - Google's key: Play Console → Test and release → Setup → **App signing**
   - Put BOTH SHA-256 values in
     [`web/public/.well-known/assetlinks.json`](web/public/.well-known/assetlinks.json)
     → `git push` (site redeploys itself).
   - Verify: `https://investor.socialriser.com/.well-known/assetlinks.json`
5. Store listing: title, descriptions, phone screenshots (screenshot the
   live site), 512×512 icon (`web/public/icons/icon-512.png`), feature
   graphic 1024×500.
   - **Privacy policy URL:** `https://investor.socialriser.com/privacy` — the page
     already exists on the site.
   - **Data safety form:** declare *no data collected* (true for this app —
     keep it true, or update both the form and `/privacy` together).
6. Promote Internal testing → **Production** → submit for review.

## Phase 5 — Day-2 operations (roz ka kaam)

- **GMP is automatic** (`GMP_SOURCE=ipowatch` in the scrape workflow) and
  refreshes every 30 minutes; the site shows it with a day-over-day change and
  a per-IPO history table. To override one IPO by hand:
  ```sql
  update ipos set gmp = 62, locked = '{gmp}' where slug = 'company-slug';
  ```
  `locked` guarantees the scraper never overwrites your value, and the
  history keeps building from it automatically.
- **Editorial content** (about/strengths/risks/financials): see the
  `manual` examples in [`README.md`](README.md).
- **Health check** — is the scraper alive?
  ```sql
  select started_at, ok, records, message from scrape_runs
  order by started_at desc limit 10;
  ```
- **Scraper logs**: GitHub repo → Actions tab → latest `scrape` run.

## Go-live checklist

- [ ] Supabase `ipos` table has rows
- [ ] GitHub Action `scrape` green on schedule (check after an hour)
- [ ] `https://investor.socialriser.com` shows live data over HTTPS
- [ ] `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/privacy` all load
- [ ] Chrome PWA installability audit passes
- [ ] Google Search Console: add property, submit `sitemap.xml`
- [ ] App installed from Internal testing, no address bar visible
- [ ] `android.keystore` backed up in two places

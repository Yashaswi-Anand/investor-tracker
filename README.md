# Investor — IPO Tracker (investor.socialriser.com)

Live IPO tracking for India — GMP, price band, lot size, subscription status,
allotment and listing dates for Mainboard and SME IPOs.

One website. One Android app that **is** that website. Change the site, and
the app changes — no rebuild, no Play Store review.

```
        ┌──────────────────────────────┐
        │  scraper/  (runs hourly)     │   NSE official API + optional GMP
        └───────────────┬──────────────┘
                        │ writes
                        ▼
        ┌──────────────────────────────┐
        │  Supabase (Postgres)         │   ipos, gmp_history, subscription_history
        └───────────────┬──────────────┘
                        │ reads (anon key, read-only)
                        ▼
        ┌──────────────────────────────┐
        │  web/  Next.js 15 → Hostinger│   SEO-optimised website
        └───────────────┬──────────────┘
                        │ same URL, wrapped
                        ▼
        ┌──────────────────────────────┐
        │  app/  Android TWA → Play    │   never needs republishing
        └──────────────────────────────┘
```

## Folder map

| Folder | What it is | Language |
|---|---|---|
| [`scraper/`](scraper) | Scheduler that scrapes IPO data into the database | Python 3.12 |
| [`web/`](web) | Website + PWA (this is also the app's content) | Next.js 15, JavaScript |
| [`app/`](app) | Android TWA shell configuration | Bubblewrap / Android |
| [`database/`](database) | Postgres schema | SQL |

## What updates without any republish

| Change | Website | Android app |
|---|---|---|
| New IPO, GMP, subscription figures | instant — pages render per request; data is at most an hour old (scraper cadence) | same |
| Page layout, colours, new pages, new features | on deploy | same, instantly |
| App name, launcher icon, package id | — | needs an APK rebuild |

---

## 1. Database setup (5 minutes)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Open **SQL Editor → New query**, paste all of
   [`database/schema.sql`](database/schema.sql), and **Run**.
3. Copy your keys from **Settings → API**:

| Key | Goes in | Why |
|---|---|---|
| Project URL | both `scraper/.env` and `web/.env.local` | where the database lives |
| `anon` public key | `web/.env.local` | read-only, safe in the browser |
| `service_role` key | `scraper/.env` only | write access — **never** put it in `web/` |

> The free tier pauses a project after ~1 week of no traffic. Once the
> scheduler is running hourly this stops happening.

## 2. Scraper

```bash
cd scraper
pip install -r requirements.txt
cp .env.example .env        # then fill in the two Supabase values
```

Test it without touching the database:

```bash
python run_once.py --dry-run
```

Run it for real, once:

```bash
python run_once.py
```

Run it forever, once an hour:

```bash
python scheduler.py
```

On Windows just double-click `test-scraper.bat`, `run-scraper-once.bat`, or
`run-scraper-schedule.bat`.

### What it collects

From NSE's public API — **official exchange data, no API key needed**:

company name, symbol, board (Mainboard/SME), status, open/close dates,
price band, **lot size**, face value, issue size, minimum investment, and
QIB / NII / Retail / total subscription.

### GMP

GMP is unofficial — no exchange publishes it, so it cannot come from NSE.
Two options, set with `GMP_SOURCE` (production uses `ipowatch`):

- **`ipowatch`** — reads the public, server-rendered GMP tables on
  ipowatch.in once per run. `sources/gmp.py` honours `robots.txt`, identifies
  itself with a real User-Agent, and parses tables by their header row (so a
  "Name | Price | GMP" history table can never be mistaken for the live one).
  Sites that serve GMP only through JavaScript / reCAPTCHA-gated requests are
  deliberately not supported. GMP is shown with an "unofficial" disclaimer —
  check the source site's terms before relying on it commercially.
- **`none`** — enter GMP yourself in the Supabase table editor (lock it with
  `locked = '{gmp}'` so the scraper never overwrites it).

The website shows the latest GMP with day-over-day change on the dashboard,
and a per-IPO **GMP History** table (one row per day) plus trend bars on every
detail page.

### Nothing you type by hand is ever overwritten

Two mechanisms, both enforced in [`scraper/db.py`](scraper/db.py):

1. **`manual` jsonb column** — your editorial content (about, financials,
   strengths, risks). The scraper never includes it in any payload.
2. **`locked` array** — list any column names there and the scraper strips
   them from the update. To hand-manage GMP for one IPO:

   ```sql
   update ipos
   set gmp = 62, locked = '{gmp}'
   where slug = 'some-ipo-slug';
   ```

   Add editorial content the same way:

   ```sql
   update ipos set manual = '{
     "about": "Company description...",
     "strengths": ["Market leader", "Strong margins"],
     "risks": ["Customer concentration"],
     "financials": {"Revenue FY26": "₹1,200 Cr", "PAT FY26": "₹180 Cr"}
   }'::jsonb
   where slug = 'some-ipo-slug';
   ```

Empty values are also dropped from every payload, so a source that goes
quiet can never blank out data you already have.

### One caveat: the slug is derived from the company name

`slug` is the primary key and is generated from the company name, so if NSE
changes how a company is spelled ("Acme Industries Ltd" -> "Acme Industries
Limited") the next run inserts a **second row** and the original — along with
its `manual` content and `locked` columns — is orphaned.

It is rare, but check for it after any run that reports more IPOs than you
expected:

```sql
-- Near-duplicate slugs sharing a symbol
select symbol, array_agg(slug), count(*)
from ipos where symbol is not null
group by symbol having count(*) > 1;
```

To merge, copy the curated columns across and delete the stale row:

```sql
update ipos new
set manual = old.manual, locked = old.locked, gmp = old.gmp
from ipos old
where new.slug = 'new-slug' and old.slug = 'old-slug';

delete from ipos where slug = 'old-slug';
```

### Health check

Every run logs to the `scrape_runs` table:

```sql
select started_at, ok, records, message, duration_ms
from scrape_runs order by started_at desc limit 20;
```

## 3. Website

```bash
cd web
npm install
cp .env.example .env.local  # fill in Project URL + anon key
npm run dev                 # http://localhost:3000
```

Or double-click `run-website.bat`.

Built in: server-rendered pages (rendered per request, no stale cache), per-page
`generateMetadata`, JSON-LD structured data (ItemList + FAQPage), dynamic
`sitemap.xml` and `robots.txt`, dark mode, and a mobile card layout that
becomes a table on desktop.

### Production deployment

The site runs on **Hostinger Node.js Web Apps** (Business plan), auto-deployed
from this repo on every push to `main`. The scraper runs on **GitHub
Actions** hourly. Full step-by-step runbook: [`DEPLOYMENT.md`](DEPLOYMENT.md).

Live: https://investor.socialriser.com

### Where to run the scheduler in production

The scraper needs a machine that is always on. Cheapest options:

| Option | Cost | Notes |
|---|---|---|
| **GitHub Actions cron (in use)** | free | `.github/workflows/scrape.yml`, hourly; secrets `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` |
| Any small VPS | ~₹300/mo | run `scheduler.py` under `systemd` |
| Your PC | free | fine while testing; data stops when the machine sleeps |

## 4. Android app

See [`app/README.md`](app/README.md) for the full Bubblewrap → Play Store
walkthrough. Short version:

```bash
npm install -g @bubblewrap/cli
cd app
bubblewrap init --manifest https://investor.socialriser.com/manifest.webmanifest
bubblewrap build
```

Then paste your signing SHA256 into
[`web/public/.well-known/assetlinks.json`](web/public/.well-known/assetlinks.json)
and redeploy the site — that is what removes the browser address bar and
makes it look native.

**Back up `app/android.keystore` and its passwords.** Losing them means you
can never update the app on Play Store.

### App icons

```bash
cd web
python scripts/make_icons.py
```

Regenerates every icon size from one script. Edit the colours or design in
[`web/scripts/make_icons.py`](web/scripts/make_icons.py) and re-run.

---

## Disclaimer

GMP (grey market premium) is unofficial and indicative only. This is not
investment advice. Data comes from NSE and third-party sources — always
verify on NSE/BSE before applying to any IPO.

# PROJECT_CONTEXT.md

**Complete handover context for investor.socialriser.com.**
If the chat history is gone, read this file top to bottom and you can continue
work without it.

| | |
|---|---|
| Product | **Investor** — live IPO tracker for India (Mainboard + SME) |
| Live URL | https://investor.socialriser.com |
| Repo | `Yashaswi-Anand/investor-tracker`, branch `main` |
| Owner | Yashaswi Anand (`vighnesh.prompt@gmail.com`), brand name **Socialriser** |
| Written against | commit `a648dd6`, 10 Sep 2026 · 116 commits · 177 scraper tests passing |
| Last verified | 2 Oct 2026 |

Companion docs, both still useful but **stale in places** (see
[§11](#11-known-defects-and-stale-documentation)):
`README.md` (setup, folder map), `DEPLOYMENT.md` (Hostinger steps).
This file supersedes both where they disagree.

---

## 1. Read this first — the ten things that matter

1. **`/allotment` is hidden at the owner's explicit request** (10 Sep 2026).
   The page works; nothing links to it and it is `noindex`. Do not re-link it.
   See [§8](#8-the-allotment-feature).
2. **The house defect is "a missing value read as a measurement."** Five
   instances in the history, four on one day. When reading a number from a
   third party, distinguish **zero**, **null** and **absent** explicitly, or
   you will write a fabricated figure over a real one.
3. **Rows carried in by `db.fetch_unfinished` are *skeletons*** — slug, name,
   status, symbol, dates. No registrar, no board, no price band. Any new
   pipeline stage that reads a field off the row will silently do nothing for
   every closed issue. This bug has shipped **three times**.
4. **`details` jsonb is written back wholesale.** Only `pipeline.merge_details`
   prevents data loss. A new stage must *copy-then-add*, never assign.
5. **The cron is unreliable by design of GitHub, not by bug.** `37 */2 * * *`,
   measured as low as 3 runs/day. Do not "fix" it by tightening the schedule —
   that has been tried three times.
6. **Env var changes need a rebuild, not a restart.** Every web var is
   `NEXT_PUBLIC_`, baked in at `npm run build`.
7. **Caching has masked a deploy twice.** When verifying live, append a
   cache-buster (`?cb=$RANDOM`) and check *every* stylesheet the page loads,
   not just the first.
8. **The scraper never touches a PAN, never solves a CAPTCHA, never sends an
   identifier anywhere.** See [§8.3](#83-what-was-ruled-out-and-why) — this is
   a researched, deliberate boundary, not an oversight.
9. **Deploy only when the owner asks.** Push to `main` → Hostinger rebuilds →
   live in 40–90 s. There is no staging.
10. **Commit messages are the project's real documentation.** They are long and
    explain *why*. `git log` is the first place to look when something seems odd.

---

## 2. What the product is

A server-rendered site that answers, for every Indian IPO: when it opens and
closes, the price band and lot size, the minimum investment, the grey market
premium (GMP) and its history, subscription by category, the timetable through
to listing, the share price after listing, and the offer documents.

Three properties shape everything:

- **Data freshness over everything.** Pages render per request so a cached GMP
  is never shown.
- **Never state a number the source did not state.** No estimation, no
  interpolation, no filling a gap with a plausible value. An absent value is
  shown as absent.
- **No advice.** No apply/avoid verdict, no rating, no target price. The owner
  is not a SEBI-registered adviser and the site says so.

The Android app is a **TWA** — it *is* the website in a shell, so a site deploy
updates the app with no Play Store review.

---

## 3. Repo map

```
scraper/              Python 3.12 ETL. Writes to Supabase. No ORM, REST only.
  config.py           EVERY url, endpoint and tuning knob. Secrets from env only.
  pipeline.py         run() — the nine-step orchestrator.
  db.py               The only writer. Locks, merge-upsert, history, run log.
  util.py             Pure parsing + the IST clock + the status ladder.
  run_once.py         Entry point. `--dry-run` needs no DB keys.
  scheduler.py        Always-on loop alternative to the cron.
  maintenance.py      Hand-run data repairs. Separate entry point on purpose.
  sources/
    nse.py            Official source for everything except GMP. Biggest file.
    gmp.py            Grey market premium + the shared robots.txt gate + matcher.
    timetable.py      Allotment/listing dates, registrar, company blob (fallback).
    company.py        Parses the company prose/financials out of that page.
    listing.py        Listing price from the NSE bhavcopy.
    prices.py         Daily OHLC bars for the post-listing chart.
    kfin.py           KFin per-issue lookup ids (public JS bundle). No lookups.
    handoff.py        Bigshare/MUFG company-list names. No lookups.
  tests/              177 tests. test_parsing.py is the big one.

web/                  Next.js 15 App Router, JavaScript (no TypeScript).
  app/                Routes + components + globals.css (the design system).
  lib/                Pure modules: data, format, bids, bars, config, registrars…
  public/             Icons, llms.txt, sw.js, Google verification file.

database/
  schema.sql          Four tables, RLS, indexes, trigger. Re-runnable.
  cleanup_zero_subscription_history.sql   One-off repair (already applied).

.github/workflows/
  scrape.yml              The cron. Two secrets.
  publish-web-branch.yml  Mirrors web/ to the web-deploy branch.
  maintenance.yml         Manual only, triple-gated.

app/                  Android TWA config (Bubblewrap). Mostly reference.
tools/make_icons.py   Current icon generator (teal). See §11 for the stale twin.
```

---

## 4. Architecture

```
        NSE official API   investorgain / ipowatch / ipocentral (GMP)
        chittorgarh (timetable+company)   NSE bhavcopy (prices)
        KFin bundle / Bigshare HTML / MUFG list (registrar names & ids)
                            │
                            ▼
        ┌──────────────────────────────────┐
        │ scraper/   GitHub Actions cron    │   37 */2 * * *  (≤12 runs/day)
        │            pipeline.run()         │   secrets: SUPABASE_URL,
        └──────────────┬───────────────────┘             SUPABASE_SERVICE_KEY
                       │ merge-upsert, service_role (bypasses RLS)
                       ▼
        ┌──────────────────────────────────┐
        │ Supabase Postgres                 │  ipos · gmp_history ·
        │                                   │  subscription_history · scrape_runs
        └──────────────┬───────────────────┘
                       │ SELECT only, anon key, RLS enforced
                       ▼
        ┌──────────────────────────────────┐
        │ web/  Next.js 15 → Hostinger      │  push to main → rebuild → live
        │       Node.js Web App, root `web` │  behind Hostinger CDN ("hcdn")
        └──────────────┬───────────────────┘
                       │ same URL, wrapped
                       ▼
        ┌──────────────────────────────────┐
        │ app/  Android TWA → Play Store    │  never needs republishing
        └──────────────────────────────────┘
```

---

## 5. The scraper

### 5.1 `pipeline.run()` — nine steps, in order

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | NSE fetch | `all-upcoming-issues`, `ipo-current-issue`, then per-IPO `ipo-detail` and (only when open) `ipo-active-category` | `rows` |
| 1b | Carry-forward | `db.fetch_unfinished` | appends **skeleton** rows NSE has dropped |
| 2 | GMP | investorgain → ipowatch → ipocentral | `row.gmp`, `gmp_updated_at` |
| 3 | Existing rows | `db.fetch_existing` | the `existing` map (locks, stored details, dates, board) |
| 4 | Timetable + company | chittorgarh, budgeted | dates, registrar, `details.about/financials/…` |
| 5 | KFin ids + handoff names | KFin bundle, Bigshare HTML, MUFG list | `details.lookup`, `details.handoff` |
| 6 | Listing price | NSE bhavcopy, budgeted | `listing_price`, `listing_gain_pct` |
| 7 | Daily bars | NSE bhavcopy | `details.prices` |
| 8 | Derive | — | `status`, `min_investment`, `estimated_listing` |
| 9 | Write | — | `ipos` upsert, two history tables, `scrape_runs` |

Aborts only if step 1 returns **no rows at all**. Every later step is wrapped so
a third-party outage degrades rather than fails the run.

### 5.2 Invariants you must not break

- **An unreachable endpoint is not an empty list.** Conflating them makes an
  outage look like "no IPOs today."
- **Empty values never overwrite.** `apply_locks` drops `None`, blank strings
  and empty collections, so a source that returns `""` for a registrar it does
  not know cannot erase one we already had.
- **`_clear` is the one exception.** When a source *knows* the stored value is
  wrong and has no right value, it names those columns in `row["_clear"]` and
  they are explicitly set to `None`. A locked column still wins.
- **`locked` is curated by hand and never written by the scraper.**
  `db.expand_locks` pulls in derived columns (`gmp` → `estimated_listing`,
  `gmp_updated_at`; `lot_size`/`price_band_high` → `min_investment`), refuses
  `slug`/`name`, and warns once about unknown names.
- **History reflects observation, not assumption.** `gmp_is_observed` returns
  False after listing (there is a real price now) and False when the source
  gave nothing — so an outage leaves a **gap** in the chart, not a flat line.
- **Request budget is a feature.** Every third-party source reads the database
  first and makes **zero** requests in steady state.

### 5.3 NSE's endpoints disagree in four independent ways

This one component needed five corrections in a single day. Treat
`parse_book` / `parse_subscription` as high-risk and run the tests.

| Divergence | Detail |
|---|---|
| **Staleness** | `ipo-active-category` lags — measured 3 days behind while an issue went 12x → 23x. `category_stamp()` carries its age with its numbers. |
| **Exchange coverage** | `ipo-active-category` counts every exchange; `bidDetails` counts NSE alone. Measured 5.83 cr vs 3.88 cr shares on the same issue. Recorded as `scope: "all"\|"nse"`. |
| **Field spelling** | `noOfsharesBid` (mainboard) vs `noOfshareBid` (SME) — one `s` apart. Handled by `_first(row, *keys)`. |
| **Which categories** | The combined table sometimes omits Retail entirely. `parse_book` prefers it only when it is same-day current **and** prices every category the live book prices. |

Plus: `"Updated as on null"` means never written; a `0.00` ratio beside a real
share count is not a zero; some counts arrive as `"2.5328946E7"`.

### 5.4 Status ladder

`util.derive_status` reads top-down, furthest milestone wins:
`listed` → `allotment` → `closed` → `open` → `upcoming`.
`closed` triggers on the close date once the IST hour ≥ 18, because bidding and
the UPI mandate both cut off at 5pm. Recomputed every run for every row, with
two guards: no dates at all → leave alone; derived `upcoming` with no open and
no close date → leave alone (`upcoming` is the fallback, not a finding).

---

## 6. The database

Supabase Postgres, PostgREST only. **Writer** = scraper with
`SUPABASE_SERVICE_KEY` (bypasses RLS). **Reader** = web with
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (SELECT only).

### 6.1 Tables

**`public.ipos`** — PK `slug text`. `name` not null. Columns for board, status,
symbol, price band, lot, min investment, issue size, face value, gmp +
`gmp_updated_at`, `estimated_listing`, six dates (open/close/allotment/refund/
demat/listing), registrar + url, `lead_managers text[]`, five `subscription_*`
numerics, `listing_price`/`listing_gain_pct`, and three jsonb/array columns:

- `details jsonb` — scraper-owned, merged (see 6.2)
- `manual jsonb` — **human-owned, never touched by automation**
- `locked text[]` — columns the scraper must not overwrite

`created_at`/`updated_at` with a BEFORE UPDATE trigger.
**No CHECK constraints** on `status` or `board`.

**`gmp_history`** — slug FK, `gmp` not null, `recorded_at`.
**`subscription_history`** — slug FK, qib/nii/retail/total (**no employee**),
`recorded_at`.
**`scrape_runs`** — source, ok, records, message, duration_ms, started_at.

**RLS**: enabled on all four. Three SELECT-only policies for anon/authenticated
on `ipos`, `gmp_history`, `subscription_history`. `scrape_runs` has **no policy**
(private). **No INSERT/UPDATE/DELETE policy exists anywhere** — every write
needs service_role. *This is why a DELETE run from the Supabase SQL editor as
anon silently matches nothing and reports success.*

**Migrations**: there is no migration tool. `database/schema.sql` is re-runnable
(`drop policy if exists`, `create table if not exists`). A new column is added by
editing that file and running it; `db.upsert_ipos` additionally survives an
unknown column by dropping it, warning loudly, and retrying once.

### 6.2 The `details` jsonb catalogue

Written back **wholesale** each upsert — `merge_details` is what stops that
erasing other sources' keys.

| Key | Shape | Writer |
|---|---|---|
| 15 prose fields: `issue_type`, `discount`, `tick_size`, `sponsor_bank`, `upi_cutoff`, `categories`, `upi_categories`, `max_retail`, `max_employee`, `max_bid_qib`, `max_bid_nii`, `min_order_qty`, `registrar_address`, `registrar_contact`, `market_timings` | string, ≤400 chars | `nse.parse_company_details` |
| 7 doc URLs: `rhp_url`, `ratios_url`, `anchor_url`, `forms_url`, `bidding_centers_url`, `preanchor_url`, `postanchor_url` | string | same |
| `issue_split` | `{fresh_cr?, fresh_shares?, ofs_cr?, ofs_shares?}` | `nse.parse_issue_split` |
| `demand` | `{curve:[{price,qty}] ≤40, total_bids?, offered?, times?, at?}` | `nse.parse_demand` — **written, never read** |
| `category_bids` | `{rows:[{key,label,bid?,offered?,applications?,times?}], scope:"all"\|"nse", at?}` | `nse.parse_book` |
| `exchanges` | `["NSE","BSE"]`, only when NSE's `isBse` was actually set | `nse.fetch` |
| `about`, `sector`, `promoters` | strings | `timetable._company_blob` |
| `financials` | `{periods:[…], rows:{revenue,profit,assets,ebitda,net_worth,borrowing}, unit:"cr"}` | same |
| `strengths`, `risks` | `[string]` ≤8 | same |
| `lookup` | `{registrar:"kfin", client_id, name, endpoint, at}` | `kfin.fetch` |
| `handoff` | `{registrar:"bigshare"\|"mufg", name, id}` | `handoff.fetch` |
| `prices` | `[{d,o,h,l,c,v}]` ≤90 bars | `prices.fetch` |

**Read by the web app but written by nothing** (hand-edit only, UI omits the
block silently): `objects`, `incorporated`, `promoter_holding_pre`,
`promoter_holding_post`.
**Legacy shape, read forever, no writer**: `details.applications` as
`[{key, applications}]` — superseded by `category_bids.rows[].applications`,
but old closed issues still hold it.

### 6.3 Live snapshot (2 Oct 2026)

64 IPO rows — 48 listed, 8 allotment, 3 open, 3 closed, 2 upcoming;
46 Mainboard, 18 SME. `details.lookup` on 21 rows, `details.handoff` on 19.

---

## 7. The web app

Next.js 15 App Router, JavaScript, no TypeScript, **no test runner**
(`package.json` has only dev/build/start).

### 7.1 Routes

| Route | Rendering | Notes |
|---|---|---|
| `/` | `force-dynamic` | Hero tiles + filterable IPO table. No prose paragraph (deliberate, §10). |
| `/ipo` | `force-dynamic` | Full index grouped by stage. Exists so every detail page has an internal link. |
| `/ipo/[slug]` | `force-dynamic` | The money page. GMP history, subscription by category, timetable, financials, documents, FAQ, live price chart. |
| `/news` | `force-dynamic` | Headlines + "Companies in the news" with a Mainboard/SME toggle. |
| `/allotment` | `force-dynamic`, **`noindex`** | Hidden — see §8. |
| `/about`, `/editorial`, `/contact`, `/privacy`, `/terms` | `revalidate = 600` | Static policy pages. 600 s, **not** a year — see §10. |
| `/api/doc/[slug]/[kind]` | route handler | Prospectus proxy. `X-Robots-Tag: noindex`. |
| `/api/quote/[symbol]` | route handler | Live NSE last-traded price. |

### 7.2 `lib/`

`data.js` (Supabase reads, GMP deltas and sparklines) · `format.js` (IST dates,
currency, status labels, min-investment, issue size) · `bids.js` (category rows,
lot ladder, scope/stamp) · `bars.js` (OHLC grouping for the chart) ·
`config.js` (SITE, organizationLd, webSiteLd) · `registrars.js` (the fixed
registrar set + `registrarFor`) · `kfin.js` (the browser-side KFin lookup) ·
`documents.js` · `news.js` · `nse.js`.

### 7.3 Design system — `app/globals.css`

Palette supplied by the owner: `F2F6F7 · E7F2F6 · 0F5D7A · 0E7048 · C0442C · 0F1C22`.
One brand hue (deep teal) carries the chrome so a figure that *means* something
(a premium, a loss) is never competing with a colour that means nothing.

**Theme model — three states, all covered.** Every colour is a token on bare
`:root` (light); redefined under **both** `@media (prefers-color-scheme: dark)`
guarded as `:root:not([data-theme="light"])` **and** `:root[data-theme="dark"]`,
so an explicit toggle wins in either direction. Never define a colour only
inside a media or `[data-theme]` block.

Semantic tokens are separate from brand: `--up` green, `--down` red, `--warn`,
`--info`, each with a `-soft` ground.

### 7.4 SEO

- `@graph` JSON-LD with Organization + WebSite on `/`, `/ipo`, `/allotment`
- `publishingPrinciples` / `correctionsPolicy` / `ownershipFundingInfo` all
  point at `/editorial` (E-E-A-T for a YMYL finance site)
- **No fabricated Person node** — organisational accountability only
- `sitemap.js`, `robots.js`, `public/llms.txt`
- `next.config.mjs`: 308 www→apex, HSTS, nosniff, Referrer-Policy, X-Frame-Options,
  Permissions-Policy, `X-Robots-Tag: noindex` on `/api/*`, `no-cache` on `/sw.js`
- Google Search Console verified by `public/googlec4645788537cf8f6.html`

---

### 7.5 Authentication

Google sign-in only, via Firebase Auth. Added 23 Oct 2026.

| | |
|---|---|
| Firebase project | `investor-ipo-tracker` (project number `41460225694`) |
| Web app | `investor-web` |
| Providers enabled | **Google only.** No email/password, no phone, no anonymous |
| Authorized domains | `localhost`, `investor.socialriser.com`, plus the two Firebase defaults |
| Analytics / Gemini | both declined at project creation |

Files: `lib/firebase.js` (lazy, browser-only init; returns null when
unconfigured) · `components/AuthProvider.jsx` (one `onAuthStateChanged`
listener for the app) · `AuthButton.jsx` (header chip) · `LoginPanel.jsx` ·
`AccountPanel.jsx` · `GoogleMark.jsx` · routes `/login` and `/account`, both
`noindex` and both absent from the sitemap.

Three things worth knowing before changing it:

- **`loading` must be respected.** Auth resolves in the browser after the SDK
  restores a session, so anything that decides "signed out" before `loading`
  is false will flash the wrong UI at a signed-in reader and bounce them off
  protected pages.
- **Pop-up, with a redirect fallback.** `signInWithPopup` fails in webviews
  and the Android TWA; `auth/popup-blocked` and
  `auth/operation-not-supported-in-this-environment` fall through to
  `signInWithRedirect`, whose result is picked up by `getRedirectResult` on
  the way back.
- **The six `NEXT_PUBLIC_FIREBASE_*` vars are baked in at build.** Setting
  them in hPanel needs a redeploy, not a restart. Leave them empty and
  sign-in simply does not render — the rest of the site is unaffected.

The Firebase web `apiKey` is not a secret; it identifies the project to
Google and is designed to ship in client code. The authorized-domain list is
what actually guards it.

---

## 8. The allotment feature

### 8.1 Current state: **hidden**

Hidden at the owner's request on 10 Sep 2026 (`a648dd6`). The page works for
anyone holding the link. Three things hide it, and the same three restore it:

1. `robots: { index: false, follow: false }` in `app/allotment/page.jsx`
2. the `/allotment` entry in `app/sitemap.js`
3. two links — the footer in `app/layout.jsx`, the back row in `app/ipo/page.jsx`

> **Missed by the withdrawal:** `web/public/llms.txt` still lists `/allotment`
> as a key page and still says the site does no allotment lookup. Fix that when
> restoring — or now, since it is wrong either way.

References in `/privacy`, `/terms`, `/about`, `/contact`, `/editorial` were left
deliberately: the page is still reachable and still stores a PAN in the reader's
browser, so the policy documents describing that remain correct.

### 8.2 How it works

**KFin issues → checked live, in the reader's own browser.** KFin's portal has
no CAPTCHA and its API answers `Access-Control-Allow-Origin: *` with the two
headers it needs whitelisted, so the browser makes exactly the request KFin's own
page makes. **The PAN never reaches this site's server.** The one thing the
browser cannot obtain is the per-issue `client_id` — a JSON literal inside a
hash-named JS bundle on a host that sends no CORS header for static files — so
`scraper/sources/kfin.py` reads it server-side, where no PAN exists. The API
endpoint is stored **alongside** the id so a KFin deploy that moves it is picked
up on the next run.

**Everyone else → hand-off.** Bigshare, MUFG Intime and Skyline verify
server-side, so the last step stays the reader's. What the page does instead is
fix the step that actually fails: it names the issue **as that registrar files
it** ("DEEPA JEWELLERS LIMITED", "ESDS Software Solution Limited - IPO"), read
from the same public list their own page loads before any CAPTCHA exists.

The page also carries a timetable rail (allotment → refund → demat → listing,
with today marked), a dropdown picker (one issue at a time, choice in the URL
hash), and verdict cards where the answer is the loudest element.

### 8.3 What was ruled out, and why

Researched 8 Sep 2026 by reading every registrar portal and both exchanges.
**Do not revisit without new evidence** — each "no" has a different reason.

| Source | Verdict | Reason |
|---|---|---|
| **KFin** | ✅ in use | No CAPTCHA anywhere; CORS open; robots.txt permits |
| **Bigshare** | ❌ | Server-verified HMAC CAPTCHA. Their own page source documents that they closed the client-only hole **on purpose** after watching people POST directly |
| **MUFG Intime** | ❌ | Posts an empty body to `CaptchaImage.aspx/CheckCaptcha` — the answer lives in their session |
| **Skyline** | ❌ | reCAPTCHA v3 on the lookup stage |
| **NSE** | ❌ | Sends a reCAPTCHA token **and** returns the applicant's PAN, DP ID and beneficiary ID — a PII oracle nobody should proxy |
| **BSE** | ❌ | CAPTCHA genuinely client-only, but the API answers a server only when the request claims a `bseindia.com` Referer it does not have. That is asserting a false origin, not sending a normal User-Agent |

**What competitors actually do** (verified, not assumed): Chittorgarh,
InvestorGain and IPOWatch **do not check allotment at all** — every control is a
`target="_blank"` link to the registrar. Only IPOJi checks, from its own backend,
behind a login, with a coded fallback that redirects users to the registrar for
issues it cannot serve. "Check any IPO" is mostly a link with a better label.
(`ipotrends.in`, named by the owner as a friend's site, is an unconfigured
GoDaddy placeholder.)

**The standing boundary:** never solve, OCR or bypass a CAPTCHA; never send a
PAN or any identifier to a third party from the server; never assert a false
Referer or origin. A server-side relay would also reverse the site's published
privacy promise and make the owner a DPDP data fiduciary for PANs — recommended
**against**, and the owner has not overridden that.

---

## 9. Infrastructure

### 9.1 Deploy

Hostinger **Node.js Web App**, Git-connected to `main`, **root directory `web`**.
Install `npm ci` · Build `npm run build` · Start `npm run start -- -p $PORT`
(the `$PORT` is required) · Node 20 or 22.

`git push origin main` → Hostinger rebuilds → live in **40–90 seconds**. No
GitHub Action participates. The site sits behind Hostinger's CDN (`Server: hcdn`).

`publish-web-branch.yml` mirrors `web/` to a `web-deploy` branch via
`git subtree split` — a fallback for an import screen that insists on the repo
root. **Verified 2 Oct 2026: the workflow is alive and the branch is current**
(`32a59b3` = subtree split of `a648dd6`). It is unused but not stale.

### 9.2 The cron

`.github/workflows/scrape.yml` — `37 */2 * * *`, `concurrency: scrape`
(never cancel in progress), `timeout-minutes: 15`, plus `workflow_dispatch`.
Runs `python run_once.py` in `working-directory: scraper` on Python 3.12.

**Secrets: exactly two** — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

GitHub runs scheduled workflows best-effort and silently drops firings. Measured:
`*/15` gave a 34-min median gap; hourly produced gaps of 158/174/179/285/360/384
minutes. Minute **37, not 0**, because the top of the hour is the most contended
slot. The current setting is the **third** tuning and the file says tuning is not
the answer. Documented exit: a cron on the Hostinger box calling the
`workflow_dispatch` API, which would honour the interval.

### 9.3 Maintenance workflow — four safety layers

`workflow_dispatch` only. (1) The dry run **always** runs, even when confirming,
so the log records what was there. (2) Apply is gated on `inputs.confirm ==
'DELETE'`, exact match. (3) `maintenance.py` writes nothing without `--apply`
and is a separate entry point from `run_once.py` on purpose. (4) It re-derives
the condition in Python and **exits 1** if any row it is about to delete holds a
real figure.

### 9.4 Environment variables

**Scraper** (required): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
Optional: `GMP_SOURCE`, `GMP_FALLBACKS`, `TIMETABLE_SOURCE`,
`TIMETABLE_MAX_FETCHES_PER_RUN`, `LISTING_SOURCE`,
`LISTING_MAX_FETCHES_PER_RUN`, `SCRAPER_USER_AGENT`,
`REQUEST_TIMEOUT_SECONDS`, `DELAY_SECONDS`, `MAX_RETRIES`,
`INTERVAL_MINUTES`, `FETCH_DETAILS`.

**Web** (set in hPanel, all `NEXT_PUBLIC_` → baked in at build):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL` (= `contact@socialriser.com`).
Unset: `NEXT_PUBLIC_ADSENSE_ID`, `NEXT_PUBLIC_ADS_ENABLED`,
`NEXT_PUBLIC_GOOGLE_VERIFICATION` (the HTML-file method is used instead).
Undocumented server-only: `NEWS_FEED_URL`.

### 9.5 Running locally

```bash
# scraper — no DB keys needed for the dry run
cd scraper && pip install -r requirements.txt
python run_once.py --dry-run
python -m pytest tests/ -q          # 177 tests, ~1s

# website
cd web && npm install
cp .env.example .env.local          # fill the four NEXT_PUBLIC_ vars
npm run dev
```

> On macOS/Linux the documented `cp .env.example .env` path **does not work** for
> the scraper: nothing in the Python reads `.env` (no `python-dotenv`). Only the
> `.bat` files load it. Export the vars manually.

---

## 10. Standing decisions — do not reverse without asking

**Owner's explicit calls**

- `/allotment` is hidden (10 Sep 2026). It was hidden before, un-hidden when the
  premise expired, and hidden again on request — "it looks like it should be
  indexed" is not evidence.
- **No homepage prose paragraph.** Three generated paragraphs were added for SEO
  (`88aa9c3`) and removed two commits later on "no need" (`48f8f37`).
- **No named individual anywhere.** Organisational accountability (Socialriser)
  only — no Person node, no founder, no byline.
- **Google sign-in, and only Google** (added 23 Oct 2026, reversing the
  earlier no-sign-in decision at the owner's request). Phone OTP stays ruled
  out (SMS provider, per-message cost, TRAI DLT registration), and no
  email/password provider is enabled in the Firebase project — so the UI
  cannot offer one. **It gates nothing:** every IPO page is public signed in
  or not, and `/account` is the only protected route. Do not put existing
  content behind it — the site's traffic is search traffic.
  Firebase project `investor-ipo-tracker`; see §7.5.
- **Listed issues stay on the allotment page** (`471ce2a`, reversing `2731e94`).
- **One issue at a time from a dropdown**, not all stacked (`0bce1bd`).
- **Cron stays on GitHub Actions.** Do not wire Hostinger scheduling.
- **Never handle** the GitHub PAT, the Android keystore password, or the Google
  OAuth client secret.
- **Deploy only when asked.**

**Engineering calls with a cost already paid**

- Static pages use `revalidate = 600`, not a year — `s-maxage=31536000` once
  served `/terms` content from two commits earlier and edge copies cannot be
  purged, only aged out.
- The font is **self-hosted** via `next/font/google`, not fetched from Google at
  runtime.
- `subscription_history` rows that are all-zero are never written; 405 of the
  first 1,080 were junk and had to be deleted by hand with service_role.
- The category ratio is **derived locally**, never copied from NSE — a copied
  ratio was computed whenever that endpoint last ran.
- npm `overrides` lift `postcss`/`sharp` out of their advisories without a Next
  major bump.

---

## 11. Known defects and stale documentation

Each is checkable. None is currently breaking the site.

**Code**

- `compute_derived`'s stored-value fallback is **dead code**: it reads
  `lot_size`/`price_band_high` from `existing`, but `db.fetch_existing` never
  selects them. The web layer recomputes both on read, which hides it — but the
  stored columns stay stale for anything reading Postgres directly.
- `db.fetch_unfinished` has `limit=200` and **no pagination**; the excess is
  silently dropped.
- `prices._wanted_days` re-fetches the newest stored day every run (missing a
  `+1 day`), costing one extra bhavcopy download per run.
- History tables have **no dedupe and no upsert key** — 12 rows/day/IPO forever.
- Locking `details` withholds the **entire** jsonb blob, undocumented.
- Locking `board` does **not** withhold `min_investment`, though it should.
- `details.demand` is written on every mainboard issue and **never read**.

**SEO audit findings still open** (from a verified audit, 7 Sep 2026)

- Detail-page JSON-LD is a **bare array**, not `@graph`, so `Organization` and
  `WebSite` carry no `@context` → **two severe errors per page** in Search
  Console on `publisher` and `isPartOf`. One-line fix. *(Confirmed still live
  2 Oct 2026.)*
- The back-link on all 27 detail pages says "All IPOs" but points at `/`, not
  `/ipo`. *(Confirmed still live.)*
- `rays-of-belief-…` title is 114 chars; the suffix-stripping regex in
  `util.py` is anchored at end-of-string and this NSE name has "Limited-"
  mid-string.
- The meta-description template still interpolates `"TBA"` — appears on listing
  day, exactly when that issue's search volume peaks.
- Gaja has no About and no Financials, and shows pre-bidding copy on a listed
  issue (a template defect: the empty state has no status check).
- **The only prose on every detail page is copied verbatim from IPO
  aggregators** — proven by shared typos (`"Tawa Left Bank Canthe al"`). The
  page prints "As published in the company's own offer documents" beneath text
  whose typos prove otherwise. This is the biggest open item and needs an
  owner decision.

**Stale docs and assets**

- `llms.txt` still advertises `/allotment` and says the site does no lookup.
- `privacy/page.jsx` says the browser contacts Google Fonts; it no longer does.
- `global-error.jsx` uses the pre-teal palette.
- **Two icon generators** write the same five filenames: `tools/make_icons.py`
  (teal, current) and `web/scripts/make_icons.py` (indigo, superseded).
  `README.md` points at the **wrong one** — following it reverts every icon.
- `.well-known/assetlinks.json` is still `REPLACE_WITH_…` placeholders, so TWA
  URL verification cannot pass.
- `build-app.bat` / `app/README.md` quote the old brand colours.
- **Every cadence claim in README/DEPLOYMENT is wrong** ("hourly", "30-minute",
  "at most an hour old"). The cron is `37 */2 * * *` and may deliver 3/day.
- `schema.sql` documents `status` as `upcoming|open|closed|listed` and omits
  `allotment`, which the app treats as first-class everywhere.

---

## 12. Pending work

**Owner's side**

- Google Search Console: watch the Pages report; `/allotment` should drop out
- GPTBot / meta-externalagent still get **429** on origin-reaching paths from
  Hostinger's CDN (Googlebot is unaffected — verified). Support ticket drafted
- No real KFin lookup has ever been run end-to-end with a genuine PAN

**Code, ranked**

1. The four small SEO fixes (`@graph`, back-link href, title regex, TBA template)
2. The Gaja stub + the status-blind empty state behind it
3. The copied About prose — needs an owner decision on approach
4. Performance: `select=*` pulls the entire `details` blob for every IPO on
   every request; `force-dynamic` means nothing HTML edge-caches
5. The demand-curve chart (data already collected, unused)
6. Android keystore + `assetlinks.json` SHA-256 fingerprints

---

## 13. Working agreements

- **Language**: the owner writes in Hinglish; reply in kind. Code, comments and
  commit messages stay in English.
- **Commit messages**: long, explaining *why*, not *what*. They are the
  project's primary documentation. End with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Verify live, don't assume.** Append `?cb=$RANDOM`. Check every stylesheet
  the page loads. A deploy lands in 40–90 s; if a marker is missing after that,
  suspect the check before the deploy.
- **Report outcomes faithfully.** If a test fails, say so with the output. If a
  step was skipped, say that.
- **Never fabricate a figure** — in the product or in a status report.

# Android App (TWA)

The app is a **Trusted Web Activity** — a thin Android shell that renders
`investor.socialriser.com` full-screen with no browser UI. Google built TWA
exactly for this: it is a normal Play Store app, but the content is your
website.

**The point of this design:** you change the website, and the app changes.
No rebuild, no re-upload, no Play Store review. You only ever rebuild the APK
for the things baked into the shell — app name, icon, package id, permissions.

| What changed | Rebuild the app? |
|---|---|
| IPO data, GMP, subscription | ❌ instant |
| Page layout, colours, new pages, new features | ❌ instant |
| App name, launcher icon, splash screen | ✅ yes |
| Package id, permissions, target SDK | ✅ yes |

---

## Step 0 — Confirm the site is installable (do this first)

A TWA will not work unless Chrome considers the site an installable PWA. The
manifest, icons and service worker are already built into `web/`, but you
must confirm they work **on the deployed HTTPS site** — service workers
behave differently on localhost and in embedded browsers, so this check is
not reliable until the site is live.

Open `https://investor.socialriser.com` in desktop Chrome and check:

1. **DevTools → Application → Manifest** — no errors, all icons load.
2. **DevTools → Application → Service Workers** — status shows
   `activated and is running`.
3. **DevTools → Lighthouse → Installability** — run the PWA audit; it must
   pass.
4. The address bar should show an **install icon**.

If the service worker does not register, check the response headers on
`/sw.js`. It must be served with `Content-Type: application/javascript` and
must **not** carry `Cache-Control: no-store` — `no-store` causes Chrome to
fail registration with "An unknown error occurred when fetching the script".
[`web/next.config.mjs`](../web/next.config.mjs) already sets the correct
`no-cache, must-revalidate`.

Only continue to Step 1 once all four checks pass.

## Prerequisites

1. **The website must be live on HTTPS** at `investor.socialriser.com` and pass
   Step 0 above.
2. **JDK 17** and **Android SDK** — Bubblewrap installs both for you on first
   run if they are missing.
3. **Node.js 18+**.

## Step 1 — Install Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

## Step 2 — Generate the Android project

From this `app/` folder:

```bash
bubblewrap init --manifest https://investor.socialriser.com/manifest.webmanifest
```

Bubblewrap reads your live web manifest and asks a few questions. The answers
that matter — the rest can be accepted as default:

| Prompt | Answer |
|---|---|
| Domain | `investor.socialriser.com` |
| Application ID / package | `com.socialriser.investor` |
| Display mode | `standalone` |
| Status bar colour | `#1f4fd8` |
| Include support for Play Billing | `No` |

[`twa-manifest.json`](twa-manifest.json) in this folder holds the exact
settings this project expects — if you want to skip the prompts, copy it over
the generated file and run `bubblewrap update`.

Bubblewrap creates the signing keystore during `init`. **Back up
`android.keystore` and its passwords immediately** — lose them and you can
never update the app on Play Store under the same listing.

## Step 3 — Build

```bash
bubblewrap build
```

Produces:
- `app-release-signed.apk` — for direct install / testing
- `app-release-bundle.aab` — this is what you upload to Play Store

## Step 4 — Verify domain ownership (Digital Asset Links)

Without this the app shows a browser address bar at the top — it will look
like a webview instead of a native app.

> **You almost certainly need TWO fingerprints, not one.**
>
> Play App Signing is on by default for new apps: you upload a bundle signed
> with your *upload key*, and Google re-signs it with a different *app
> signing key* before delivering it to users. The certificate on a phone is
> therefore **not** the one in your local `android.keystore`.
>
> Listing only the local fingerprint is the single most common reason a TWA
> still shows the address bar after everything else looks right: it works
> when you sideload the APK, and fails for every Play Store install.

**A. Your local upload key** — makes sideloaded test builds verify:

```bash
keytool -list -v -keystore android.keystore -alias investor
```

Copy the **SHA256** value (the long `AB:CD:EF:...` string).

**B. Google's app signing key** — makes Play Store installs verify:

Play Console → your app → **Test and release → Setup → App signing**. Copy
the **SHA-256 certificate fingerprint** under *App signing key certificate*.
(This exists only after you have uploaded your first bundle, so you may do
Step 5 first and return here.)

**C. Put both in the file.** Edit
[`web/public/.well-known/assetlinks.json`](../web/public/.well-known/assetlinks.json)
so the array holds both values:

```json
"sha256_cert_fingerprints": [
  "AA:BB:...:upload-key-fingerprint",
  "CC:DD:...:google-app-signing-fingerprint"
]
```

**D. Redeploy the website** and confirm the file is live and served as JSON:

```
https://investor.socialriser.com/.well-known/assetlinks.json
```

**E. Verify** with Google's official checker before reinstalling:

```
https://developers.google.com/digital-asset-links/tools/generator
```

Then reinstall the app — the address bar should be gone.

> Bubblewrap can generate the file for the local key:
> `bubblewrap fingerprint generateAssetLinks`. You still have to add
> Google's app signing fingerprint by hand.

## Step 5 — Publish to Play Store

1. [Play Console](https://play.google.com/console) → **Create app** (₹2,000
   one-time developer registration if you have not paid it).
2. Upload `app-release-bundle.aab` to a release track. Start with **Internal
   testing** — it goes live in minutes and you can install on your own phone.
3. Fill the store listing: title, short/full description, screenshots
   (phone screenshots of the live site work), feature graphic 1024×500, and a
   512×512 icon (use `web/public/icons/icon-512.png`).
4. Complete the **Data safety** form. This app collects nothing — declare no
   data collection unless you later add analytics.
5. Add a **privacy policy URL** — Play Store requires one even for a simple
   app. A page at `/privacy` on the website is enough.
6. Submit for review. First review typically takes a few days.

## Updating later

You only rebuild for shell changes:

```bash
bubblewrap update      # pull new settings from the web manifest
bubblewrap build       # bump appVersionCode in twa-manifest.json first
```

Increment `appVersionCode` on every Play Store upload — Play rejects a
duplicate version code.

## iOS

Apple rejects apps that are only a website wrapper
([guideline 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)),
so there is no TWA equivalent. Two workable paths:

1. **PWA (free, works today)** — iPhone users open the site in Safari and tap
   **Share → Add to Home Screen**. They get an icon, full-screen display and
   offline support. Everything needed for this is already built.
2. **A real native app later** — if iOS traffic justifies it, build with Expo
   (React Native) reading the same Supabase database, and use EAS Update to
   ship JS changes over the air without App Store review.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Address bar visible at the top | `assetlinks.json` missing or not yet deployed |
| Address bar on Play installs but NOT on sideloaded APK | Google's app signing fingerprint is missing from `assetlinks.json` — see Step 4B |
| "App not installed" | Package id conflicts with an existing install — uninstall the old one |
| Splash screen then blank | Website not reachable over HTTPS, or `start_url` outside `scope` |
| Play rejects the bundle | `appVersionCode` not incremented |

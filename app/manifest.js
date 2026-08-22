import { SITE } from "../lib/config";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * The Android TWA app is generated FROM this file, so these values become the
 * app name, icon, splash screen and theme colour on the phone. Change them
 * here and the installed PWA updates immediately; the TWA picks up name and
 * icon changes only when the APK is rebuilt, so keep `name` stable.
 */
export default function manifest() {
  return {
    name: `${SITE.name} — Live IPO Tracker`,
    short_name: SITE.shortName,
    description: SITE.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: SITE.backgroundColor,
    theme_color: SITE.themeColor,
    categories: ["finance", "business", "news"],
    lang: "en-IN",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Open IPOs",
        short_name: "Open",
        url: "/?tab=open",
      },
    ],
  };
}

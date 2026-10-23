/**
 * Firebase, initialised lazily and only in a browser.
 *
 * WHY LAZY. Every page on this site is server-rendered, and most of them have
 * nothing to do with signing in. Importing the SDK at module scope would pull
 * it into the server bundle and run `initializeApp` during a render that has
 * no window, no storage and no user. So nothing is created until a client
 * component actually asks for it.
 *
 * WHY IT MAY RETURN NULL. The config comes from NEXT_PUBLIC_ variables, which
 * Next bakes in at build time. A build that runs before those are set in
 * hPanel would otherwise throw on the first render and take the whole site
 * down — for a feature most visitors never touch. Instead `getFirebaseAuth()`
 * returns null, `isFirebaseConfigured()` says so, and the sign-in UI explains
 * itself rather than crashing. The IPO data, which is the point of the site,
 * is untouched either way.
 *
 * ON THE API KEY. A Firebase web apiKey is not a secret — it identifies the
 * project to Google's endpoints and is designed to ship in client code. What
 * actually guards the project is the authorized-domain list and, where there
 * is data, security rules. It lives in an env var for tidiness and parity with
 * the Supabase keys, not for secrecy.
 */

let appPromise = null;

const CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** The three the SDK cannot start without. */
export function isFirebaseConfigured() {
  return Boolean(CONFIG.apiKey && CONFIG.authDomain && CONFIG.projectId);
}

/**
 * The Auth instance, or null when the browser cannot have one.
 *
 * Returns a promise because the SDK is code-split: the ~200 KB of auth
 * machinery is fetched when someone reaches for sign-in, not when they open
 * an IPO page.
 */
export async function getFirebaseAuth() {
  if (typeof window === "undefined" || !isFirebaseConfigured()) return null;

  if (!appPromise) {
    appPromise = (async () => {
      const [{ initializeApp, getApps, getApp }, { getAuth }] =
        await Promise.all([import("firebase/app"), import("firebase/auth")]);
      // getApps() guards against React's double-invoked effects in
      // development creating a second app and throwing on the duplicate name.
      const app = getApps().length ? getApp() : initializeApp(CONFIG);
      return getAuth(app);
    })();
  }

  try {
    return await appPromise;
  } catch (error) {
    // A failed init must not be cached as a permanent failure: a transient
    // chunk-load error would otherwise disable sign-in for the whole session.
    appPromise = null;
    throw error;
  }
}

/**
 * What a reader should be told when Firebase says no.
 *
 * Firebase's own messages name internals ("auth/popup-blocked") or read as
 * accusations. These say what happened and what to do, and nothing else —
 * an auth error is not the place to make someone feel watched.
 */
export function authErrorMessage(error) {
  const code = String(error?.code || "");
  if (process.env.NODE_ENV !== "production") {
    // Dev only. The mapped message is for readers; the code is for whoever
    // is trying to work out why a provider refused.
    console.warn("[auth]", code, error?.message || "");
  }
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null; // The reader closed it on purpose. Not an error to report.
    case "auth/popup-blocked":
      return "Your browser blocked the Google window. Allow pop-ups for this site, or try again — we will send you to Google directly.";
    case "auth/network-request-failed":
      return "Could not reach Google. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/unauthorized-domain":
      return "This address is not authorised for sign-in yet. If you are the site owner, add it under Authentication → Settings → Authorized domains in Firebase.";
    case "auth/operation-not-allowed":
      // Provider-neutral: this fires for whichever provider is switched off,
      // and naming the wrong one sends the reader (or the owner) looking in
      // the wrong place.
      return "That sign-in method is not switched on for this site yet.";
    case "auth/invalid-phone-number":
      return "That phone number does not look right. Include the country code, like +919876543210.";
    case "auth/missing-phone-number":
      return "Enter a phone number.";
    case "auth/quota-exceeded":
      return "The daily limit for verification codes has been reached. Try again tomorrow, or sign in with Google.";
    case "auth/invalid-verification-code":
      return "That code is not right. Check the digits and try again.";
    case "auth/code-expired":
      return "That code has expired. Ask for a new one.";
    case "auth/captcha-check-failed":
      return "The anti-abuse check failed. Reload the page and try again.";
    case "auth/billing-not-enabled":
      return "Phone sign-in is not available on this site right now. Please use Google.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    default:
      return "Sign-in did not complete. Please try again.";
  }
}

"use client";

/**
 * The sign-in card.
 *
 * Two ways in, and both have to be here. This page is where a signed-out
 * reader lands, so a provider missing from it is a reader who cannot get back
 * into their own account — which is exactly what happened when phone sign-in
 * shipped into the popup alone. The phone route opens the same dialog the
 * rest of the site uses rather than a second copy of the form.
 *
 * The page says plainly what signing in does and does not do — on a site
 * whose privacy policy is one of its selling points, an account that appears
 * without explanation is worse than no account.
 *
 * Already signed in? It does not show the button again; it says so and offers
 * the way on. And when the reader arrived from a protected page, `next`
 * carries them back there instead of dropping them on the homepage.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "./AuthProvider";
import GoogleMark from "./GoogleMark";

/** Only same-site paths. An open redirect is a phishing primitive. */
function safeNext(raw) {
  if (!raw) return "/account";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/account";
  return raw;
}

export default function LoginPanel() {
  const { user, loading, busy, error, signInWithGoogle, requireAuth, configured } =
    useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  // Signing in on this page should not leave the reader looking at it.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  if (!configured) {
    return (
      <div className="card card-wide auth-card">
        <h2>Sign-in is not set up</h2>
        <p className="subtitle subtitle-flush">
          This site has no sign-in configured.
        </p>
        <p className="back-row">
          <Link href="/">← Live dashboard</Link>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card card-wide auth-card">
        <p className="auth-status" role="status">
          Checking your sign-in…
        </p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="card card-wide auth-card">
        <h2>You are signed in</h2>
        <p className="subtitle subtitle-flush">
          Signed in as{" "}
          <strong>{user.name || user.email || user.phone}</strong>. Taking you
          back…
        </p>
        <p className="back-row">
          <Link href="/account">Your account</Link> ·{" "}
          <Link href="/">Live dashboard</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card card-wide auth-card">
      <h2>Sign in</h2>

      <button
        type="button"
        className="google-btn"
        onClick={signInWithGoogle}
        disabled={busy}
      >
        <GoogleMark />
        <span>{busy ? "Opening Google…" : "Continue with Google"}</span>
      </button>

      <button
        type="button"
        className="ghost-btn modal-alt"
        onClick={() => requireAuth("phone")}
        disabled={busy}
      >
        Use a phone number instead
      </button>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="auth-facts">
        <li>
          <strong>What we receive.</strong> Your name, email and picture from
          Google, or just your number from a phone sign-in.
        </li>
        <li>
          <strong>Leaving.</strong> Sign out any time, or ask us to delete your
          account — see the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </li>
      </ul>

      <p className="back-row">
        <Link href="/">← Live dashboard</Link>
      </p>
    </div>
  );
}

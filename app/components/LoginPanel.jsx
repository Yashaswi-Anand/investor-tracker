"use client";

/**
 * The sign-in card.
 *
 * One button, because there is one provider. The page says plainly what
 * signing in does and does not do — on a site whose privacy policy is one of
 * its selling points, an account that appears without explanation is worse
 * than no account.
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
  const { user, loading, busy, error, signIn, configured } = useAuth();
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
          This site has no sign-in configured. Nothing else is affected — every
          IPO page works exactly as it always has.
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
          Signed in as <strong>{user.email || user.name}</strong>. Taking you
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
      <h2>Sign in with Google</h2>
      <p className="subtitle">
        One button, one account. There is no password to choose and no email to
        verify — Google tells us who you are, and that is the whole of it.
      </p>

      <button
        type="button"
        className="google-btn"
        onClick={signIn}
        disabled={busy}
      >
        <GoogleMark />
        <span>{busy ? "Opening Google…" : "Continue with Google"}</span>
      </button>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="auth-facts">
        <li>
          <strong>What we receive.</strong> Your name, email address and
          profile picture, from Google. Nothing else, and never your password.
        </li>
        <li>
          <strong>What it changes.</strong> Nothing about the IPO data. Every
          page on this site is public and stays public, signed in or not.
        </li>
        <li>
          <strong>Leaving.</strong> Sign out any time from your account page.
          Ask us to delete the account and it goes — see the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </li>
      </ul>

      <p className="back-row">
        <Link href="/">← Live dashboard</Link>
      </p>
    </div>
  );
}

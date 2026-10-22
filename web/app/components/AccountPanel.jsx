"use client";

/**
 * The one protected page on this site, and the pattern for any that follow.
 *
 * WHY ONLY ONE. Every other page here is public IPO data that earns its
 * traffic from search. Putting any of it behind a sign-in would cost the
 * site the thing it is built on and give the reader nothing — so nothing
 * existing was gated. This page is protected because it genuinely cannot be
 * rendered for a stranger: it is about the person reading it.
 *
 * THE GUARD, AND ITS ORDER. Auth is resolved in the browser, so the server
 * cannot know who this is and the page must not decide before `loading` is
 * false. Redirecting a split second early would bounce a signed-in reader to
 * the login page, which is exactly the bug this ordering prevents. `replace`
 * rather than `push` so Back does not land on the page we just left.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "./AuthProvider";

function fmt(stamp) {
  if (!stamp) return null;
  try {
    return new Date(stamp).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return null;
  }
}

export default function AccountPanel() {
  const { user, loading, busy, error, signOut, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!configured) return;
    if (!loading && !user) router.replace("/login?next=/account");
  }, [configured, loading, user, router]);

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

  // Covers both the first paint and the moment after the redirect is ordered
  // but before it lands, so a signed-out reader never sees account furniture.
  if (loading || !user) {
    return (
      <div className="card card-wide auth-card">
        <p className="auth-status" role="status">
          {loading ? "Checking your sign-in…" : "Taking you to sign-in…"}
        </p>
      </div>
    );
  }

  const created = fmt(user.createdAt);
  const last = fmt(user.lastSignIn);

  return (
    <div className="card card-wide auth-card">
      <div className="account-head">
        {user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photo}
            alt=""
            className="account-avatar"
            referrerPolicy="no-referrer"
            width={56}
            height={56}
          />
        ) : (
          <span className="account-avatar account-avatar-letter" aria-hidden="true">
            {(user.name || user.email || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h2 className="account-name">{user.name || "Signed in"}</h2>
          {user.email ? <p className="account-email">{user.email}</p> : null}
        </div>
      </div>

      <dl className="detail-grid account-grid">
        <div>
          <dt>Signed in with</dt>
          <dd>Google</dd>
        </div>
        {created ? (
          <div>
            <dt>Account created</dt>
            <dd>{created} IST</dd>
          </div>
        ) : null}
        {last ? (
          <div>
            <dt>Last sign-in</dt>
            <dd>{last} IST</dd>
          </div>
        ) : null}
      </dl>

      <p className="subtitle">
        Signing in changes nothing about the IPO data — every page on this site
        is public and stays public. We hold your name, email and profile
        picture as Google gave them to us, and nothing else.
      </p>

      <button type="button" className="ghost-btn" onClick={signOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="back-row">
        <Link href="/">← Live dashboard</Link> ·{" "}
        <Link href="/privacy">Privacy Policy</Link>
      </p>
    </div>
  );
}

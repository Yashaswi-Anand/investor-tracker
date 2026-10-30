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
import { useEffect, useState } from "react";

import { watchAllotments } from "../../lib/allotments";
import { MAX_PANS, watchPans } from "../../lib/pans";
import { useAuth } from "./AuthProvider";
import GoogleMark from "./GoogleMark";
import PanModal from "./PanModal";

const IST = "Asia/Kolkata";

function fmt(stamp, withTime = true) {
  if (!stamp) return null;
  try {
    return new Date(stamp).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
      timeZone: IST,
    });
  } catch {
    return null;
  }
}

/** Morning, afternoon or evening — by the clock in India. */
function greeting() {
  const hour = Number(
    new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: IST })
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Enough to recognise your own PAN, not enough to read it off a screen. */
const maskPan = (pan) => `${pan.slice(0, 3)}••••${pan.slice(-3)}`;

/**
 * Subscribes while signed in and hands back null until the first answer, so
 * nothing on the page claims "0" before the database has spoken.
 */
function useLive(uid, watch, pick) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    let unsubscribe = () => {};
    let cancelled = false;
    watch(
      uid,
      (data) => {
        if (!cancelled) setValue(pick(data));
      },
      () => {}
    )
      .then((stop) => {
        if (cancelled) stop();
        else unsubscribe = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `watch` and `pick` are module-level and never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
  return value;
}

const pickPans = (list) => list;

/** Issues where a saved PAN was allotted, by KFin's word or the reader's note. */
const pickAllotted = ({ results, marks }) => {
  const keys = new Set();
  for (const [key, r] of Object.entries(results)) if (r.state === "allotted") keys.add(key);
  for (const [key, m] of Object.entries(marks)) if (m === "allotted") keys.add(key);
  return keys.size;
};

const ICONS = {
  card: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm4 3h4m-4 4h6",
  check: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-11 0 2 2 4-4",
  calendar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12H4V7Zm0 4h16M8 3v4m8-4v4",
  clock: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-4v4l3 2",
  chart: "M4 19h16M7 15l3-4 3 2 4-6",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  news: "M5 5h11v14H6a1 1 0 0 1-1-1V5Zm11 4h3v9a1 1 0 0 1-1 1h-2M8 9h5m-5 4h5",
  shield: "M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6l-7-3Zm-3 9 2 2 4-4",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff:
    "M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  out: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
};

function Icon({ name, size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const QUICK = [
  { href: "/allotment", icon: "check", title: "Check allotment", sub: "Your PANs, every issue" },
  { href: "/", icon: "chart", title: "Live dashboard", sub: "GMP and subscription" },
  { href: "/ipo", icon: "list", title: "All IPOs", sub: "Mainboard and SME" },
  { href: "/news", icon: "news", title: "IPO news", sub: "Latest headlines" },
];

export default function AccountPanel() {
  const { user, loading, busy, error, signOut, configured } = useAuth();
  const router = useRouter();
  const uid = user?.uid || null;
  const pans = useLive(uid, watchPans, pickPans);
  const allotted = useLive(uid, watchAllotments, pickAllotted);
  const [adding, setAdding] = useState(false);
  // Hidden by default: a PAN on screen is a PAN anyone nearby can read.
  const [showPans, setShowPans] = useState(false);
  const full = (pans?.length || 0) >= MAX_PANS;

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

  const since = fmt(user.createdAt, false);
  const last = fmt(user.lastSignIn);
  const providers = user?.providers || [];
  // A phone account has no display name, so the number IS the identity.
  const displayName = user.name || user.phone || user.email || "Investor";
  const firstName = user.name ? user.name.split(" ")[0] : null;

  return (
    <div className="account">
      <section className="card account-card account-rise">
        <div className="account-banner" aria-hidden="true">
          <span className="account-orb account-orb-1" />
          <span className="account-orb account-orb-2" />
          <span className="account-orb account-orb-3" />
        </div>

        <div className="account-id">
          <div className="account-avatar-wrap">
            {user.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photo}
                alt=""
                className="account-avatar"
                referrerPolicy="no-referrer"
                width={96}
                height={96}
              />
            ) : (
              <span className="account-avatar account-avatar-letter" aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="account-online" aria-hidden="true" />
          </div>

          <p className="account-hello">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </p>
          <h1 className="account-name">{displayName}</h1>
          {user.email && user.name ? <p className="account-email">{user.email}</p> : null}
          {user.phone && (user.name || user.email) ? (
            <p className="account-email">{user.phone}</p>
          ) : null}

          <div className="account-badges">
            {providers.includes("google.com") ? (
              <span className="account-badge">
                <GoogleMark size={14} />
                Google
              </span>
            ) : null}
            <span className="account-badge account-badge-ok">
              <span className="account-dot" aria-hidden="true" />
              Signed in
            </span>
          </div>
        </div>

        <dl className="account-stats">
          <div className="account-stat">
            <span className="account-stat-icon"><Icon name="card" /></span>
            <dt>Saved PANs</dt>
            <dd>
              <span className="account-stat-figure num">{pans ? pans.length : "—"}</span>
              <span className="account-stat-of">/ {MAX_PANS}</span>
            </dd>
          </div>
          <div className="account-stat account-stat-up">
            <span className="account-stat-icon"><Icon name="check" /></span>
            <dt>IPOs allotted</dt>
            <dd>
              <span className="account-stat-figure num">{allotted ?? "—"}</span>
            </dd>
          </div>
          <div className="account-stat">
            <span className="account-stat-icon"><Icon name="calendar" /></span>
            <dt>Member since</dt>
            <dd className="account-stat-text">{since || "—"}</dd>
          </div>
          <div className="account-stat">
            <span className="account-stat-icon"><Icon name="clock" /></span>
            <dt>Last sign-in</dt>
            <dd className="account-stat-text">{last ? `${last} IST` : "—"}</dd>
          </div>
        </dl>
      </section>

      <section
        className="card account-card account-section account-rise"
        style={{ "--rise-delay": "80ms" }}
      >
        <div className="account-section-head">
          <h2>Your PANs</h2>
          {pans?.length ? (
            <div className="account-section-tools">
            <button
              type="button"
              className="account-eye"
              onClick={() => setShowPans((v) => !v)}
              aria-pressed={showPans}
              aria-label={showPans ? "Hide PANs" : "Show PANs"}
              title={showPans ? "Hide PANs" : "Show PANs"}
            >
              <Icon name={showPans ? "eye" : "eyeOff"} size={18} />
            </button>
            <button
              type="button"
              className="ghost-btn pan-add-btn"
              onClick={() => setAdding(true)}
              disabled={full}
            >
              {full ? `Limit is ${MAX_PANS}` : "+ Add PAN"}
            </button>
            </div>
          ) : null}
        </div>
        {pans == null ? (
          <p className="auth-status">Loading…</p>
        ) : pans.length ? (
          <ul className="account-pans">
            {pans.map((pan) => (
              <li key={pan} className="account-pan">
                <Icon name="card" size={16} />
                <span className="pan-value">{showPans ? pan : maskPan(pan)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="account-empty">
            <p>No PANs saved yet.</p>
            <button type="button" className="lookup-btn" onClick={() => setAdding(true)}>
              + Add your first PAN
            </button>
          </div>
        )}
        {adding ? (
          <PanModal uid={uid} existing={pans || []} onClose={() => setAdding(false)} />
        ) : null}
      </section>

      <nav
        className="account-quick account-rise"
        style={{ "--rise-delay": "160ms" }}
        aria-label="Quick links"
      >
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className="account-tile">
            <span className="account-tile-icon"><Icon name={q.icon} size={20} /></span>
            <span className="account-tile-text">
              <strong>{q.title}</strong>
              <small>{q.sub}</small>
            </span>
            <span className="account-tile-go" aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>

      <section
        className="card account-card account-section account-rise"
        style={{ "--rise-delay": "240ms" }}
      >
        <div className="account-note">
          <Icon name="shield" size={20} />
          <p>
            We hold only what you signed in with and any PAN you save.{" "}
            <Link href="/privacy">Privacy Policy</Link>
          </p>
        </div>

        <button type="button" className="account-signout" onClick={signOut} disabled={busy}>
          <Icon name="out" size={16} />
          {busy ? "Signing out…" : "Sign out"}
        </button>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

"use client";

/**
 * The account button in the header, and the menu behind it.
 *
 * Signed out it offers Google; signed in it names you and offers a way out.
 * Either way it lists what is coming — a watchlist and allotment alerts —
 * marked plainly as not built yet. Showing the shape of a product is useful;
 * showing a button that silently does nothing is not, so those rows are
 * disabled and say so rather than looking live.
 *
 * Renders nothing at all when Supabase is not configured. A sign-in button
 * that cannot sign anyone in is worse than no button.
 */

import { useEffect, useRef, useState } from "react";
import { displayName, initials, signInWithGoogle, signOut, supabase } from "../../lib/auth";

const COMING_SOON = [
  { key: "watchlist", label: "Watchlist", note: "Follow the issues you care about" },
  { key: "alerts", label: "Allotment alerts", note: "Know the moment allotment is out" },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}

export default function UserMenu() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const client = supabase();
    if (!client) return;
    let alive = true;

    client.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUser(data?.user ?? null);
      setReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const escape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Nothing to offer without Supabase, so nothing is rendered.
  if (!supabase()) return null;

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error } = await signInWithGoogle();
      // On success the browser is already navigating away; only a failure
      // ever gets this far.
      if (error) throw error;
    } catch (err) {
      setError(err?.message || "Could not start sign-in. Please try again.");
      setBusy(false);
    }
  };

  const name = displayName(user);
  const avatar = user?.user_metadata?.avatar_url;

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Account: ${name}` : "Account"}
        onClick={() => setOpen((v) => !v)}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="user-avatar" src={avatar} alt="" width={26} height={26} />
        ) : user ? (
          <span className="user-initials">{initials(user)}</span>
        ) : (
          <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
            <circle cx="10" cy="6.6" r="3.3" stroke="currentColor" strokeWidth="1.7" />
            <path
              d="M3.6 17c.6-3.2 3.3-5.2 6.4-5.2s5.8 2 6.4 5.2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <div className="user-pop" role="menu">
          <div className="user-head">
            {ready && user ? (
              <>
                <span className="user-name">{name}</span>
                {user.email && <span className="user-mail">{user.email}</span>}
              </>
            ) : (
              <>
                <span className="user-name">Not signed in</span>
                <span className="user-mail">
                  Sign in to keep your watchlist across devices
                </span>
              </>
            )}
          </div>

          {ready && !user && (
            <>
              <button
                type="button"
                className="user-google"
                onClick={onGoogle}
                disabled={busy}
              >
                <GoogleMark />
                {busy ? "Opening Google…" : "Continue with Google"}
              </button>
              {error && <p className="user-error">{error}</p>}
              <p className="user-note">
                Signing in creates your account — there is no separate
                registration step.
              </p>
            </>
          )}

          <div className="user-soon">
            {COMING_SOON.map((item) => (
              <button
                key={item.key}
                type="button"
                className="user-item"
                disabled
                aria-disabled="true"
              >
                <span className="user-item-label">{item.label}</span>
                <span className="user-item-note">{item.note}</span>
                <span className="user-soon-tag">Soon</span>
              </button>
            ))}
          </div>

          {ready && user && (
            <button
              type="button"
              className="user-signout"
              onClick={async () => {
                await signOut();
                setOpen(false);
              }}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

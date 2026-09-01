"use client";

/**
 * The account button in the header, and the menu behind it.
 *
 * Signed out it offers whatever the project has actually enabled — email
 * always, Google only once an OAuth client exists for it. Nothing here is
 * hardcoded: asking the server which methods work means the menu can never
 * show a button that answers "provider is not enabled".
 *
 * Signed in it names you and offers a way out. Either way it lists what is
 * coming — a watchlist and allotment alerts — marked plainly as not built
 * yet. Showing the shape of a product is useful; showing a button that
 * silently does nothing is not, so those rows are disabled and say so.
 */

import { useEffect, useRef, useState } from "react";
import {
  displayName,
  enabledMethods,
  initials,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  supabase,
} from "../../lib/auth";

const COMING_SOON = [
  { key: "watchlist", label: "Watchlist", note: "Follow the issues you care about" },
  { key: "alerts", label: "Allotment alerts", note: "Know the moment allotment is out" },
];

const MIN_PASSWORD = 8;

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
  const [methods, setMethods] = useState(null);

  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

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

  // Asked once, and only when the menu is first opened — there is no reason
  // to spend a request on someone who never opens it.
  useEffect(() => {
    if (!open || methods) return;
    enabledMethods().then(setMethods);
  }, [open, methods]);

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

  if (!supabase()) return null;

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (err) {
      setError(err?.message || "Could not start sign-in.");
      setBusy(false);
    }
  };

  const onEmail = async (event) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) return setError("Enter your email address.");
    if (password.length < MIN_PASSWORD) {
      return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await signUpWithEmail(email.trim(), password);
        if (error) throw error;
        // With confirmation on there is no session yet — saying "you're in"
        // when the reader is not would be the wrong message entirely.
        if (!data?.session) {
          setNotice(`Check ${email.trim()} for a link to confirm your account.`);
          setPassword("");
        }
      } else {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) throw error;
        setPassword("");
        setOpen(false);
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const name = displayName(user);
  const avatar = user?.user_metadata?.avatar_url;
  const signedOut = ready && !user;

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
                <span className="user-name">
                  {mode === "signup" ? "Create your account" : "Sign in"}
                </span>
                <span className="user-mail">
                  Keep your watchlist across devices
                </span>
              </>
            )}
          </div>

          {signedOut && (
            <>
              {methods?.google && (
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
                  <p className="user-or">
                    <span>or</span>
                  </p>
                </>
              )}

              <form className="user-form" onSubmit={onEmail}>
                <label className="user-field">
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label className="user-field">
                  <span>Password</span>
                  <input
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`At least ${MIN_PASSWORD} characters`}
                    minLength={MIN_PASSWORD}
                    required
                  />
                </label>
                <button type="submit" className="user-submit" disabled={busy}>
                  {busy
                    ? "Working…"
                    : mode === "signup"
                      ? "Create account"
                      : "Sign in"}
                </button>
              </form>

              {error && <p className="user-error">{error}</p>}
              {notice && <p className="user-notice">{notice}</p>}

              <button
                type="button"
                className="user-switch"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError(null);
                  setNotice(null);
                }}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
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

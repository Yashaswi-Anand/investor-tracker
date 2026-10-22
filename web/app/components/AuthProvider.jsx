"use client";

/**
 * Who is signed in, for the whole app.
 *
 * ONE LISTENER, NOT ONE PER COMPONENT. onAuthStateChanged is the only honest
 * source of truth — it fires after the SDK has restored a session from
 * storage, which is why `loading` starts true and the UI must not conclude
 * "signed out" before it turns false. A header that flashed "Sign in" at
 * someone who is already signed in is the one bug this component exists to
 * prevent.
 *
 * NO HYDRATION MISMATCH. The first client render must match the server's, so
 * the initial state is deliberately the signed-out, still-loading state on
 * both sides. Storage is only read inside the effect.
 *
 * GOOGLE ONLY. No other provider is wired here, and none is enabled in the
 * Firebase project either — that was the requirement, and the two have to
 * agree or the UI offers something the backend refuses.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { authErrorMessage, getFirebaseAuth, isFirebaseConfigured } from "../../lib/firebase";

const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth used outside AuthProvider");
  return value;
}

/** Only what the UI needs. The raw Firebase user carries tokens and internals. */
function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.displayName || null,
    email: user.email || null,
    photo: user.photoURL || null,
    // Useful on an account page, and the one piece of history Firebase keeps
    // that a reader might actually want to see.
    createdAt: user.metadata?.creationTime || null,
    lastSignIn: user.metadata?.lastSignInTime || null,
  };
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    (async () => {
      // Nothing to listen to. Settle into "signed out, not loading" so the UI
      // renders its configured-off state instead of spinning forever.
      if (!isFirebaseConfigured()) {
        if (!cancelled) setLoading(false);
        return;
      }

      let auth;
      try {
        auth = await getFirebaseAuth();
      } catch {
        if (!cancelled) {
          setError("Sign-in is unavailable right now.");
          setLoading(false);
        }
        return;
      }
      if (!auth || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { onAuthStateChanged, getRedirectResult } = await import("firebase/auth");

      // A redirect sign-in finishes here, on the page we came back to. Its
      // failure must not block the listener below, so it is awaited loosely.
      getRedirectResult(auth).catch((redirectError) => {
        const message = authErrorMessage(redirectError);
        if (message && alive.current) setError(message);
      });

      unsubscribe = onAuthStateChanged(
        auth,
        (next) => {
          if (!alive.current) return;
          setUser(publicUser(next));
          setLoading(false);
        },
        () => {
          if (!alive.current) return;
          setError("Could not check your sign-in status.");
          setLoading(false);
        }
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const auth = await getFirebaseAuth();
      if (!auth) {
        setError("Sign-in is not configured on this site yet.");
        return;
      }
      const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } =
        await import("firebase/auth");
      const provider = new GoogleAuthProvider();
      // Always ask which account. Without this, anyone with one Google
      // session is silently signed in as that account with no way to pick
      // another — which on a shared machine is the wrong default.
      provider.setCustomParameters({ prompt: "select_account" });

      try {
        await signInWithPopup(auth, provider);
      } catch (popupError) {
        const code = String(popupError?.code || "");
        // A blocked pop-up is an environment problem, not a refusal — in a
        // webview or the Android TWA there may be no pop-up at all. Fall back
        // to a full-page redirect, which always works.
        if (
          code === "auth/popup-blocked" ||
          code === "auth/operation-not-supported-in-this-environment"
        ) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (signInError) {
      const message = authErrorMessage(signInError);
      if (message) setError(message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const auth = await getFirebaseAuth();
      if (!auth) return;
      const { signOut: fbSignOut } = await import("firebase/auth");
      await fbSignOut(auth);
    } catch {
      if (alive.current) setError("Could not sign you out. Please try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      busy,
      error,
      signIn,
      signOut,
      clearError: () => setError(null),
      configured: isFirebaseConfigured(),
    }),
    [user, loading, busy, error, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

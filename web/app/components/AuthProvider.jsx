"use client";

/**
 * Who is signed in, for the whole app — and the one place that asks.
 *
 * ONE LISTENER, NOT ONE PER COMPONENT. onAuthStateChanged is the only honest
 * source of truth: it fires after the SDK has restored a session from
 * storage, which is why `loading` starts true and the UI must not conclude
 * "signed out" before it turns false. A header that flashed "Sign in" at
 * someone already signed in is the bug this exists to prevent.
 *
 * TWO PROVIDERS, BOTH GOOGLE-OWNED. Google sign-in and phone OTP. Nothing
 * else is wired here and nothing else is enabled in the Firebase project —
 * the two have to agree, or the UI offers what the backend refuses.
 *
 * THE GATE. `requireAuth()` returns a promise: the current user if there is
 * one, otherwise it opens the sign-in dialog and resolves with the user who
 * signs in — or with null if they close it. A caller therefore reads as
 * "ask, then continue if allowed", and cancelling is an answer rather than
 * an error. Nothing navigates, nothing reloads: the dialog closes and the
 * reader is exactly where they were.
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

import {
  authErrorMessage,
  getFirebaseAuth,
  isFirebaseConfigured,
} from "../../lib/firebase";
import { clearLocalPanTraces } from "../../lib/pans";
import SignInDialog from "./SignInDialog";

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
    phone: user.phoneNumber || null,
    photo: user.photoURL || null,
    createdAt: user.metadata?.creationTime || null,
    lastSignIn: user.metadata?.lastSignInTime || null,
    // Which button they actually used, for the account page to state rather
    // than guess.
    providers: (user.providerData || []).map((p) => p?.providerId).filter(Boolean),
  };
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [gateOpen, setGateOpen] = useState(false);
  // Which step the gate opens on. "choose" everywhere except the sign-in
  // page, which shows Google itself and wants the phone form directly.
  const [gateMode, setGateMode] = useState("choose");
  const alive = useRef(true);
  // Callers waiting on requireAuth(). A list, because two buttons pressed in
  // quick succession must both be answered by the one dialog.
  const waiting = useRef([]);
  const recaptcha = useRef(null);

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

      getRedirectResult(auth).catch((redirectError) => {
        const message = authErrorMessage(redirectError);
        if (message && alive.current) setError(message);
      });

      unsubscribe = onAuthStateChanged(
        auth,
        (next) => {
          if (!alive.current) return;
          const shaped = publicUser(next);
          setUser(shaped);
          setLoading(false);
          // Anyone blocked on requireAuth() gets their answer the moment the
          // session is real, not when a particular button's handler returns.
          if (shaped && waiting.current.length) {
            const queue = waiting.current;
            waiting.current = [];
            setGateOpen(false);
            queue.forEach((resolve) => resolve(shaped));
          }
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

  /* ---- Google ---------------------------------------------------------- */

  const signInWithGoogle = useCallback(async () => {
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
      // Always ask which account: silently reusing whichever Google session
      // happens to exist is the wrong default on a shared machine.
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await signInWithPopup(auth, provider);
      } catch (popupError) {
        const code = String(popupError?.code || "");
        // A blocked pop-up is an environment problem, not a refusal — in a
        // webview or the Android TWA there may be no pop-up at all.
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

  /* ---- Phone ----------------------------------------------------------- */

  /**
   * Firebase requires a reCAPTCHA verifier for every phone sign-in on the
   * web. It is invisible, and it is rebuilt whenever a send fails: a spent or
   * errored verifier cannot be reused, and reusing one is the usual cause of
   * a second attempt failing for no visible reason.
   */
  const freshRecaptcha = useCallback(async (auth) => {
    const { RecaptchaVerifier } = await import("firebase/auth");
    if (recaptcha.current) {
      try {
        recaptcha.current.clear();
      } catch {
        /* already gone */
      }
      recaptcha.current = null;
    }
    const host = document.getElementById("recaptcha-host");
    if (!host) throw new Error("no recaptcha host");
    host.innerHTML = "";
    recaptcha.current = new RecaptchaVerifier(auth, host, { size: "invisible" });
    return recaptcha.current;
  }, []);

  /**
   * Sends the code. Returns the confirmation result, which the dialog holds
   * and hands back to confirmPhoneCode().
   */
  const startPhoneSignIn = useCallback(
    async (rawPhone) => {
      setError(null);
      setBusy(true);
      try {
        const auth = await getFirebaseAuth();
        if (!auth) {
          setError("Sign-in is not configured on this site yet.");
          return null;
        }
        const phone = String(rawPhone || "").replace(/\s+/g, "");
        // India only, and deliberately so: the project's SMS region policy
        // allows India and nothing else, so no other country code can
        // receive a code at all. Saying that here is kinder than letting
        // Google answer with a region error the reader cannot act on.
        // The 6-9 opening is the whole of the Indian mobile series.
        if (!/^\+91[6-9]\d{9}$/.test(phone)) {
          setError(
            "Enter a 10-digit Indian mobile number, starting with 6, 7, 8 or 9."
          );
          return null;
        }
        const { signInWithPhoneNumber } = await import("firebase/auth");
        const verifier = await freshRecaptcha(auth);
        return await signInWithPhoneNumber(auth, phone, verifier);
      } catch (sendError) {
        const message = authErrorMessage(sendError);
        if (message) setError(message);
        return null;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [freshRecaptcha]
  );

  /** Checks the six digits. onAuthStateChanged does the rest. */
  const confirmPhoneCode = useCallback(async (confirmation, code) => {
    setError(null);
    setBusy(true);
    try {
      if (!confirmation) {
        setError("That code has expired. Ask for a new one.");
        return false;
      }
      const digits = String(code || "").replace(/\D/g, "");
      if (digits.length !== 6) {
        setError("The code is six digits.");
        return false;
      }
      await confirmation.confirm(digits);
      return true;
    } catch (confirmError) {
      const message = authErrorMessage(confirmError);
      if (message) setError(message);
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  /* ---- out, and the gate ---------------------------------------------- */

  const signOut = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const auth = await getFirebaseAuth();
      if (!auth) return;
      const { signOut: fbSignOut } = await import("firebase/auth");
      await fbSignOut(auth);
      // The notes the allotment page keeps are keyed by `slug|PAN`. They are
      // only written while signed in, but a session that ends anywhere other
      // than that page would otherwise leave them behind in a signed-out
      // browser — so the wipe belongs to the sign-out, not to the page.
      clearLocalPanTraces();
    } catch {
      if (alive.current) setError("Could not sign you out. Please try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const requireAuth = useCallback(
    (mode = "choose") => {
      if (user) return Promise.resolve(user);
      if (!isFirebaseConfigured()) return Promise.resolve(null);
      return new Promise((resolve) => {
        waiting.current.push(resolve);
        setError(null);
        setGateMode(mode === "phone" ? "phone" : "choose");
        setGateOpen(true);
      });
    },
    [user]
  );

  /** Closing the dialog answers every waiting caller with null. Nothing else. */
  const closeGate = useCallback(() => {
    const queue = waiting.current;
    waiting.current = [];
    setGateOpen(false);
    setError(null);
    queue.forEach((resolve) => resolve(null));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      busy,
      error,
      signInWithGoogle,
      startPhoneSignIn,
      confirmPhoneCode,
      signOut,
      requireAuth,
      clearError: () => setError(null),
      configured: isFirebaseConfigured(),
    }),
    [
      user,
      loading,
      busy,
      error,
      signInWithGoogle,
      startPhoneSignIn,
      confirmPhoneCode,
      signOut,
      requireAuth,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* The verifier needs a node that outlives any one dialog, so it lives
          here rather than inside the dialog that triggers it. */}
      <div id="recaptcha-host" />
      {gateOpen ? (
        <SignInDialog initialMode={gateMode} onClose={closeGate} />
      ) : null}
    </AuthContext.Provider>
  );
}

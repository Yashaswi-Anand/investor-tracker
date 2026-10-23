"use client";

/**
 * The sign-in popup, shown when something needs an account.
 *
 * Two ways in, both Google's: the Google button, or a phone number and a
 * six-digit code. Which one is on screen is the whole of this component's
 * state — there is no tab bar, because at the moment of asking a reader
 * wants one path, not a choice of UI.
 *
 * CLOSING IS AN ANSWER. Escape, the backdrop, the × and the explicit "Not
 * now" all do exactly one thing: close. No navigation, no reload, no
 * allotment work started or abandoned halfway. The caller that opened this
 * gets null back and simply does not proceed.
 */

import { useState } from "react";

/**
 * The ten national digits, from whatever the reader actually typed or pasted.
 *
 * A number is shared as often with its prefix as without it — "+91 98765
 * 43210", "0091...", or a trunk "098765...". Simply dropping non-digits and
 * taking the first ten would turn the first of those into 9198765432: a
 * different number, wrong in silence, and sent a code that never arrives.
 * So the prefixes are peeled before the cut, and only ever when there are
 * more than ten digits — 9123456789 is itself a valid mobile, and must
 * survive untouched.
 */
function toNational(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  for (let i = 0; i < 3 && digits.length > 10; i += 1) {
    if (digits.startsWith("91")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    else break;
  }
  return digits.slice(0, 10);
}

import { useAuth } from "./AuthProvider";
import GoogleMark from "./GoogleMark";
import Modal from "./Modal";

export default function SignInDialog({ onClose, initialMode = "choose" }) {
  const { busy, error, signInWithGoogle, startPhoneSignIn, confirmPhoneCode } =
    useAuth();
  const [mode, setMode] = useState(initialMode); // choose | phone | code
  // Ten national digits only. The +91 is fixed and lives outside the input,
  // so there is nothing in here for a reader to delete by accident and no
  // length to get wrong.
  const [national, setNational] = useState("");
  const phone = "+91" + national;
  const complete = national.length === 10;
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const sendCode = async (event) => {
    event.preventDefault();
    if (!complete) return;
    const result = await startPhoneSignIn(phone);
    if (result) {
      setConfirmation(result);
      setMode("code");
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    // On success the auth listener resolves the gate and unmounts this.
    await confirmPhoneCode(confirmation, code);
  };

  return (
    <Modal title="Sign in to continue" onClose={onClose} labelledBy="signin-title">
      {mode === "choose" ? (
        <>
          <p className="modal-lede">
            Checking an allotment needs your PAN, and a PAN needs an account —
            so it is yours on every device and nobody else can reach it.
          </p>

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
            onClick={() => setMode("phone")}
            disabled={busy}
          >
            Use a phone number instead
          </button>
        </>
      ) : null}

      {mode === "phone" ? (
        <form onSubmit={sendCode}>
          <p className="modal-lede">
            We will text you a six-digit code. Standard carrier charges apply.
          </p>
          <label className="modal-field">
            <span className="modal-label">Phone number</span>
            <span className="phone-combo">
              <span className="phone-cc" aria-hidden="true">
                +91
              </span>
              <input
                className="phone-national"
                value={national}
                onChange={(e) => setNational(toNational(e.target.value))}
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                placeholder="9876543210"
                aria-describedby="phone-hint"
              />
            </span>
          </label>
          <p className="modal-hint" id="phone-hint">
            <strong>+91</strong> is added for you — enter the{" "}
            <strong>10 digits</strong> of your mobile number. Indian mobiles
            start with 6, 7, 8 or 9.
          </p>
          <button
            type="submit"
            className="lookup-btn lookup-btn-lg modal-go"
            disabled={busy || !complete}
          >
            {busy ? "Sending…" : "Send code"}
          </button>
          <button
            type="button"
            className="link-btn modal-back"
            onClick={() => setMode("choose")}
            disabled={busy}
          >
            ← Other ways to sign in
          </button>
        </form>
      ) : null}

      {mode === "code" ? (
        <form onSubmit={verify}>
          <p className="modal-lede">
            Enter the code sent to{" "}
            <strong>
              +91 {national.slice(0, 5)} {national.slice(5)}
            </strong>
            .
          </p>
          <label className="modal-field">
            <span className="modal-label">Six-digit code</span>
            <input
              className="pan-input modal-input modal-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
            />
          </label>
          <button type="submit" className="lookup-btn lookup-btn-lg modal-go" disabled={busy}>
            {busy ? "Checking…" : "Verify and continue"}
          </button>
          <button
            type="button"
            className="link-btn modal-back"
            onClick={() => {
              setCode("");
              setMode("phone");
            }}
            disabled={busy}
          >
            ← Use a different number
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="button" className="link-btn modal-dismiss" onClick={onClose}>
        Not now
      </button>
    </Modal>
  );
}

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

import { useAuth } from "./AuthProvider";
import GoogleMark from "./GoogleMark";
import Modal from "./Modal";

export default function SignInDialog({ onClose }) {
  const { busy, error, signInWithGoogle, startPhoneSignIn, confirmPhoneCode } =
    useAuth();
  const [mode, setMode] = useState("choose"); // choose | phone | code
  const [phone, setPhone] = useState("+91");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const sendCode = async (event) => {
    event.preventDefault();
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
            <input
              className="pan-input modal-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+919876543210"
              aria-describedby="phone-hint"
            />
          </label>
          <p className="modal-hint" id="phone-hint">
            Include the country code — <strong>+91</strong> for India.
          </p>
          <button type="submit" className="lookup-btn lookup-btn-lg modal-go" disabled={busy}>
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
            Enter the code sent to <strong>{phone}</strong>.
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

"use client";

/**
 * Add a PAN, in a modal.
 *
 * Shown on the allotment page when a signed-in reader has none saved — once,
 * not on every visit, because the list is read from Firestore before this is
 * allowed to open. Dismissing it is permitted and remembered for the session:
 * someone who came to read the timetable should not be asked twice.
 *
 * Nothing here can run for a signed-out reader. The caller only renders it
 * behind a uid, and lib/pans.js refuses without one anyway.
 */

import { useState } from "react";

import { addPan, MAX_PANS } from "../../lib/pans";
import Modal from "./Modal";

export default function PanModal({ uid, existing, onClose, onAdded }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addPan(uid, draft, existing);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setDraft("");
    if (onAdded) onAdded();
    onClose();
  };

  return (
    <Modal title="Add your PAN" onClose={onClose} labelledBy="pan-modal-title">
      <p className="modal-lede">
        The registrar identifies an application by PAN, so checking an
        allotment needs one. Saved to your account, visible only to you, and
        removable in one tap.
      </p>

      <form onSubmit={submit}>
        <label className="modal-field">
          <span className="modal-label">PAN</span>
          <input
            className="pan-input modal-input modal-pan"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder="ABCDE1234F"
            maxLength={10}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={error ? "true" : undefined}
          />
        </label>
        <p className="modal-hint">
          Five letters, four digits, one letter. You can add up to {MAX_PANS} —
          useful if you apply for the family.
        </p>

        <button
          type="submit"
          className="lookup-btn lookup-btn-lg modal-go"
          disabled={busy || !draft.trim()}
        >
          {busy ? "Saving…" : "Save PAN"}
        </button>
      </form>

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

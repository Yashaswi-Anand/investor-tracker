"use client";

/**
 * The header's sign-in control.
 *
 * Three states, and the order matters. While `loading` it renders a quiet
 * placeholder of the same width as the button, so the header does not jump
 * and nobody is told they are signed out before the SDK has looked. Signed
 * out, it is a link to /login rather than a button that signs in on the spot
 * — a pop-up fired from the header of an article page is startling, and the
 * login page is where the explanation lives. Signed in, it is the account
 * link, showing the Google avatar when there is one.
 *
 * Renders nothing at all when Firebase is not configured, so a build without
 * the env vars simply has no sign-in rather than a control that fails.
 */

import Link from "next/link";
import { useAuth } from "./AuthProvider";

function initial(user) {
  const source = user?.name || user?.email || "?";
  return source.trim().charAt(0).toUpperCase();
}

export default function AuthButton() {
  const { user, loading, configured } = useAuth();

  if (!configured) return null;

  if (loading) {
    return <span className="auth-chip auth-chip-idle" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Link href="/login" className="auth-chip auth-chip-in">
        Sign in
      </Link>
    );
  }

  return (
    <Link
      href="/account"
      className="auth-chip auth-chip-user"
      title={user.email || user.name || "Your account"}
    >
      {user.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photo}
          alt=""
          className="auth-avatar"
          referrerPolicy="no-referrer"
          width={24}
          height={24}
        />
      ) : (
        <span className="auth-avatar auth-avatar-letter" aria-hidden="true">
          {initial(user)}
        </span>
      )}
      <span className="auth-chip-name">
        {user.name ? user.name.split(" ")[0] : "Account"}
      </span>
    </Link>
  );
}

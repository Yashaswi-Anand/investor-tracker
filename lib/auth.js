"use client";

/**
 * Sign-in, in the browser only.
 *
 * The rest of the site reads Supabase over plain REST with the anon key and
 * has no dependencies at all. Auth is the one place worth an SDK: Supabase
 * defaults to the PKCE flow, and hand-rolling a code-verifier exchange and
 * token refresh to save a dependency is the wrong trade on the one path where
 * being subtly wrong is expensive.
 *
 * The session lives in the browser, not in a cookie the server can read.
 * Nothing on this site is per-user yet — every page renders the same public
 * IPO data for everyone — so a client-side session is enough and keeps every
 * page as cacheable and as fast as it is today. The day there is a watchlist
 * to render on the server, this moves to @supabase/ssr and cookies; that is a
 * deliberate later step, not an oversight.
 */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE } from "./config";

let client;

/** The browser client, or null when Supabase is not configured. */
export function supabase() {
  if (!SUPABASE.url || !SUPABASE.anonKey) return null;
  if (!client) {
    client = createClient(SUPABASE.url, SUPABASE.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The OAuth redirect comes back with the code in the URL; letting the
        // SDK consume it is what turns the redirect into a session.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

/**
 * Start Google sign-in.
 *
 * `redirectTo` is this origin rather than a hardcoded one so the same build
 * works on localhost and in production — the allowed list is configured in
 * Supabase, which is the only place that should decide it.
 */
export async function signInWithGoogle() {
  const client = supabase();
  if (!client) throw new Error("Supabase is not configured");
  return client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

export async function signOut() {
  const client = supabase();
  if (client) await client.auth.signOut();
}

/** A display name that is always something: Google gives us one, else email. */
export function displayName(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    (user.email ? user.email.split("@")[0] : null) ||
    "Signed in"
  );
}

export function initials(user) {
  const name = displayName(user);
  if (!name) return null;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

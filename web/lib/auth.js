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
 *
 * WHICH METHODS ARE OFFERED IS NOT HARDCODED. The project publishes what it
 * has enabled at /auth/v1/settings, and the menu asks. Email costs nothing and
 * is on by default; Google is free too but needs an OAuth client set up in
 * Google Cloud first, and until that is done Supabase answers any attempt with
 * "provider is not enabled". Reading the truth from the server means the menu
 * can never offer a button that is going to fail, and Google appears by itself
 * the moment it is switched on — no deploy needed.
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
 * What this project will actually accept, straight from the server.
 *
 * Fails closed to email only: it is the one method enabled by default, and
 * offering nothing at all because a settings call failed would be worse than
 * offering the method that almost certainly works.
 */
export async function enabledMethods() {
  const fallback = { email: true, google: false };
  if (!SUPABASE.url || !SUPABASE.anonKey) return { email: false, google: false };
  try {
    const res = await fetch(`${SUPABASE.url}/auth/v1/settings`, {
      headers: { apikey: SUPABASE.anonKey },
    });
    if (!res.ok) return fallback;
    const body = await res.json();
    const external = body?.external || {};
    return {
      email: external.email !== false,
      google: external.google === true,
      // Confirmation being on means a new account cannot sign in until the
      // reader clicks a link in their inbox, and the form has to say so.
      confirmEmail: body?.mailer_autoconfirm === false,
      signupsOpen: body?.disable_signup !== true,
    };
  } catch {
    return fallback;
  }
}

export async function signInWithGoogle() {
  const client = supabase();
  if (!client) throw new Error("Supabase is not configured");
  return client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

export async function signInWithEmail(email, password) {
  const client = supabase();
  if (!client) throw new Error("Supabase is not configured");
  return client.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email, password) {
  const client = supabase();
  if (!client) throw new Error("Supabase is not configured");
  return client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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

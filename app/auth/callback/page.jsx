"use client";

/**
 * Where Google sends the reader back.
 *
 * The Supabase client is configured with detectSessionInUrl, so simply being
 * constructed on a page carrying the callback parameters is what completes
 * the exchange. This page waits for that to settle and then leaves — the URL
 * still holds the authorisation code at this point, and it has no business
 * staying in history, so the redirect replaces the entry rather than adding
 * one.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/auth";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    const client = supabase();
    if (!client) {
      router.replace("/");
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      router.replace("/");
    };

    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        setError(error.message);
        return;
      }
      if (data?.session) finish();
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    // If nothing has happened in a few seconds the exchange is not coming —
    // a stale link, a cancelled consent screen — and sitting on a blank page
    // forever is the worst of the possible outcomes.
    const giveUp = setTimeout(finish, 6000);

    return () => {
      clearTimeout(giveUp);
      sub?.subscription?.unsubscribe();
    };
  }, [router]);

  return (
    <div className="container page-pad">
      <section className="card card-wide">
        <h2>{error ? "Sign-in failed" : "Signing you in…"}</h2>
        <p className="subtitle subtitle-flush">
          {error || "One moment while we finish setting up your session."}
        </p>
      </section>
    </div>
  );
}

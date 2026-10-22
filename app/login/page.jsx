import { Suspense } from "react";

import LoginPanel from "../components/LoginPanel";

/**
 * Sign in.
 *
 * force-dynamic to match the rest of the site, and noindex because this is
 * machinery, not content: it answers no query anyone types, and a login form
 * in the results would dilute pages that do. It is deliberately absent from
 * sitemap.js for the same reason.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
  description: "Sign in to Investor with your Google account.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="container page-pad">
      <div className="auth-wrap">
        <h1 className="auth-h1">Sign in</h1>
        <p className="subtitle auth-lede">
          Investor uses Google sign-in, and only Google sign-in. No password to
          remember, nothing new to verify.
        </p>
        {/* useSearchParams reads the `next` parameter, which Next requires be
            wrapped so the surrounding page can still be streamed. */}
        <Suspense
          fallback={
            <div className="card card-wide auth-card">
              <p className="auth-status">Loading…</p>
            </div>
          }
        >
          <LoginPanel />
        </Suspense>
      </div>
    </div>
  );
}

import AccountPanel from "../components/AccountPanel";

/**
 * The signed-in reader's own page — the one protected route on this site.
 *
 * noindex and out of the sitemap: there is nothing here a crawler can see,
 * and a page whose content depends on who is asking should not be offered as
 * a search result.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your account",
  description: "Your Investor account.",
  alternates: { canonical: "/account" },
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <div className="container page-pad">
      {/* The panel carries the h1: the reader's own name is the heading. */}
      <div className="auth-wrap account-wrap">
        <AccountPanel />
      </div>
    </div>
  );
}

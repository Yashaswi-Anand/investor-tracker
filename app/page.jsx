import { SITE } from "../lib/config";
import { getAllIpos } from "../lib/data";
import { safeJsonLd } from "../lib/format";
import IpoList from "./components/IpoList";

// Keep in sync with REVALIDATE_SECONDS in lib/config.js — Next.js requires
// a static literal here.
export const revalidate = 600;

export const metadata = {
  title: "IPO GMP Today — Live Grey Market Premium & Subscription Status",
  description:
    "Track every Mainboard and SME IPO in India: live GMP, price band, lot size, minimum investment, subscription status, allotment and listing dates.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const ipos = await getAllIpos();

  const openCount = ipos.filter((i) => i.status === "open").length;
  const upcomingCount = ipos.filter((i) => i.status === "upcoming").length;

  // Structured data helps Google show rich results for the listing page.
  // Only the IPOs actually emitted are counted — declaring a larger
  // numberOfItems than the list contains is a structured-data error.
  const listed = ipos.slice(0, 25);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Live IPOs in India",
    numberOfItems: listed.length,
    itemListElement: listed.map((ipo, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `${ipo.name} IPO`,
      url: `${SITE.url}/ipo/${ipo.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <h1>IPO GMP Today — Live Grey Market Premium</h1>
      <p className="subtitle">
        {openCount > 0
          ? `${openCount} IPO${openCount > 1 ? "s" : ""} open now`
          : "No IPO open right now"}
        {upcomingCount > 0 && ` · ${upcomingCount} upcoming`} · Price band, lot
        size, subscription and allotment dates for Mainboard &amp; SME IPOs.
      </p>

      <IpoList ipos={ipos} />
    </>
  );
}

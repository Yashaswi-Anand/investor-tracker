import { SITE } from "../../lib/config";
import { getAllIpos } from "../../lib/data";
import AllotmentCheck from "../components/AllotmentCheck";

// Which issues are at allotment moves during the day, like everything else
// here, so this is not a build-time snapshot.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "IPO Allotment Status — Check Several PANs at Once",
  description:
    "Check IPO allotment for one or more PAN numbers across every issue at once. Each issue's registrar in one place, with your PAN a tap from the form.",
  alternates: { canonical: "/allotment" },
};

/** Only issues whose allotment has actually happened can be looked up. */
const CHECKABLE = new Set(["allotment", "listed"]);

export default async function AllotmentPage() {
  const all = await getAllIpos();
  const ipos = all
    .filter((ipo) => CHECKABLE.has(ipo.status))
    .map((ipo) => ({
      slug: ipo.slug,
      name: ipo.name,
      short_name: ipo.short_name,
      status: ipo.status,
      registrar: ipo.registrar,
      registrar_url: ipo.registrar_url,
    }));

  return (
    <div className="container page-pad">
      <section className="allot-head">
        <h1 className="news-h1">Check allotment</h1>
        <p className="subtitle news-lede">
          Your PANs and the issues you applied for, on one screen. Every
          registrar puts its status form behind a CAPTCHA, so {SITE.name}{" "}
          cannot fetch the result for you — what it removes is the rest of it:
          finding the right registrar for each issue, retyping a PAN into six
          different forms, and losing track of which ones you already checked.
        </p>
      </section>

      <AllotmentCheck ipos={ipos} />

      <p className="disclaimer news-disclaimer">
        The registrar is the only authority on allotment. Anything recorded
        here is your own note of what you saw on their site, kept in this
        browser — {SITE.name} never receives it.
      </p>
    </div>
  );
}

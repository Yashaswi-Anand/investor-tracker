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
          Your PANs and the issues you applied for, on one screen — the right
          registrar for each, the PAN a tap from their form, and a record of
          what you found.
        </p>

        {/* A callout, not a sentence in a paragraph. The first version of
            this page said the same thing in the lede and it did not land:
            the page looked like it was reporting a status, so a row nobody
            had marked yet was read as "not allotted". */}
        <aside className="allot-notice">
          <h2 className="allot-notice-title">
            {SITE.name} cannot look up your allotment
          </h2>
          <p>
            Only the registrar knows, and every one of them — Bigshare, KFin,
            MUFG Intime, Skyline — puts that answer behind a CAPTCHA, which
            exists precisely to stop a site like this asking on your behalf.
            No IPO site can honestly get past it, and this one does not try.
          </p>
          <p>
            So the last step stays yours: open the registrar, paste the PAN,
            answer their CAPTCHA. The{" "}
            <strong>What the registrar showed</strong> dropdown on each row is
            for afterwards — it records what their page said, so you can see
            at a glance which ones you have already been through.
          </p>
          <p className="allot-notice-alt">
            BSE offers the same lookup for issues listed there, if you find
            their form easier:{" "}
            <a
              href="https://www.bseindia.com/investors/appli_check.aspx"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              bseindia.com application status
            </a>
          </p>
        </aside>
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

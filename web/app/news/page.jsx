import { NEWS, SITE } from "../../lib/config";
import { getNews } from "../../lib/news";
import { fmtDateTime } from "../../lib/format";
import NewsList from "../components/NewsList";

// Same reasoning as every other page here: the feed moves during the day and
// a build-time snapshot would show yesterday's headlines. The fetch inside
// getNews() carries its own cache, so this costs the publisher nothing extra.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "IPO News — Latest Indian IPO Headlines",
  description:
    "The latest Indian IPO news: new issues, listings, subscription and grey market coverage, updated through the day.",
  alternates: { canonical: "/news" },
};

export default async function NewsPage() {
  const articles = await getNews();

  return (
    <div className="container page-pad">
      <section className="news-head">
        <h1>IPO News</h1>
        <p className="subtitle">
          Headlines from{" "}
          <a href={NEWS.publisherUrl} target="_blank" rel="noopener noreferrer nofollow">
            {NEWS.publisher}
          </a>
          , refreshed through the day. Each headline opens the full story on
          their site.
        </p>
      </section>

      {articles.length === 0 ? (
        <section className="card card-wide">
          <p className="subtitle subtitle-flush">
            Headlines are unavailable right now. The IPO data on the rest of
            the site is unaffected.
          </p>
        </section>
      ) : (
        <NewsList articles={articles} />
      )}

      <p className="disclaimer news-disclaimer">
        Headlines and summaries are reproduced from {NEWS.publisher} and remain
        their copyright. {SITE.name} does not write, edit or endorse them, and
        nothing here is investment advice.
      </p>
    </div>
  );
}

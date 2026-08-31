import { NEWS, SITE } from "../../lib/config";
import { getAllIpos } from "../../lib/data";
import { getNews, matchNews } from "../../lib/news";
import NewsFilter from "../components/NewsFilter";

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

/**
 * Which companies have a story, and which stories.
 *
 * Matching happens here, once, with the same matchNews() the detail pages use.
 * The filter in the browser only ever picks from this — one implementation of
 * "is this article about this company", not two.
 *
 * Companies with nothing are left out: a dropdown of names that all lead to an
 * empty list is worse than a shorter list that always answers.
 */
function companiesInTheNews(articles, ipos) {
  const index = new Map(articles.map((a, i) => [a.link, i]));
  return ipos
    .map((ipo) => ({
      slug: ipo.slug,
      name: ipo.short_name || ipo.name,
      indices: matchNews(articles, ipo)
        .map((a) => index.get(a.link))
        .filter((i) => i != null),
    }))
    .filter((c) => c.indices.length > 0)
    .sort((a, b) => b.indices.length - a.indices.length || a.name.localeCompare(b.name));
}

export default async function NewsPage() {
  const [articles, ipos] = await Promise.all([getNews(), getAllIpos()]);
  const companies = articles.length ? companiesInTheNews(articles, ipos) : [];

  return (
    <div className="container page-pad">
      <section className="news-head">
        <p className="news-kicker">
          <span className="news-pulse" aria-hidden="true" />
          Updated through the day
        </p>
        <h1 className="news-h1">IPO News</h1>
        <p className="subtitle news-lede">
          Every Indian IPO story worth reading, in one place — new issues,
          listings, subscription and grey market coverage. Headlines from{" "}
          <a href={NEWS.publisherUrl} target="_blank" rel="noopener noreferrer nofollow">
            {NEWS.publisher}
          </a>
          ; each one opens the full story on their site.
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
        <NewsFilter articles={articles} companies={companies} />
      )}

      <p className="disclaimer news-disclaimer">
        Headlines and summaries are reproduced from {NEWS.publisher} and remain
        their copyright. {SITE.name} does not write, edit or endorse them, and
        nothing here is investment advice.
      </p>
    </div>
  );
}

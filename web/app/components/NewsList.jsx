import { NEWS } from "../../lib/config";
import { fmtDate } from "../../lib/format";

/**
 * A list of headlines.
 *
 * Each item is one link covering the whole card, so the target is the size of
 * the card rather than the size of the text — this is read on phones, and a
 * headline is a bigger thing to hit than a link inside it.
 *
 * `rel="nofollow"` because these are third-party links we did not choose
 * individually, and `noopener` because they open in a new tab.
 *
 * `lead` gives the first story on the news page the width of the page and a
 * larger setting. A feed of twenty identical cards has no shape and nothing to
 * enter it by; one story carrying more weight than the rest is what makes it
 * read as a page rather than a list.
 */

/** "3 hours ago" — the only form of a timestamp anyone reads on news. */
function ago(iso) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  // Past a couple of days "5 days ago" stops meaning anything; give the date.
  return days <= 2 ? `${days} day${days === 1 ? "" : "s"} ago` : fmtDate(iso.slice(0, 10));
}

function Article({ article, lead }) {
  const when = ago(article.published);
  return (
    <li className="news-item" data-lead={lead || undefined}>
      <a
        className="news-link"
        href={article.link}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        <span className="news-eyebrow">
          <span className="news-source">{NEWS.publisher}</span>
          {when && (
            <>
              <span className="news-dot" aria-hidden="true" />
              <time dateTime={article.published}>{when}</time>
            </>
          )}
        </span>

        <h3 className="news-title">{article.title}</h3>
        {article.summary && <p className="news-summary">{article.summary}</p>}

        {/* Decorative: the anchor already says where it goes, and its own
            text is the headline. */}
        <span className="news-go" aria-hidden="true">
          Read the story
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
            <path
              d="M3 8h9M8.5 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </a>
    </li>
  );
}

export default function NewsList({ articles, limit, lead = false }) {
  const items = limit ? (articles || []).slice(0, limit) : articles || [];
  if (!items.length) return null;

  return (
    <ol className="news-list">
      {items.map((article, i) => (
        <Article key={article.link} article={article} lead={lead && i === 0} />
      ))}
    </ol>
  );
}

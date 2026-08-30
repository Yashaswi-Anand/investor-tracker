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

export default function NewsList({ articles, limit }) {
  const items = limit ? (articles || []).slice(0, limit) : articles || [];
  if (!items.length) return null;

  return (
    <ol className="news-list">
      {items.map((article) => (
        <li key={article.link} className="news-item">
          <a
            className="news-link"
            href={article.link}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <h3 className="news-title">{article.title}</h3>
            {article.summary && <p className="news-summary">{article.summary}</p>}
            <p className="news-meta">
              <span className="news-source">{NEWS.publisher}</span>
              {ago(article.published) && (
                <>
                  <span className="news-dot" aria-hidden="true">
                    ·
                  </span>
                  <time dateTime={article.published}>{ago(article.published)}</time>
                </>
              )}
            </p>
          </a>
        </li>
      ))}
    </ol>
  );
}

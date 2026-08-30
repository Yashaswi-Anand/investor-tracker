/**
 * IPO news, read from the publisher's RSS feed.
 *
 * Fetched on the server and cached for NEWS.revalidateSeconds, so the number
 * of requests the publisher sees depends on the clock rather than on how many
 * people are reading the site. The pages themselves are force-dynamic; without
 * that cache every visitor would cost them a request.
 *
 * Headlines and links only — never the article body. The feed carries a short
 * summary and we show a trimmed version of it; the story stays on the
 * publisher's page, where the byline and the advertising are.
 */

import { NEWS } from "./config";

const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;
const TAGS = /<[^>]+>/g;

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

function decode(text) {
  return String(text || "")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code) => {
      if (ENTITIES[code] !== undefined) return ENTITIES[code];
      if (code[0] === "#") {
        const n = code[1] === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of one XML tag, CDATA unwrapped and entities decoded. */
function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return "";
  const inner = match[1];
  const cdata = inner.match(CDATA);
  return decode((cdata ? cdata[1] : inner).replace(TAGS, " "));
}

/** Trim to a word boundary rather than mid-word. */
function trim(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

/**
 * Parse an RSS document into plain article objects.
 *
 * Deliberately a small regex reader rather than an XML dependency: the shape
 * consumed here is five fields of one feed, and a parser would be several
 * times the weight of everything it is parsing.
 */
export function parseFeed(xml) {
  const items = String(xml || "").match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const out = [];

  for (const item of items) {
    const title = tag(item, "title");
    const link = tag(item, "link");
    // Only http(s) links are kept: the feed is third-party input, and a
    // javascript: or data: href would be rendered straight into an anchor.
    if (!title || !/^https?:\/\//i.test(link)) continue;

    const published = Date.parse(tag(item, "pubDate"));
    out.push({
      title,
      link,
      summary: trim(tag(item, "description"), 180),
      published: Number.isFinite(published) ? new Date(published).toISOString() : null,
      publishedMs: Number.isFinite(published) ? published : 0,
    });
  }

  // Newest first, and de-duplicated by link: a feed can carry the same story
  // twice when it has been updated.
  const seen = new Set();
  return out
    .sort((a, b) => b.publishedMs - a.publishedMs)
    .filter((a) => (seen.has(a.link) ? false : seen.add(a.link)));
}

/**
 * The latest IPO stories, or an empty list.
 *
 * Never throws. News is the one thing on this site that is decoration rather
 * than record: if the publisher is unreachable the section simply does not
 * appear, which is a better outcome than an error page over a headline.
 */
export async function getNews() {
  if (!NEWS.feedUrl) return [];
  try {
    const response = await fetch(NEWS.feedUrl, {
      headers: { "User-Agent": NEWS.userAgent, Accept: "application/rss+xml, application/xml, text/xml" },
      next: { revalidate: NEWS.revalidateSeconds },
    });
    if (!response.ok) return [];
    return parseFeed(await response.text());
  } catch {
    return [];
  }
}

/** Words too common to identify a company on their own. */
const STOPWORDS = new Set([
  "limited", "ltd", "india", "indian", "private", "pvt", "company", "co",
  "industries", "enterprises", "group", "the", "and", "of", "services",
  "solutions", "technologies", "tech", "projects", "international",
]);

/**
 * The distinctive words in a company's name.
 *
 * "Hy-Tech Engineers Limited" -> ["hy-tech", "engineers"]. Legal suffixes and
 * words that describe half the market are dropped, because an article
 * matching on "Limited" would match every company there is.
 */
export function nameTokens(ipo) {
  const raw = `${ipo?.short_name || ""} ${ipo?.name || ""}`.toLowerCase();
  const words = raw
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/**
 * Articles that are actually about this IPO.
 *
 * Requires the company's leading distinctive word as a WHOLE word. Substring
 * matching was the first attempt and it is wrong in a way that matters here:
 * "ABH" appears inside "abhi", and an unrelated story filed under a company's
 * name is worse than no story at all on a page people read before spending
 * money. A second token, where the name has one, must appear too.
 */
export function matchNews(articles, ipo) {
  const tokens = nameTokens(ipo);
  if (!tokens.length) return [];

  const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const whole = (w) => new RegExp(`(^|[^a-z0-9])${escape(w)}([^a-z0-9]|$)`, "i");
  const lead = whole(tokens[0]);
  const second = tokens[1] ? whole(tokens[1]) : null;

  return (articles || []).filter((a) => {
    const hay = `${a.title} ${a.summary}`;
    if (!lead.test(hay)) return false;
    // A single distinctive word is enough only when the name has just one.
    return second ? second.test(hay) || tokens[0].length >= 6 : true;
  });
}

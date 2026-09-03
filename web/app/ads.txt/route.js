/**
 * /ads.txt — who is authorised to sell this site's inventory.
 *
 * Generated rather than checked in as a static file, for the same reason the
 * contact address is: a file shipped with "pub-0000000000000000" in it is a
 * lie that sits in production until someone remembers. With no publisher id
 * configured this 404s, which is exactly what a site with no ads should do.
 *
 * The line itself is the one AdSense asks every publisher for. DIRECT means
 * the account is the seller of record; f08c47fec0942fa0 is Google's own
 * certification id and is the same for everyone.
 */

import { ADS } from "../../lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  if (!ADS.publisherId) {
    return new Response("Not found", { status: 404 });
  }

  const body = `google.com, ${ADS.publisherId}, DIRECT, f08c47fec0942fa0\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Crawled daily at most, and a stale copy for an hour costs nothing.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

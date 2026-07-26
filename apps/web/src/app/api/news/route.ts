// Server-side crypto news feed (providers see the server IP, not the user's).
// Public RSS sources, no API key. Returns title, link, source, time + a
// thumbnail URL (loaded through /api/news/img so the image CDN never sees the
// user either). Cached 5 min. ?tab=trending returns the freshest slice.

export const runtime = "nodejs";
export const revalidate = 300;

const FEEDS = [
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml" },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "Decrypt", url: "https://decrypt.co/feed" },
  { source: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/feed" },
];

interface Article {
  title: string;
  link: string;
  source: string;
  ts: number;
  image: string | null;
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function pickImage(b: string): string | null {
  const m =
    b.match(/<media:content[^>]*url="([^"]+)"/i) ||
    b.match(/<media:thumbnail[^>]*url="([^"]+)"/i) ||
    b.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) ||
    b.match(/<enclosure[^>]*type="image[^>]*url="([^"]+)"/i) ||
    b.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

function parse(xml: string, source: string): Article[] {
  const out: Article[] = [];
  for (const b of xml.split(/<item[\s>]/i).slice(1)) {
    const title = pick(b, "title");
    let link = pick(b, "link");
    if (!link) link = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    const date = pick(b, "pubDate") || pick(b, "published") || pick(b, "updated");
    if (!title || !link) continue;
    out.push({ title, link, source, ts: Date.parse(date) || 0, image: pickImage(b) });
  }
  return out;
}

export async function GET(req: Request) {
  const tab = new URL(req.url).searchParams.get("tab");
  const lists = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: { "user-agent": "Mozilla/5.0 (BlackVault news)" },
          signal: AbortSignal.timeout(6000),
          next: { revalidate: 300 },
        });
        return res.ok ? parse(await res.text(), f.source) : [];
      } catch {
        return [];
      }
    })
  );

  let items = lists.flat().filter((a) => a.ts > 0).sort((a, b) => b.ts - a.ts);
  // "trending" = the freshest cross-source slice (no paid signal available).
  if (tab === "trending") items = items.slice(0, 20);
  else items = items.slice(0, 20);

  return Response.json(
    { items },
    { headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } }
  );
}

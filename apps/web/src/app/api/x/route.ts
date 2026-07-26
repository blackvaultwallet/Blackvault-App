// Curated X (Twitter) posts via the public oEmbed endpoint, fetched server-side
// (X never sees the user's IP) and returned as clean JSON — no widgets.js, no
// tracking. Populate CURATED with tweet URLs to feature; empty → empty feed.

export const runtime = "nodejs";
export const revalidate = 300;

// Add tweet URLs to feature them, e.g. "https://x.com/VitalikButerin/status/…".
const CURATED: string[] = [];

interface Post {
  author: string;
  handle: string;
  text: string;
  url: string;
  source: "X";
}

function textFromHtml(html: string): string {
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  return p
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function GET() {
  const posts = await Promise.all(
    CURATED.map(async (url) => {
      try {
        const r = await fetch(
          `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(url)}`,
          { signal: AbortSignal.timeout(6000), next: { revalidate: 300 } }
        );
        if (!r.ok) return null;
        const d = (await r.json()) as { html?: string; author_name?: string; author_url?: string };
        const handle = d.author_url?.split("/").pop() ?? "";
        return {
          author: d.author_name ?? handle,
          handle,
          text: textFromHtml(d.html ?? ""),
          url,
          source: "X" as const,
        } satisfies Post;
      } catch {
        return null;
      }
    })
  );
  return Response.json({ items: posts.filter(Boolean) });
}

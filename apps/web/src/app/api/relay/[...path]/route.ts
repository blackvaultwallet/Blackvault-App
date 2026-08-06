// Same-origin proxy for Relay, on the same principle as the RPC proxy: a quote
// request carries the user's address, the recipient, and the amount, and going
// direct would hand Relay all of that tied to the user's IP. This is a privacy
// wallet — it proxies everything else for exactly this reason, and Relay was
// added without following the rule.
//
// It was also being blocked outright. connect-src never listed api.relay.link,
// so in production every quote failed with "Failed to fetch" before it left the
// browser — funding a wallet and opening a card both, since they share this
// path. Proxying fixes the block and the leak in one move.

import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELAY_API = "https://api.relay.link";

/**
 * Forwards to the same path on Relay, query string included.
 *
 * The path is rebuilt from the segments rather than passed through, so nothing
 * in a URL can redirect this at another host. Only the body and the path
 * travel — no client headers, cookies, or IP.
 */
async function forward(req: Request, segments: string[], body?: string) {
  const path = segments.map(encodeURIComponent).join("/");
  const query = new URL(req.url).search;

  try {
    const upstream = await fetch(`${RELAY_API}/${path}${query}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return new Response('{"error":"relay upstream unreachable"}', {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function POST(req: Request, ctx: Ctx) {
  const limited = await rateLimit(req, "relay", 60, 60);
  if (limited) return limited;

  const body = await req.text();
  if (body.length > 100_000) {
    return new Response('{"error":"payload too large"}', {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }
  return forward(req, (await ctx.params).path, body);
}

// Execution polls a status endpoint Relay names in its own quote response, so
// the path here is theirs, not ours — hence the catch-all rather than a list.
export async function GET(req: Request, ctx: Ctx) {
  const limited = await rateLimit(req, "relay", 120, 60);
  if (limited) return limited;
  return forward(req, (await ctx.params).path);
}

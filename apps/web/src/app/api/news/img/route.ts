// Image proxy for news thumbnails: fetch the remote image server-side and stream
// it back, so the image CDN sees this server's IP, not the user's (same privacy
// principle as the RPC proxy). Only http(s) image responses are relayed.

import { lookup } from "node:dns/promises";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const revalidate = 3600;

// Block SSRF: reject hosts that resolve to loopback/private/link-local ranges,
// so this proxy can't be aimed at internal services or the cloud metadata IP.
function isPrivateAddr(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const p = v4.split(".").map(Number);
  if (p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = p;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) || // link-local + cloud metadata (169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) // CGNAT
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function hostIsSafe(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddr(a.address));
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const limited = await rateLimit(req, "news-img", 120, 60);
  if (limited) return limited;
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response("bad url", { status: 400 });
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!(await hostIsSafe(host))) {
    return new Response("blocked host", { status: 403 });
  }
  try {
    const upstream = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (BlackVault)" },
      signal: AbortSignal.timeout(7000),
      next: { revalidate: 3600 },
    });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) {
      return new Response("not an image", { status: 415 });
    }
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > 5_000_000) return new Response("too large", { status: 413 });
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=3600, s-maxage=86400, immutable",
      },
    });
  } catch {
    return new Response("upstream failed", { status: 502 });
  }
}

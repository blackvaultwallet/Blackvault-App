// Same-origin JSON-RPC proxy for ENS resolution (Ethereum mainnet). Keeps the
// user's IP + the names they look up from leaking to the public ENS provider —
// the provider sees this server's IP instead. (Companion to /api/rpc/evm.)
//
// Note: on-chain ENS reads are covered. CCIP-Read (offchain subnames) makes its
// own gateway fetches from the browser and is not proxied here.

import { rateLimit } from "@/lib/server/rate-limit";

const ENS_TARGET =
  process.env.ENS_RPC_URL ?? process.env.NEXT_PUBLIC_ENS_RPC ?? "https://cloudflare-eth.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await rateLimit(req, "rpc-ens", 120, 60);
  if (limited) return limited;
  const body = await req.text();
  if (body.length > 1_000_000) {
    return new Response('{"error":"payload too large"}', {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const upstream = await fetch(ENS_TARGET, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return new Response('{"error":"ens upstream unreachable"}', {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

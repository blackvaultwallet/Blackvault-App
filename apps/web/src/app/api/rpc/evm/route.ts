// Same-origin JSON-RPC proxy for the EVM chain. Read/broadcast calls from the
// browser hit this route instead of the provider directly, so the provider sees
// this server's IP — not the user's IP correlated with the addresses they query.
// (EVM plan T2.3 — metadata hygiene.)

import { ACTIVE_EVM_RPC_TARGET, ACTIVE_EVM_LOGS_TARGET } from "@/lib/chain/evm/config";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eth_getLogs goes to the wide-range logs endpoint (Blockscout on mainnet);
// everything else to the main provider. Batches only reroute when every entry
// is a getLogs. Blockscout's eth-rpc rejects an EMPTY `topics: []` (viem always
// sends one), so strip it before forwarding.
interface RpcReq {
  method?: string;
  params?: unknown[];
}

function routeRequest(body: string): { target: string; body: string } {
  try {
    const parsed = JSON.parse(body) as RpcReq | RpcReq[];
    const reqs = Array.isArray(parsed) ? parsed : [parsed];
    if (reqs.length > 0 && reqs.every((r) => r?.method === "eth_getLogs")) {
      for (const r of reqs) {
        const f = r.params?.[0] as { topics?: unknown[] } | undefined;
        if (f && Array.isArray(f.topics) && f.topics.length === 0) delete f.topics;
      }
      return { target: ACTIVE_EVM_LOGS_TARGET, body: JSON.stringify(parsed) };
    }
  } catch {
    /* fall through to the main target */
  }
  return { target: ACTIVE_EVM_RPC_TARGET, body };
}

export async function POST(req: Request) {
  // Generous for wallet use — two vaults scanning from one IP (shared wifi,
  // tutorials) burst ~8 getLogs/s combined — while staying hostile to relay abuse.
  const limited = await rateLimit(req, "rpc-evm", 600, 60);
  if (limited) return limited;
  const body = await req.text();
  // JSON-RPC batches are small; cap to avoid abuse as an open relay.
  if (body.length > 1_000_000) {
    return new Response('{"error":"payload too large"}', {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    // Only the body is forwarded — no client headers, cookies, or IP.
    const routed = routeRequest(body);
    const upstream = await fetch(routed.target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: routed.body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return new Response('{"error":"rpc upstream unreachable"}', {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

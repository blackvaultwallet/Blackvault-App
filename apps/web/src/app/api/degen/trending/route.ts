// Trending RH Chain pools for the Private Degen page — GeckoTerminal, fetched
// server-side (CSP stays same-origin; the data host never sees a user IP).
// Top pools + a 24h hourly sparkline each, cached in-memory and shared.

export const runtime = "nodejs";
export const revalidate = 60;

const GT = "https://api.geckoterminal.com/api/v2/networks/robinhood";
const TOP = 8;
// GeckoTerminal sits behind Cloudflare — a browserish UA + explicit accept
// keeps server-side fetches from being challenged.
const HEADERS = { accept: "application/json", "user-agent": "Mozilla/5.0 (BlackVault)" };

interface GtPool {
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string;
    price_change_percentage: { h1?: string; h24?: string };
    volume_usd: { h24?: string };
    reserve_in_usd?: string;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
    transactions?: { h24?: { buys?: number; sells?: number } };
  };
  relationships?: { base_token?: { data?: { id?: string } } };
}

interface GtToken {
  id: string;
  attributes?: { image_url?: string };
}

export interface DegenToken {
  symbol: string;
  pair: string;
  priceUsd: number;
  ch1: number;
  ch24: number;
  vol24: number;
  liquidity: number;
  buys24: number;
  sells24: number;
  spark: number[];
  img: string | null;
  mcap: number;
}

let lastGood: { items: DegenToken[] } | null = null;

async function fetchSpark(pool: string): Promise<number[]> {
  try {
    const r = await fetch(`${GT}/pools/${pool}/ohlcv/hour?limit=24`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 },
    });
    if (!r.ok) return [];
    const d = (await r.json()) as {
      data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
    };
    // ohlcv rows: [ts, open, high, low, close, volume] — newest first; chart wants oldest first.
    return (d.data?.attributes?.ohlcv_list ?? []).map((row) => row[4]).reverse();
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const r = await fetch(`${GT}/trending_pools?include=base_token`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 },
    });
    if (!r.ok) throw new Error("upstream " + r.status);
    const d = (await r.json()) as { data?: GtPool[]; included?: GtToken[] };
    const pools = (d.data ?? []).slice(0, TOP);
    const imgById = new Map(
      (d.included ?? []).map((t) => [t.id, t.attributes?.image_url ?? null])
    );

    const items: DegenToken[] = await Promise.all(
      pools.map(async (p) => {
        const a = p.attributes;
        const tx = a.transactions?.h24;
        const rawImg = imgById.get(p.relationships?.base_token?.data?.id ?? "") ?? null;
        return {
          symbol: a.name.split("/")[0].trim(),
          pair: a.name,
          priceUsd: parseFloat(a.base_token_price_usd) || 0,
          ch1: parseFloat(a.price_change_percentage.h1 ?? "0") || 0,
          ch24: parseFloat(a.price_change_percentage.h24 ?? "0") || 0,
          vol24: parseFloat(a.volume_usd.h24 ?? "0") || 0,
          liquidity: parseFloat(a.reserve_in_usd ?? "0") || 0,
          buys24: tx?.buys ?? 0,
          sells24: tx?.sells ?? 0,
          spark: await fetchSpark(a.address),
          img: rawImg && /^https?:\/\//.test(rawImg) ? rawImg : null,
          mcap: parseFloat(a.market_cap_usd ?? a.fdv_usd ?? "0") || 0,
        };
      })
    );
    lastGood = { items };
  } catch {
    if (!lastGood) return Response.json({ error: "trending fetch failed" }, { status: 502 });
  }
  return Response.json(lastGood, {
    headers: { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600" },
  });
}

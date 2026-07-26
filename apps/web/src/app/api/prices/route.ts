// Market quotes proxy: one cached server-side CoinGecko call shared by all
// users (fixes browser CORS/429 on the free tier, and the price host never
// sees a user IP — same privacy pattern as the RPC/news proxies).

export const runtime = "nodejs";
export const revalidate = 60;

const ENDPOINT =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd" +
  "&ids=solana,ethereum,tether,usd-coin,global-dollar,arbitrum,optimism" +
  "&sparkline=true&price_change_percentage=24h";

// Last good payload survives per server instance, so a 429/timeout upstream
// serves stale quotes instead of blanking the UI.
let lastGood: unknown = null;

export async function GET() {
  try {
    const key = process.env.COINGECKO_API_KEY;
    const res = await fetch(ENDPOINT, {
      headers: key ? { "x-cg-demo-api-key": key } : undefined,
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("upstream " + res.status);
    lastGood = await res.json();
  } catch {
    if (lastGood === null) return Response.json({ error: "market fetch failed" }, { status: 502 });
  }
  return Response.json(lastGood, {
    headers: { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" },
  });
}

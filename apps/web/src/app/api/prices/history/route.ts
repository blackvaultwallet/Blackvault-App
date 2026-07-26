// ETH price history proxy for the portfolio chart: one cached server-side
// CoinGecko market_chart call per timeframe shared by all users (fixes browser
// CORS/429 and satisfies the same-origin CSP; the price host never sees user
// IPs — same pattern as /api/prices).

export const runtime = "nodejs";
export const revalidate = 300;

const ALLOWED_DAYS = new Set(["1", "7", "30", "365"]);

// Last good payload per timeframe survives per server instance, so upstream
// throttling serves stale history instead of an empty chart.
const lastGood = new Map<string, unknown>();

export async function GET(req: Request) {
  const days = new URL(req.url).searchParams.get("days") ?? "7";
  if (!ALLOWED_DAYS.has(days)) {
    return Response.json({ error: "days must be 1, 7, 30, or 365" }, { status: 400 });
  }
  try {
    const key = process.env.COINGECKO_API_KEY;
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=${days}`,
      {
        headers: key ? { "x-cg-demo-api-key": key } : undefined,
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) throw new Error("upstream " + res.status);
    lastGood.set(days, await res.json());
  } catch {
    if (!lastGood.has(days)) {
      return Response.json({ error: "history fetch failed" }, { status: 502 });
    }
  }
  return Response.json(lastGood.get(days), {
    headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" },
  });
}

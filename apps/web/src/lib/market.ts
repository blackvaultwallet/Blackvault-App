"use client";

// Live market quotes via our own /api/prices proxy (server-side CoinGecko call,
// cached 60s and shared by all users — no CORS/429, no user IP exposed).

import { useEffect, useState } from "react";

export interface Quote {
  price: number;
  change24h: number;
  /** 7-day price series for the mini chart (may be empty). */
  sparkline?: number[];
}

const IDS: Record<string, string> = {
  SOL: "solana",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  USDG: "global-dollar",
  ARB: "arbitrum",
  OP: "optimism",
};

// Same-origin proxy; the upstream markets call (price + 24h + sparkline)
// lives in app/api/prices/route.ts.
const ENDPOINT = "/api/prices";

interface MarketItem {
  id: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price: number[] };
}

export async function fetchMarket(): Promise<Record<string, Quote>> {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error("market fetch failed");
  const data = (await res.json()) as MarketItem[];
  const byId: Record<string, string> = {};
  for (const [ticker, id] of Object.entries(IDS)) byId[id] = ticker;

  const out: Record<string, Quote> = {};
  for (const item of data) {
    const ticker = byId[item.id];
    if (!ticker) continue;
    out[ticker] = {
      price: item.current_price ?? 0,
      change24h: item.price_change_percentage_24h ?? 0,
      sparkline: item.sparkline_in_7d?.price ?? [],
    };
  }
  return out;
}

// Fetches on mount and refreshes every 60s. Null until the first load.
export function useMarket(): Record<string, Quote> | null {
  const [quotes, setQuotes] = useState<Record<string, Quote> | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchMarket()
        .then((q) => active && setQuotes(q))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return quotes;
}

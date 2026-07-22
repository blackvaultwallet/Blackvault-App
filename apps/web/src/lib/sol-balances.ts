"use client";

// Solana balances as chain-agnostic TokenBalance[] so the ported UI (portfolio
// card, markets) can render them the same way the EVM side does. Reads via the
// SDK's getPortfolio; SOL native + the registry tokens.

import { useEffect, useState } from "react";
import { createConnection, getPortfolio } from "@blackvault/sdk";
import { TOKENS, SOL_DECIMALS } from "@/lib/tokens";
import type { TokenBalance } from "@/lib/chain/types";

async function fetchSolBalances(address: string): Promise<TokenBalance[]> {
  const p = await getPortfolio(createConnection(), [address]);
  const out: TokenBalance[] = [
    { token: { symbol: "SOL", decimals: SOL_DECIMALS, native: true }, amount: p.totalSol, raw: 0n },
  ];
  for (const t of TOKENS) {
    const amount = p.tokens.find((x) => x.mint === t.mint)?.amount ?? 0;
    out.push({
      token: { symbol: t.symbol, address: t.mint ?? undefined, decimals: t.decimals },
      amount,
      raw: 0n,
    });
  }
  return out;
}

export function useSolBalances(address: string | null) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  async function refresh() {
    if (!address) return;
    setLoading(true);
    try {
      setBalances(await fetchSolBalances(address));
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }

  // Initial + on refresh(): setState only in async callbacks (no sync setState
  // in the effect body).
  useEffect(() => {
    if (!address) return;
    let active = true;
    fetchSolBalances(address)
      .then((b) => active && setBalances(b))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [address, tick]);

  return { balances, loading, refresh: () => setTick((t) => t + 1), refreshNow: refresh };
}

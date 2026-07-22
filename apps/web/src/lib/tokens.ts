// Token registry — devnet build. Mainnet mints land here behind a cluster
// switch when we flip networks (see blackvault-plans mainnet prep).

export interface TokenInfo {
  symbol: string;
  decimals: number;
  /** Mint on the current cluster; null = not available here. */
  mint: string | null;
  /**
   * Mint accepted by the privacy rail. Devnet quirk: Umbra runs its own
   * dUSDC/dUSDT, distinct from the public faucet mints. Same as `mint` on
   * mainnet (official USDC/USDT are Umbra-supported).
   */
  privateMint?: string;
}

export const SOL_DECIMALS = 9;

export const TOKENS: readonly TokenInfo[] = [
  // Public: Circle devnet USDC (faucet.circle.com) · private: Umbra dUSDC
  {
    symbol: "USDC",
    decimals: 6,
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    privateMint: "4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7",
  },
  // Public: self-minted test token (api/dev/usdt) · private: Umbra dUSDT
  {
    symbol: "USDT",
    decimals: 6,
    mint: "GcQFLDNE3zrdE8zrmhd6Aj3AJEtBYQisw4GSD4hQ9vWX",
    privateMint: "DXQwBNGgyQ2BzGWxEriJPVmXYFQBsQbXvfvfSNTaJkL6",
  },
];

export function availableTokens(): TokenInfo[] {
  return TOKENS.filter((t) => t.mint !== null);
}

export function findToken(symbol: string): TokenInfo | undefined {
  return TOKENS.find((t) => t.symbol === symbol);
}

/** Parse a user-typed decimal string into base units. Null on invalid input. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  if (units <= 0n) return null;
  return units;
}

export function fromBaseUnits(units: bigint, decimals: number): number {
  return Number(units) / 10 ** decimals;
}

// Rail-side asset descriptors (see lib/rail.ts).
const WSOL = "So11111111111111111111111111111111111111112";

export function solAsset() {
  return { symbol: "SOL", mint: WSOL, decimals: SOL_DECIMALS, isNative: true };
}

/** Tokens usable on the privacy rail (have a private mint). */
export function privateTokens(): TokenInfo[] {
  return TOKENS.filter((t) => t.privateMint);
}

export function railAsset(symbol: string) {
  if (symbol === "SOL") return solAsset();
  const t = findToken(symbol);
  if (!t?.privateMint) return null;
  return {
    symbol: t.symbol,
    mint: t.privateMint,
    decimals: t.decimals,
    isNative: false,
  };
}

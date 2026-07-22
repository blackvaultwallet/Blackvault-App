// Shared coin presentation for the EVM app: brand icon + display name per
// ticker, so markets / portfolio / private all label coins the same way.

import { EthIcon, UsdcIcon, UsdtIcon, ArbitrumIcon, OptimismIcon } from "@/ui/icons";

const NAMES: Record<string, string> = {
  ETH: "Ethereum",
  USDG: "Global Dollar",
  USDC: "USD Coin",
  USDT: "Tether",
  BV: "BlackVault",
  ARB: "Arbitrum",
  OP: "Optimism",
};

// Market-watch coins that do NOT live on RH Chain — no feather badge on them.
const OFF_CHAIN = new Set(["ARB", "OP"]);

export function coinName(symbol: string): string {
  return NAMES[symbol] ?? symbol;
}

/** Bare brand mark for a ticker (no circle). */
export function coinMark(symbol: string, size = 18): React.ReactNode {
  if (symbol === "ETH") return <EthIcon size={size} />;
  if (symbol === "USDC") return <UsdcIcon size={size} />;
  if (symbol === "USDT") return <UsdtIcon size={size} />;
  if (symbol === "ARB") return <ArbitrumIcon size={size} />;
  if (symbol === "OP") return <OptimismIcon size={size} />;
  return <span className="text-xs font-bold">$</span>; // USDG etc.
}

/** Tiny chain marker overlaid on a coin icon: the Robinhood feather. */
function chainBadge(iconSize: number): React.ReactNode {
  const b = Math.max(10, Math.round(iconSize * 0.42));
  return (
    <span
      className="absolute overflow-hidden"
      style={{
        right: -2,
        bottom: -2,
        width: b,
        height: b,
        border: "1.5px solid var(--bg)",
        borderRadius: "var(--r-pill)",
        background: "#ccff00",
      }}
      aria-label="Robinhood Chain"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/chains/rh.png" alt="" width={b} height={b} className="h-full w-full object-cover" />
    </span>
  );
}

/** Brand mark inside the standard circle used across lists and pickers.
 *  Carries a small RH marker so it's clear the asset lives on Robinhood Chain. */
export function coinIcon(symbol: string, size = 24): React.ReactNode {
  const usdg = symbol === "USDG";
  const bv = symbol === "BV";
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span
        className="flex items-center justify-center"
        style={{
          width: size,
          height: size,
          background:
            symbol === "ETH" ? "#141414" : usdg || bv ? "var(--brand-gradient)" : "var(--surface-2)",
          border: usdg || bv ? "1px solid rgba(216,180,94,0.45)" : "1px solid var(--border)",
          borderRadius: "var(--r-pill)",
        }}
      >
        {usdg || bv ? (
          <span style={{ color: "var(--cta-text)", fontWeight: 800, fontSize: Math.round((size - 8) * 0.95), lineHeight: 1 }}>
            {bv ? "V" : "$"}
          </span>
        ) : (
          coinMark(symbol, size - 8)
        )}
      </span>
      {!OFF_CHAIN.has(symbol) && chainBadge(size)}
    </span>
  );
}

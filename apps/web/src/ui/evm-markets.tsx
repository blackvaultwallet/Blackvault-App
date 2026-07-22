"use client";

// Markets-style "Your Assets" list: coin icon + name + ticker on the left; the
// realtime market price, 24h change, and a mini sparkline on the right. Prices
// come from useMarket (CoinGecko), not the user's holdings. Rendered full-width
// (no card/border) with a hairline between rows.

import { useMarket } from "@/lib/market";
import { USABLE_EVM_TOKENS } from "@/lib/chain/evm/tokens";
import { Skeleton } from "@/ui/primitives";
import { coinIcon, coinName } from "@/ui/evm-coins";

/** Tiny inline price sparkline; stroke tinted green/red by trend. */
function Sparkline({ data, width = 58, height = 22 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return <span style={{ width, height, display: "inline-block" }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const up = data[data.length - 1] >= data[0];
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - 1 - ((v - min) / range) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--positive)" : "var(--negative)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Transactable assets on the active network, then big-cap market-watch rows
// (ARB/OP — prices only, not on RH Chain), with the BlackVault teaser last.
const COINS = [...USABLE_EVM_TOKENS.map((t) => t.symbol), "ARB", "OP", "BV"];

function fmtPrice(p: number): string {
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EvmMarkets() {
  const quotes = useMarket();

  return (
    <div className="flex flex-col">
      {quotes === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="flex flex-col">
          {COINS.map((sym, i) => {
            const q = quotes[sym];
            const change = q?.change24h ?? 0;
            const up = change >= 0;
            return (
              <div
                key={sym}
                className="flex items-center justify-between gap-3 py-3"
                style={{
                  borderBottom:
                    i < COINS.length - 1 ? "1px solid var(--border)" : undefined,
                }}
              >
                {/* left: icon + name/ticker (BV ticker undecided — hidden) */}
                <div className="flex items-center gap-3">
                  {coinIcon(sym, 36)}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{coinName(sym)}</span>
                    <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                      {sym === "BV" ? "Coming soon" : sym}
                    </span>
                  </div>
                </div>

                {/* right: sparkline + price/change (BV: teaser badge) */}
                {sym === "BV" ? (
                  <span
                    className="px-3 py-1 text-[11px] font-semibold"
                    style={{
                      background: "rgba(216,180,94,0.12)",
                      border: "1px solid rgba(216,180,94,0.3)",
                      borderRadius: "var(--r-pill)",
                      color: "var(--brand)",
                    }}
                  >
                    Soon
                  </span>
                ) : (
                  <div className="flex items-center gap-3">
                    <Sparkline data={q?.sparkline ?? []} />
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-sm tabular-nums">
                        {q ? fmtPrice(q.price) : "—"}
                      </span>
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: up ? "var(--positive)" : "var(--negative)" }}
                      >
                        {up ? "+" : ""}
                        {change.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

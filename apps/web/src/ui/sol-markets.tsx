"use client";

// Markets-style "Your Assets" for Solana: coin icon + name + ticker; realtime
// price + 24h change + mini sparkline. Full-width, hairline between rows.
// Duplicated from the EVM markets with SOL/USDC/USDT — dedupe later.

import { useMarket } from "@/lib/market";
import { Skeleton } from "@/ui/primitives";
import { SolanaIcon, UsdcIcon, UsdtIcon } from "@/ui/icons";

type Coin = { symbol: string; name: string; icon: React.ReactNode };

const COINS: Coin[] = [
  { symbol: "SOL", name: "Solana", icon: <SolanaIcon size={18} /> },
  { symbol: "USDC", name: "USD Coin", icon: <UsdcIcon size={22} /> },
  { symbol: "USDT", name: "Tether", icon: <UsdtIcon size={22} /> },
];

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

function fmtPrice(p: number): string {
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SolMarkets() {
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
          {COINS.map((c, i) => {
            const q = quotes[c.symbol];
            const change = q?.change24h ?? 0;
            const up = change >= 0;
            return (
              <div
                key={c.symbol}
                className="flex items-center justify-between gap-3 py-3"
                style={{ borderBottom: i < COINS.length - 1 ? "1px solid var(--border)" : undefined }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center text-base"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-pill)",
                    }}
                  >
                    {c.icon}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                      {c.symbol}
                    </span>
                  </div>
                </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

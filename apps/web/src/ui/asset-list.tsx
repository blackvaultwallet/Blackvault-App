"use client";

// "Your Assets" list (reference style): BlackVault (coming soon) + SOL/USDT/
// USDC with logo, name, ticker, latest market price, 24h change, and a live
// 24h sparkline. Compact list on Home; full page via "View all".

import { SolanaIcon, UsdtIcon, UsdcIcon } from "@/ui/icons";
import { useMarket } from "@/lib/market";

interface Coin {
  name: string;
  ticker: string;
  icon: React.ReactNode;
  iconBg: string;
  price: number | null; // null = coming soon
  change24h: number;
  seed: number;
}

// Static fallback used until live quotes (useMarket) load.
const COINS: Coin[] = [
  {
    name: "BlackVault",
    ticker: "BV",
    icon: <span style={{ color: "var(--cta-text)" }}>V</span>,
    iconBg: "var(--brand-gradient)",
    price: null,
    change24h: 0,
    seed: 1,
  },
  {
    name: "Solana",
    ticker: "SOL",
    icon: <SolanaIcon size={16} />,
    iconBg: "#141414",
    price: 152.34,
    change24h: 2.31,
    seed: 2,
  },
  {
    name: "Tether",
    ticker: "USDT",
    icon: <UsdtIcon size={26} />,
    iconBg: "transparent",
    price: 1.0,
    change24h: 0.02,
    seed: 3,
  },
  {
    name: "USD Coin",
    ticker: "USDC",
    icon: <UsdcIcon size={26} />,
    iconBg: "transparent",
    price: 1.0,
    change24h: -0.03,
    seed: 4,
  },
];

// Full-width area chart used inside the grid cards on the Assets page.
function AreaSpark({ seed, color }: { seed: number; color: string }) {
  const n = 28;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(50 + 13 * Math.sin(i * 0.55 + seed) + 8 * Math.sin(i * 0.21 + seed * 2));
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const norm = (v: number) => 38 - ((v - min) / (max - min || 1)) * 34 - 2;
  const line = pts.map((v, i) => `${(i / (n - 1)) * 100},${norm(v)}`).join(" ");
  const gid = `spark-${seed}`;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-16 w-full" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${line} 100,40`} fill={`url(#${gid})`} className="bv-chart-fill" />
      <polyline
        points={line}
        pathLength={1}
        className="bv-draw"
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BigCoinCard({ c }: { c: Coin }) {
  const up = c.change24h >= 0;
  const color = up ? "var(--positive)" : "var(--negative)";
  const soon = c.price === null;
  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{ background: "var(--surface-solid)", borderRadius: "var(--r-card)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white"
          style={{ background: c.iconBg, borderRadius: "var(--r-pill)" }}
        >
          {c.icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{c.name}</span>
          <span className="block text-xs" style={{ color: "var(--text-dim)" }}>
            {c.ticker}
          </span>
        </span>
      </div>

      {soon ? (
        <div className="flex h-16 items-center justify-center">
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            Coming soon
          </span>
        </div>
      ) : (
        <>
          <AreaSpark seed={c.seed} color={color} />
          <div>
            <p className="font-mono text-lg font-semibold">
              ${c.price!.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs" style={{ color }}>
              {up ? "+" : ""}
              {c.change24h.toFixed(2)}% · 24h
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Sparkline({ seed, color, w = 68, h = 30 }: { seed: number; color: string; w?: number; h?: number }) {
  const n = 24;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(50 + 12 * Math.sin(i * 0.6 + seed) + 7 * Math.sin(i * 0.23 + seed * 2));
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const norm = (v: number) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const line = pts.map((v, i) => `${(i / (n - 1)) * w},${norm(v)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <polyline
        points={line}
        pathLength={1}
        className="bv-draw"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CoinCard({ c }: { c: Coin }) {
  const up = c.change24h >= 0;
  const color = up ? "var(--positive)" : "var(--negative)";
  const soon = c.price === null;

  return (
    <div className="bv-card flex items-center gap-3 p-4">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold text-white"
        style={{ background: c.iconBg, borderRadius: "var(--r-pill)" }}
      >
        {c.icon}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{c.name}</p>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          {c.ticker}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {!soon && <Sparkline seed={c.seed} color={color} />}
        {soon ? (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            Coming soon
          </span>
        ) : (
          <div className="text-right">
            <p className="font-mono text-sm">
              ${c.price!.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs" style={{ color }}>
              {up ? "+" : ""}
              {c.change24h.toFixed(2)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Overlays live quotes onto the static coin list; BlackVault stays coming-soon.
function useLiveCoins(): Coin[] {
  const quotes = useMarket();
  return COINS.map((c) => {
    const q = quotes?.[c.ticker];
    return q ? { ...c, price: q.price, change24h: q.change24h } : c;
  });
}

export function AssetList({ onViewAll }: { onViewAll: () => void }) {
  const coins = useLiveCoins();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Your Assets</h2>
        <button
          onClick={onViewAll}
          className="text-sm underline-offset-2 hover:underline"
          style={{ color: "var(--brand)" }}
        >
          View all
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {coins.map((c) => (
          <CoinCard key={c.ticker} c={c} />
        ))}
      </div>
    </div>
  );
}

export function AssetsScreen() {
  const coins = useLiveCoins();
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
      <div className="grid grid-cols-2 gap-3">
        {coins.map((c) => (
          <BigCoinCard key={c.ticker} c={c} />
        ))}
      </div>
    </div>
  );
}

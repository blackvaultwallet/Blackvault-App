"use client";

// Portfolio transition chart for the Activity tab. Value over time =
// ethBalance × ETH price history (CoinGecko) + stablecoins, so it moves with a
// real series. Drag across the chart for a glowing crosshair showing the value
// + date/time at that point; timeframe selector below (1D/1W/1M/1Y).

import { useEffect, useRef, useState } from "react";

const TFS = [
  { id: "1D", days: 1 },
  { id: "1W", days: 7 },
  { id: "1M", days: 30 },
  { id: "1Y", days: 365 },
] as const;

const W = 320;
const H = 150;
const PAD = 10;

// Same-origin proxy (app/api/prices/history) — cached server-side, CSP-clean.
async function fetchEthHistory(days: number): Promise<[number, number][]> {
  const res = await fetch(`/api/prices/history?days=${days}`);
  if (!res.ok) throw new Error("chart fetch failed");
  const d = (await res.json()) as { prices: [number, number][] };
  return d.prices ?? [];
}

function fmtUsd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtWhen(ms: number, day: boolean): string {
  const d = new Date(ms);
  return day
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function EvmPortfolioChart({
  ethBalance,
  stableTotal,
}: {
  ethBalance: number;
  stableTotal: number;
}) {
  const [tf, setTf] = useState<(typeof TFS)[number]["id"]>("1W");
  const [series, setSeries] = useState<{ t: number; v: number }[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fetch on timeframe/balance change; keep old data visible while loading (no
  // synchronous setState in the effect body).
  useEffect(() => {
    let active = true;
    const days = TFS.find((t) => t.id === tf)!.days;
    fetchEthHistory(days)
      .then((prices) => {
        if (!active) return;
        const step = Math.max(1, Math.floor(prices.length / 120));
        const s = prices
          .filter((_, i) => i % step === 0)
          .map(([ms, price]) => ({ t: ms, v: ethBalance * price + stableTotal }));
        setSeries(s.length > 1 ? s : null);
      })
      .catch(() => active && setSeries(null));
    return () => {
      active = false;
    };
  }, [tf, ethBalance, stableTotal]);

  const pts = series && series.length > 1 ? series : null;
  const isDay = tf !== "1D";

  let min = 0;
  let max = 1;
  let coords: { x: number; y: number }[] = [];
  if (pts) {
    const vs = pts.map((p) => p.v);
    min = Math.min(...vs);
    max = Math.max(...vs);
    const range = max - min || 1;
    coords = pts.map((p, i) => ({
      x: (i / (pts.length - 1)) * W,
      y: H - PAD - ((p.v - min) / range) * (H - 2 * PAD),
    }));
  }

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = pts ? `${line} L${W},${H} L0,${H} Z` : "";

  const activeIdx = hover ?? (pts ? pts.length - 1 : 0);
  const cur = pts ? pts[activeIdx] : null;
  const first = pts ? pts[0].v : 0;
  const change = cur && first ? ((cur.v - first) / first) * 100 : 0;
  const up = change >= 0;
  const active = coords[activeIdx];

  function onMove(e: React.PointerEvent) {
    if (!pts || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const xv = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((xv / W) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, idx)));
  }

  return (
    <div
      className="p-4"
      style={{
        background: "var(--surface-solid)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
      }}
    >
      <style>{`@keyframes bvChartGlow{0%,100%{opacity:.18}50%{opacity:.55}}.bv-chart-glow{animation:bvChartGlow 1.5s ease-in-out infinite}`}</style>

      {/* header: label + value + change */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="bv-label">Portfolio</span>
          <span className="mt-1 flex items-center gap-1 text-xs" style={{ color: up ? "var(--positive)" : "var(--negative)" }}>
            {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </span>
        </div>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {cur ? fmtUsd(cur.v) : "—"}
        </span>
      </div>

      {/* chart */}
      <div
        ref={wrapRef}
        className="relative mt-3 cursor-crosshair select-none"
        style={{ touchAction: "pan-y" }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 150, display: "block" }}>
          <defs>
            <linearGradient id="bvChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--positive)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--positive)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {pts ? (
            <>
              <path d={area} fill="url(#bvChartFill)" />
              <path d={line} fill="none" stroke="var(--positive)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              {active && (
                <>
                  <line x1={active.x} y1="0" x2={active.x} y2={H} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3" />
                  <circle className="bv-chart-glow" cx={active.x} cy={active.y} r="13" fill="var(--positive)" />
                  <circle cx={active.x} cy={active.y} r="4" fill="var(--positive)" stroke="var(--bg)" strokeWidth="1.5" />
                </>
              )}
            </>
          ) : (
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
          )}
        </svg>

        {/* crosshair time label */}
        {cur && (
          <div className="mt-1 text-center text-[11px]" style={{ color: "var(--text-dim)" }}>
            {fmtWhen(cur.t, isDay)}
          </div>
        )}
      </div>

      {/* timeframe selector */}
      <div className="mt-3 flex items-center justify-center gap-1">
        {TFS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTf(t.id);
              setHover(null);
            }}
            className="bv-press rounded-full px-4 py-1.5 text-xs font-medium"
            style={{
              background: tf === t.id ? "var(--brand-soft)" : "transparent",
              color: tf === t.id ? "var(--brand)" : "var(--text-dim)",
            }}
          >
            {t.id}
          </button>
        ))}
      </div>
    </div>
  );
}

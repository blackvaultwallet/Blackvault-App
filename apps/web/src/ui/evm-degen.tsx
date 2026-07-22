"use client";

// Private Degen — full-fidelity preview (reference: DEXTools-style board).
// Everything renders with REAL realtime data for trending RH Chain tokens
// (via /api/degen/trending): running price ticker, portfolio + private pool
// cards, and a trending list with sparklines. The whole page sits under a
// dark under-development overlay so nothing is clickable yet.

import { useEffect, useState } from "react";
import { Skeleton } from "@/ui/primitives";

interface DegenToken {
  symbol: string;
  pair: string;
  priceUsd: number;
  ch1: number;
  ch24: number;
  vol24: number;
  liquidity: number;
  buys24: number;
  sells24: number;
  spark: number[];
  img: string | null;
  mcap: number;
}

/* tiny helpers */
function fmtPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(3)}`;
}
function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
const chColor = (c: number) => (c >= 0 ? "var(--positive)" : "var(--negative)");
const chText = (c: number) => `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`;

function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return <span style={{ width: 64, height: 24, display: "inline-block" }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 64},${22 - ((v - min) / span) * 20}`)
    .join(" ");
  return (
    <svg width="64" height="24" viewBox="0 0 64 24" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--positive)" : "var(--negative)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* token logo (proxied) with a letter-avatar fallback */
function TokenAvatar({ symbol, img }: { symbol: string; img: string | null }) {
  if (img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/news/img?url=${encodeURIComponent(img)}`}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        style={{ border: "1px solid var(--border)" }}
        loading="lazy"
      />
    );
  }
  const hues = [42, 130, 200, 265, 320, 15];
  const h = hues[(symbol.charCodeAt(0) + symbol.length) % hues.length];
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold"
      style={{
        background: `linear-gradient(140deg, hsl(${h},55%,28%), hsl(${h},45%,14%))`,
        border: "1px solid var(--border)",
        borderRadius: "var(--r-pill)",
        color: `hsl(${h},70%,70%)`,
      }}
    >
      {symbol.slice(0, 3)}
    </span>
  );
}

export function EvmDegen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<DegenToken[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/degen/trending")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { items: DegenToken[] }) => active && setItems(d.items ?? []))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="relative w-full">
      <style>{`@keyframes bv-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>

      {/* floating back — above the overlay, always tappable */}
      <button
        onClick={onBack}
        aria-label="Back"
        className="bv-press fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "var(--r-pill)",
          color: "var(--text)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* page content — scrollable but inert (pointer events off) */}
      <div className="flex flex-col gap-4 px-4 pb-24 pt-16" aria-hidden style={{ pointerEvents: "none" }}>
        {/* running price ticker */}
        <div
          className="overflow-hidden py-2"
          style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
        >
          {items && items.length > 0 ? (
            <div
              className="flex w-max gap-6 whitespace-nowrap"
              style={{ animation: "bv-ticker 30s linear infinite" }}
            >
              {[...items, ...items].map((t, i) => (
                <span key={`${t.symbol}-${i}`} className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold">{t.symbol}</span>
                  <span className="font-mono" style={{ color: "var(--text-dim)" }}>{fmtPrice(t.priceUsd)}</span>
                  <span className="font-mono" style={{ color: chColor(t.ch24) }}>{chText(t.ch24)}</span>
                </span>
              ))}
            </div>
          ) : (
            <Skeleton className="h-4 w-full" />
          )}
        </div>

        {/* private degen portfolio */}
        <div
          className="flex flex-col p-5"
          style={{
            background:
              "linear-gradient(160deg, rgba(216,180,94,0.18), transparent 60%), var(--surface-solid)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-card)",
          }}
        >
          <span className="bv-label">Private Degen portfolio</span>
          <p className="mt-2 font-mono text-4xl font-semibold tabular-nums">
            $0<span style={{ color: "var(--text-faint)" }}>.00</span>
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            Positions stay shielded — visible only to you.
          </p>
          <div className="mt-4 flex gap-2">
            {["Send", "Receive", "Swap Private"].map((a) => (
              <span
                key={a}
                className="flex h-10 flex-1 items-center justify-center text-xs font-semibold"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "var(--r-pill)",
                }}
              >
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* private pool */}
        <div
          className="flex flex-col gap-3 p-5"
          style={{ background: "var(--surface-solid)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-card)" }}
        >
          <div className="flex items-center justify-between">
            <span className="bv-label">Private pool</span>
            <span
              className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--brand-soft)", color: "var(--brand)", borderRadius: "var(--r-pill)" }}
            >
              Shielded
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Pool TVL", "•••••"],
              ["Your share", "•••••"],
              ["Est. APY", "•••••"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl px-2 py-3" style={{ background: "var(--surface-2)" }}>
                <p className="font-mono text-sm">{v}</p>
                <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>{l}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-4" style={{ color: "var(--text-dim)" }}>
            Deposit into the shielded pool to trade degen tokens without linking positions
            to your public wallet.
          </p>
        </div>

        {/* trending list */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Hot on RH Chain</h2>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--positive)" }} /> live
          </span>
        </div>
        <div className="flex flex-col gap-2 pb-6">
          {items === null ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : (
            items.map((t) => (
              <div
                key={t.pair}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ background: "var(--surface-solid)", border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TokenAvatar symbol={t.symbol} img={t.img} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.symbol}</p>
                    <p className="truncate text-[10px]" style={{ color: "var(--text-faint)" }}>
                      MC <span style={{ color: "var(--text-dim)" }}>{t.mcap > 0 ? fmtUsd(t.mcap) : "—"}</span>
                      {" · "}Vol <span style={{ color: "var(--text-dim)" }}>{fmtUsd(t.vol24)}</span>
                      {" · "}Liq {fmtUsd(t.liquidity)}
                    </p>
                  </div>
                </div>
                <Spark data={t.spark} up={t.ch24 >= 0} />
                <div className="flex w-[86px] flex-col items-end">
                  <span className="font-mono text-xs tabular-nums">{fmtPrice(t.priceUsd)}</span>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: chColor(t.ch24) }}>
                    {chText(t.ch24)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* under-development veil — pinned to the viewport so the label stays
          put while the inert content scrolls beneath (clicks blocked by the
          content's pointer-events, not the veil) */}
      <div
        className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-end pb-24"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.55) 26%, rgba(0,0,0,0.55))",
        }}
      >
        <span
          className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest"
          style={{
            background: "var(--brand-soft)",
            border: "1px solid rgba(216,180,94,0.4)",
            borderRadius: "var(--r-pill)",
            color: "var(--brand)",
          }}
        >
          Under development
        </span>
        <p className="mt-3 max-w-[260px] text-center text-xs leading-5" style={{ color: "var(--text-dim)" }}>
          Private Degen is coming soon — shielded trading for RH Chain degen tokens.
        </p>
      </div>
    </div>
  );
}

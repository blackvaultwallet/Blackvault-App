"use client";

// Portfolio deck (reference style): the front card is the total portfolio value
// (+ 24h change + quick actions); behind it sit the assets you actually hold,
// each showing its own value, tucked under but still readable. Swipe the front
// card up to roll the next card forward.

import { useEffect, useRef, useState } from "react";
import { EthIcon, UsdcIcon, UsdtIcon } from "@/ui/icons";
import type { TokenBalance } from "@/lib/chain/types";

/* 24h portfolio sparkline (reference style: value left, trend right).
   Series = ethBalance × ETH 24h price history + stables (same-origin proxy). */
function PortfolioSpark({ ethBalance, stableTotal, hidden }: { ethBalance: number; stableTotal: number; hidden: boolean }) {
  const [closes, setCloses] = useState<number[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/prices/history?days=1")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { prices: [number, number][] }) => {
        if (!active) return;
        const step = Math.max(1, Math.floor((d.prices?.length ?? 0) / 40));
        setCloses((d.prices ?? []).filter((_, i) => i % step === 0).map(([, p]) => p));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (hidden || !closes || closes.length < 2) return null;
  const series = closes.map((p) => ethBalance * p + stableTotal);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const up = series[series.length - 1] >= series[0];
  const color = up ? "var(--positive)" : "var(--negative)";
  const W = 96;
  const H = 46;
  const pts = series
    .map((v, i) => `${(i / (series.length - 1)) * W},${H - 4 - ((v - min) / span) * (H - 8)}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${up ? "rgba(121,217,156,0.45)" : "rgba(248,113,113,0.45)"})` }}
      />
    </svg>
  );
}

type Visual = { name: string; icon: React.ReactNode; iconBg: string; card: string; tint: string };

const VISUALS: Record<string, Visual> = {
  ETH: {
    name: "Ethereum",
    icon: <EthIcon size={18} />,
    iconBg: "#141414",
    card: "linear-gradient(160deg, rgba(98,126,234,0.34), rgba(140,120,240,0.10) 42%, transparent 72%), var(--surface-solid)",
    tint: "linear-gradient(90deg, rgba(98,126,234,0.38), transparent 70%), var(--surface-solid)",
  },
  USDG: {
    name: "Global Dollar",
    icon: <span style={{ color: "var(--cta-text)", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>$</span>,
    iconBg: "var(--brand-gradient)",
    card: "linear-gradient(160deg, rgba(216,180,94,0.36), transparent 66%), var(--surface-solid)",
    tint: "linear-gradient(90deg, rgba(216,180,94,0.38), transparent 70%), var(--surface-solid)",
  },
  USDC: {
    name: "USD Coin",
    icon: <UsdcIcon size={18} />,
    iconBg: "transparent",
    card: "linear-gradient(160deg, rgba(39,117,202,0.36), transparent 66%), var(--surface-solid)",
    tint: "linear-gradient(90deg, rgba(39,117,202,0.38), transparent 70%), var(--surface-solid)",
  },
  USDT: {
    name: "Tether",
    icon: <UsdtIcon size={18} />,
    iconBg: "transparent",
    card: "linear-gradient(160deg, rgba(38,161,123,0.36), transparent 66%), var(--surface-solid)",
    tint: "linear-gradient(90deg, rgba(38,161,123,0.38), transparent 70%), var(--surface-solid)",
  },
};

const TOTAL_CARD =
  "linear-gradient(160deg, rgba(216,180,94,0.16), transparent 60%), var(--surface-solid)";
const TOTAL_TINT =
  "linear-gradient(90deg, rgba(216,180,94,0.24), transparent 70%), var(--surface-solid)";

// BlackVault's own token — teased in the deck until it ships.
const BV_VISUAL: Visual = {
  name: "BlackVault",
  icon: <span style={{ color: "var(--cta-text)", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>V</span>,
  iconBg: "var(--brand-gradient)",
  card: "linear-gradient(160deg, rgba(216,180,94,0.42), rgba(216,180,94,0.08) 50%, transparent 75%), var(--surface-solid)",
  tint: "linear-gradient(90deg, rgba(216,180,94,0.45), transparent 70%), var(--surface-solid)",
};

const ACTIONS = ["Send", "Receive", "NFC", "Card"] as const;
const NfcIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M9 8.5a5 5 0 0 1 0 7" />
    <path d="M12 6a8.5 8.5 0 0 1 0 12" />
    <path d="M15 3.5a12 12 0 0 1 0 17" />
  </svg>
);
const CardIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" strokeLinecap="round" />
    <path d="M7 15h4" strokeLinecap="round" />
  </svg>
);
const ACTION_ICON: Record<(typeof ACTIONS)[number], React.ReactNode> = {
  Send: "↑",
  Receive: "↓",
  NFC: NfcIcon,
  Card: CardIcon,
};

function usdParts(v: number): [string, string] {
  const [i, f] = v.toFixed(2).split(".");
  return [`$${Number(i).toLocaleString("en-US")}`, `.${f}`];
}

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12c2.5-5 6-7 10-7s7.5 2 10 7c-2.5 5-6 7-10 7s-7.5-2-10-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5l16 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.5 5.5A9.6 9.6 0 0 1 12 5c4 0 7.5 2 10 7a15 15 0 0 1-2.4 3.2M6.2 7.6C4.4 8.9 3 10.6 2 12c2.5 5 6 7 10 7 1.2 0 2.3-.2 3.4-.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 10.1a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

type Card =
  | { kind: "total" }
  | { kind: "asset"; b: TokenBalance; v: Visual }
  | { kind: "soon"; v: Visual };

export function EvmPortfolioCard({
  balances,
  priceOf,
  changeOf,
  onAction,
}: {
  balances: TokenBalance[];
  priceOf: (symbol: string) => number;
  /** 24h price change % for a symbol (0 if unknown). */
  changeOf: (symbol: string) => number;
  onAction: (action: (typeof ACTIONS)[number]) => void;
}) {
  // Total now, and 24h ago derived from each asset's own change — so the delta
  // is the real portfolio move, not one coin's.
  let total = 0;
  let prev = 0;
  for (const b of balances) {
    const p = priceOf(b.token.symbol);
    const c = changeOf(b.token.symbol);
    total += b.amount * p;
    prev += (b.amount * p) / (1 + c / 100 || 1);
  }
  const deltaUsd = total - prev;
  const deltaPct = prev ? (deltaUsd / prev) * 100 : 0;
  const up = deltaUsd >= 0;

  // ETH always gets a card (even at zero) so the deck never feels empty;
  // other assets appear once held.
  const held = balances
    .filter((b) => (b.amount > 0 || b.token.symbol === "ETH") && VISUALS[b.token.symbol])
    .sort((a, b) => b.amount * priceOf(b.token.symbol) - a.amount * priceOf(a.token.symbol));

  // Front card is always the total; the assets you hold sit behind it, and the
  // BlackVault token teaser closes the deck.
  const cards: Card[] = [
    { kind: "total" },
    ...held.map((b) => ({ kind: "asset" as const, b, v: VISUALS[b.token.symbol] })),
    { kind: "soon", v: BV_VISUAL },
  ];
  const n = cards.length;

  const [hidden, setHidden] = useState(false);

  // Rotation offset instead of an order array, so the deck adapts as balances load.
  const [rot, setRot] = useState(0);
  const [rolling, setRolling] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, startT: 0, dy: 0, active: false });

  const at = (i: number) => cards[(rot + i) % n];

  function setY(dy: number, animate: boolean) {
    const c = cardRef.current;
    if (!c) return;
    c.style.transition = animate
      ? "transform 300ms var(--ease-out), opacity 300ms var(--ease-out)"
      : "none";
    c.style.transform = `translateY(${dy}px) rotate(${dy / 45}deg)`;
    c.style.opacity = String(Math.max(1 + dy / 260, 0));
  }

  function promote() {
    if (n < 2) return;
    setRolling(true);
    setY(-240, true);
    const c = cardRef.current;
    setTimeout(() => {
      setRot((r) => (r + 1) % n);
      if (c) {
        c.style.transition = "none";
        c.style.transform = "translateY(16px) scale(0.96)";
        c.style.opacity = "0";
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            c.style.transition =
              "transform 300ms var(--ease-out), opacity 300ms var(--ease-out)";
            c.style.transform = "translateY(0) rotate(0)";
            c.style.opacity = "1";
            setTimeout(() => setRolling(false), 320);
          })
        );
      } else {
        setRolling(false);
      }
    }, 260);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (rolling || drag.current.active || n < 2) return;
    drag.current = { startY: e.clientY, startT: performance.now(), dy: 0, active: true };
    cardRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active || rolling) return;
    const dy = Math.min(e.clientY - drag.current.startY, 0); // up only
    drag.current.dy = dy;
    setY(dy, false);
  }
  function onPointerUp() {
    if (!drag.current.active || rolling) return;
    drag.current.active = false;
    const { dy, startT } = drag.current;
    const velocity = Math.abs(dy) / Math.max(performance.now() - startT, 1);
    if (dy < -90 || (velocity > 0.5 && dy < -30)) promote();
    else setY(0, true);
  }

  if (n === 0) return null;

  const front = at(0);
  const frontValue =
    front.kind === "total" ? total : front.kind === "asset" ? front.b.amount * priceOf(front.b.token.symbol) : 0;
  const [intPart, fracPart] = usdParts(frontValue);

  return (
    <div className="flex flex-col">
      {/* front card — swipe up to roll to the next */}
      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="bv-beam relative z-20 flex cursor-grab select-none flex-col p-5 active:cursor-grabbing"
        style={{
          height: 236,
          background: front.kind === "total" ? TOTAL_CARD : front.v.card,
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--r-card)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          touchAction: "pan-x",
        }}
      >
        <div className="flex items-center justify-between">
          {front.kind === "total" ? (
            <span className="bv-label">Portfolio value</span>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center"
                style={{
                  background: front.v.iconBg,
                  border: front.v.iconBg === "transparent" ? "none" : "1px solid var(--border)",
                  borderRadius: "var(--r-pill)",
                }}
              >
                {front.v.icon}
              </span>
              <span className="bv-label">
                {front.v.name}
                {front.kind === "asset" ? " value" : " token"}
              </span>
            </div>
          )}
          <button
            onClick={() => setHidden((h) => !h)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={hidden ? "Show balances" : "Hide balances"}
            className="bv-press flex h-7 w-7 items-center justify-center"
            style={{ color: "var(--text-dim)" }}
          >
            {hidden ? <EyeOff /> : <Eye />}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-4xl font-semibold tabular-nums">
              {front.kind === "soon" ? (
                <span style={{ color: "var(--brand)" }}>Soon</span>
              ) : hidden ? (
                "•••••"
              ) : (
                <>
                  {intPart}
                  <span style={{ color: "var(--text-faint)" }}>{fracPart}</span>
                </>
              )}
            </p>

            {front.kind === "soon" ? (
              <p className="mt-1.5 text-sm" style={{ color: "var(--text-dim)" }}>
                Our native token — coming soon
              </p>
            ) : front.kind === "total" ? (
              <p
                className="mt-1.5 text-xs"
                style={{ color: hidden ? "var(--text-faint)" : up ? "var(--positive)" : "var(--negative)" }}
              >
                {hidden ? (
                  "•••••"
                ) : (
                  <>
                    {up ? "▲" : "▼"} {up ? "+" : "−"}${Math.abs(deltaUsd).toFixed(2)} ({up ? "+" : ""}
                    {deltaPct.toFixed(2)}%)
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1.5 text-sm" style={{ color: "var(--text-dim)" }}>
                {hidden ? "•••••" : `${Number(front.b.amount.toFixed(6)).toString()} ${front.b.token.symbol}`}
              </p>
            )}
          </div>

          {front.kind === "total" && (
            <PortfolioSpark
              ethBalance={balances.find((b) => b.token.symbol === "ETH")?.amount ?? 0}
              stableTotal={Math.max(
                0,
                total - (balances.find((b) => b.token.symbol === "ETH")?.amount ?? 0) * priceOf("ETH")
              )}
              hidden={hidden}
            />
          )}
        </div>

        <div className="mt-auto flex justify-between px-2">
          {ACTIONS.map((a) => (
            <button
              key={a}
              onClick={() => onAction(a)}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="bv-action bv-press text-lg">{ACTION_ICON[a]}</span>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                {a}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* the next cards, tucked under but readable */}
      {[1, 2].slice(0, Math.max(0, n - 1)).map((offset, i) => {
        const c = at(offset);
        const label = c.kind === "total" ? "Portfolio" : c.v.name;
        const value =
          c.kind === "total" ? total : c.kind === "asset" ? c.b.amount * priceOf(c.b.token.symbol) : 0;
        const [uInt, uFrac] = usdParts(value);
        return (
          <div
            key={c.kind === "total" ? "total" : c.kind === "asset" ? c.b.token.symbol : "bv-soon"}
            className="relative flex items-center justify-between px-4 pb-3 pt-6"
            style={{
              marginTop: -16,
              marginInline: 6 * (i + 1),
              zIndex: 10 - i,
              background: c.kind === "total" ? TOTAL_TINT : c.v.tint,
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-card)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
            }}
          >
            <span className="flex items-center gap-2.5 text-sm font-medium">
              {c.kind !== "total" && (
                <span
                  className="flex h-7 w-7 items-center justify-center"
                  style={{
                    background: c.v.iconBg,
                    border: c.v.iconBg === "transparent" ? "none" : "1px solid var(--border)",
                    borderRadius: "var(--r-pill)",
                  }}
                >
                  {c.v.icon}
                </span>
              )}
              {label}
            </span>
            <span className="font-mono text-sm tabular-nums">
              {c.kind === "soon" ? (
                <span style={{ color: "var(--brand)" }}>Soon</span>
              ) : hidden ? (
                "•••••"
              ) : (
                <>
                  {uInt}
                  <span style={{ color: "var(--text-faint)" }}>{uFrac}</span>
                </>
              )}
            </span>
          </div>
        );
      })}

      {n > 1 && (
        <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
          Swipe the card up to switch
        </p>
      )}
    </div>
  );
}

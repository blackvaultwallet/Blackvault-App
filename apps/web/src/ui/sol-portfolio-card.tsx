"use client";

// Solana portfolio deck (same reference style as the EVM one): front card = total
// portfolio value + 24h change + quick actions; held assets sit behind it, each
// showing its own value. Swipe up to roll. Duplicated from the EVM card with
// SOL/USDC/USDT visuals — dedupe into a shared generic later.

import { useRef, useState } from "react";
import { SolanaIcon, UsdcIcon, UsdtIcon } from "@/ui/icons";
import type { TokenBalance } from "@/lib/chain/types";

type Visual = { name: string; icon: React.ReactNode; iconBg: string; card: string; tint: string };

const VISUALS: Record<string, Visual> = {
  SOL: {
    name: "Solana",
    icon: <SolanaIcon size={16} />,
    iconBg: "#141414",
    card: "linear-gradient(160deg, rgba(153,69,255,0.34), rgba(20,241,149,0.10) 42%, transparent 72%), var(--surface-solid)",
    tint: "linear-gradient(90deg, rgba(153,69,255,0.38), transparent 70%), var(--surface-solid)",
  },
  USDC: {
    name: "USD Coin",
    icon: <UsdcIcon size={20} />,
    iconBg: "transparent",
    card: "linear-gradient(160deg, rgba(39,117,202,0.36), transparent 66%), var(--surface-solid)",
    tint: "linear-gradient(90deg, rgba(39,117,202,0.38), transparent 70%), var(--surface-solid)",
  },
  USDT: {
    name: "Tether",
    icon: <UsdtIcon size={20} />,
    iconBg: "transparent",
    card: "linear-gradient(160deg, rgba(38,161,123,0.36), transparent 66%), var(--surface-solid)",
    tint: "linear-gradient(90deg, rgba(38,161,123,0.38), transparent 70%), var(--surface-solid)",
  },
};

const TOTAL_CARD =
  "linear-gradient(160deg, rgba(216,180,94,0.16), transparent 60%), var(--surface-solid)";
const TOTAL_TINT =
  "linear-gradient(90deg, rgba(216,180,94,0.24), transparent 70%), var(--surface-solid)";

const ACTIONS = ["Send", "Receive", "Private", "More"] as const;
const ACTION_ICON: Record<(typeof ACTIONS)[number], string> = {
  Send: "↑",
  Receive: "↓",
  Private: "◈",
  More: "⋯",
};

function usdParts(v: number): [string, string] {
  const [i, f] = v.toFixed(2).split(".");
  return [`$${Number(i).toLocaleString("en-US")}`, `.${f}`];
}

type Card = { kind: "total" } | { kind: "asset"; b: TokenBalance; v: Visual };

export function SolPortfolioCard({
  balances,
  priceOf,
  changeOf,
  onAction,
}: {
  balances: TokenBalance[];
  priceOf: (symbol: string) => number;
  changeOf: (symbol: string) => number;
  onAction: (action: (typeof ACTIONS)[number]) => void;
}) {
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

  const held = balances
    .filter((b) => b.amount > 0 && VISUALS[b.token.symbol])
    .sort((a, b) => b.amount * priceOf(b.token.symbol) - a.amount * priceOf(a.token.symbol));

  const cards: Card[] = [
    { kind: "total" },
    ...held.map((b) => ({ kind: "asset" as const, b, v: VISUALS[b.token.symbol] })),
  ];
  const n = cards.length;

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
    const dy = Math.min(e.clientY - drag.current.startY, 0);
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
    front.kind === "total" ? total : front.b.amount * priceOf(front.b.token.symbol);
  const [intPart, fracPart] = usdParts(frontValue);

  return (
    <div className="flex flex-col">
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
            <span className="bv-label">{front.v.name} value</span>
          </div>
        )}

        <p className="mt-2 font-mono text-4xl font-semibold tabular-nums">
          {intPart}
          <span style={{ color: "var(--text-faint)" }}>{fracPart}</span>
        </p>

        {front.kind === "total" ? (
          <p className="mt-1.5 text-xs" style={{ color: up ? "var(--positive)" : "var(--negative)" }}>
            {up ? "▲" : "▼"} {up ? "+" : "−"}${Math.abs(deltaUsd).toFixed(2)} ({up ? "+" : ""}
            {deltaPct.toFixed(2)}%)
          </p>
        ) : (
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-dim)" }}>
            {Number(front.b.amount.toFixed(6)).toString()} {front.b.token.symbol}
          </p>
        )}

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

      {[1, 2].slice(0, Math.max(0, n - 1)).map((offset, i) => {
        const c = at(offset);
        const label = c.kind === "total" ? "Portfolio" : c.v.name;
        const value = c.kind === "total" ? total : c.b.amount * priceOf(c.b.token.symbol);
        const [uInt, uFrac] = usdParts(value);
        return (
          <div
            key={c.kind === "total" ? "total" : c.b.token.symbol}
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
              {c.kind === "asset" && (
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
              {uInt}
              <span style={{ color: "var(--text-faint)" }}>{uFrac}</span>
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

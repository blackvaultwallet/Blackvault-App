"use client";

// Asset card deck (reference style): front card shows the USD value big, with
// the coin amount as subline; behind it the other assets peek as stacked bars
// (coin name + USD value), tinted by each coin's brand color.
// Swipe the front card UP → it rolls away and the next asset takes its place.

import { useEffect, useRef, useState } from "react";
import { createConnection, getPortfolio } from "@blackvault/sdk";
import { useVaultWallet } from "@/lib/wallet";
import { TOKENS } from "@/lib/tokens";
import { SolanaIcon, UsdtIcon, UsdcIcon } from "@/ui/icons";
import { useMarket } from "@/lib/market";

type AssetKey = "SOL" | "USDT" | "USDC";

// Fallback prices until live quotes load.
const FALLBACK: Record<AssetKey, number> = { SOL: 152.34, USDT: 1, USDC: 1 };

const ASSETS: {
  key: AssetKey;
  icon: React.ReactNode;
  iconBg: string;
  cardGradient: string;
  barBg: string;
}[] = [
  {
    key: "SOL",
    icon: <SolanaIcon size={14} />,
    iconBg: "#141414",
    // tint layer over a fully opaque base so cards never blend into each other
    cardGradient:
      "linear-gradient(160deg, rgba(153,69,255,0.34), rgba(20,241,149,0.10) 42%, transparent 72%), var(--surface-solid)",
    barBg:
      "linear-gradient(90deg, rgba(153,69,255,0.34), transparent 66%), var(--surface-solid)",
  },
  {
    key: "USDT",
    icon: <UsdtIcon size={22} />,
    iconBg: "transparent",
    cardGradient:
      "linear-gradient(160deg, rgba(38,161,123,0.36), transparent 66%), var(--surface-solid)",
    barBg:
      "linear-gradient(90deg, rgba(38,161,123,0.34), transparent 66%), var(--surface-solid)",
  },
  {
    key: "USDC",
    icon: <UsdcIcon size={22} />,
    iconBg: "transparent",
    cardGradient:
      "linear-gradient(160deg, rgba(39,117,202,0.36), transparent 66%), var(--surface-solid)",
    barBg:
      "linear-gradient(90deg, rgba(39,117,202,0.34), transparent 66%), var(--surface-solid)",
  },
];

const ACTIONS: { icon: string; label: string; tab: string }[] = [
  { icon: "＋", label: "Deposit", tab: "vault" },
  { icon: "−", label: "Withdraw", tab: "vault" },
  { icon: "↓", label: "Receive", tab: "move" },
  { icon: "⋯", label: "More", tab: "settings" },
];

function usdParts(
  amount: number | null,
  key: AssetKey,
  price: Record<AssetKey, number>
): [string, string] {
  if (amount === null) return ["$—", ""];
  const [i, f] = (amount * price[key]).toFixed(2).split(".");
  return [`$${Number(i).toLocaleString("en-US")}`, `.${f}`];
}

function coinAmount(amount: number | null, key: AssetKey): string {
  if (amount === null) return `— ${key}`;
  const trimmed = Number(amount.toFixed(4)).toString();
  return `${trimmed} ${key}`;
}

export function AssetDeck({
  refreshKey,
  privateSol,
  onAction,
}: {
  refreshKey?: number;
  privateSol: number | null;
  onAction: (tab: string) => void;
}) {
  const { isConnected, address } = useVaultWallet();
  const quotes = useMarket();
  const price: Record<AssetKey, number> = {
    SOL: quotes?.SOL?.price ?? FALLBACK.SOL,
    USDT: quotes?.USDT?.price ?? FALLBACK.USDT,
    USDC: quotes?.USDC?.price ?? FALLBACK.USDC,
  };
  const [order, setOrder] = useState([0, 1, 2]);
  const [balances, setBalances] = useState<Record<AssetKey, number | null>>({
    SOL: null,
    USDT: null,
    USDC: null,
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, startT: 0, dy: 0, active: false });
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) return;
    let active = true;
    getPortfolio(createConnection(), [address])
      .then((p) => {
        if (!active) return;
        const find = (sym: string) =>
          p.tokens.find(
            (t) => t.mint === TOKENS.find((r) => r.symbol === sym)?.mint
          )?.amount ?? 0;
        setBalances({ SOL: p.totalSol, USDT: find("USDT"), USDC: find("USDC") });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isConnected, address, refreshKey]);

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
    setRolling(true);
    setY(-240, true);
    const c = cardRef.current;
    setTimeout(() => {
      setOrder((o) => [o[1], o[2], o[0]]);
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
    if (rolling || drag.current.active) return;
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

  if (!isConnected) return null;

  const front = ASSETS[order[0]];
  const [usdInt, usdFrac] = usdParts(balances[front.key], front.key, price);

  return (
    <div className="flex flex-col">
      {/* front card — swipe up to roll to the next asset */}
      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative z-20 flex cursor-grab select-none flex-col p-5 active:cursor-grabbing"
        style={{
          height: 236,
          background: front.cardGradient,
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--r-card)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          touchAction: "pan-x",
        }}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center"
            style={{
              background: front.iconBg,
              border: front.iconBg === "transparent" ? "none" : "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
            }}
          >
            {front.icon}
          </span>
          <span className="bv-label">{front.key} value</span>
        </div>

        <p className="mt-3 text-center font-mono text-4xl font-semibold tabular-nums">
          {usdInt}
          <span style={{ color: "var(--text-faint)" }}>{usdFrac}</span>
        </p>

        <p className="mt-1.5 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          {coinAmount(balances[front.key], front.key)}
          {front.key === "SOL" && privateSol !== null && privateSol > 0 && (
            <span style={{ color: "var(--brand)" }}> · ◈ {privateSol} shielded</span>
          )}
        </p>

        <div className="mt-auto flex justify-between px-2">
          {ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => onAction(a.tab)}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="bv-action bv-press text-lg">{a.icon}</span>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* stacked peek bars: ticker (left) + USD value (right), tinted by coin */}
      {[order[1], order[2]].map((idx, i) => {
        const a = ASSETS[idx];
        const [uInt, uFrac] = usdParts(balances[a.key], a.key, price);
        return (
          <div
            key={a.key}
            className="relative flex items-center justify-between px-4"
            style={{
              height: 52,
              marginTop: 8,
              marginInline: i === 0 ? 8 : 16,
              zIndex: 10 - i,
              background: a.barBg,
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-card)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
            }}
          >
            <span className="flex items-center gap-2.5 text-sm font-medium">
              <span
                className="flex h-7 w-7 items-center justify-center"
                style={{
                  background: a.iconBg,
                  border: a.iconBg === "transparent" ? "none" : "1px solid var(--border)",
                  borderRadius: "var(--r-pill)",
                }}
              >
                {a.icon}
              </span>
              {a.key}
            </span>
            <span className="font-mono text-sm">
              {uInt}
              <span style={{ color: "var(--text-faint)" }}>{uFrac}</span>
            </span>
          </div>
        );
      })}

      <p
        className="mt-2 text-center text-[11px]"
        style={{ color: "var(--text-faint)" }}
      >
        Swipe the card up to switch asset
      </p>
    </div>
  );
}

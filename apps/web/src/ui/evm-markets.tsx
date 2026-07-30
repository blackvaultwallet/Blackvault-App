"use client";

// "Your Assets": what you actually hold. Icon + name + 24h change on the left,
// mini 7-day chart and then your balance over its dollar value on the right.
// Holdings come from the balance reads; the change and the price behind the
// dollar figure come from useMarket (CoinGecko).
//
// Market quotes are keyed by symbol against a fixed allowlist in lib/market,
// which is what keeps a user-added token from inheriting the price of a real
// one that happens to share its ticker. Tokens with no quote show "—" rather
// than a zero, because we don't know their value — we're not guessing at it.

import { useState } from "react";
import { useMarket, type Quote } from "@/lib/market";
import { USABLE_EVM_TOKENS } from "@/lib/chain/evm/tokens";
import { readCustomTokens, removeCustomToken } from "@/lib/chain/evm/custom-tokens";
import { addCard, hasCard, removeCard } from "@/lib/chain/evm/card-watchlist";
import { useToast } from "@/components/toast";
import { coinIcon, coinName } from "@/ui/evm-coins";
import { MinusIcon, PlusIcon, SwipeRow, TrashIcon, type SwipeAction } from "@/ui/swipe-row";
import type { TokenBalance, TokenRef } from "@/lib/chain/types";

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

/** Lettered disc for user-added tokens — there's no logo to look up. */
function LetterIcon({ symbol, size = 36 }: { symbol: string; size?: number }) {
  return (
    <span
      className="flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--border)",
        color: "var(--text-dim)",
        fontSize: size * 0.4,
      }}
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}

function fmtAmount(n: number): string {
  if (n === 0) return "0";
  // Small balances need the extra places; large ones would just look noisy.
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 4 : 6 });
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function AssetRow({
  token,
  amount,
  quote,
  custom,
}: {
  // `name` only exists on user-added tokens; the curated ones get theirs from
  // coinName().
  token: TokenRef & { name?: string };
  amount: number;
  quote?: Quote;
  custom?: boolean;
}) {
  const change = quote?.change24h ?? 0;
  const up = change >= 0;
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        {custom ? <LetterIcon symbol={token.symbol} /> : coinIcon(token.symbol, 36)}
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {custom ? token.name ?? token.symbol : coinName(token.symbol)}
          </span>
          {quote ? (
            <span
              className="text-xs tabular-nums"
              style={{ color: up ? "var(--positive)" : "var(--negative)" }}
            >
              {up ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              {custom ? "Not verified" : "—"}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Sparkline data={quote?.sparkline ?? []} />
        <div className="flex flex-col items-end">
          <span className="font-mono text-sm tabular-nums">
            {fmtAmount(amount)} {token.symbol}
          </span>
          <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
            {quote ? fmtUsd(amount * quote.price) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function EvmMarkets({
  owner,
  balances = [],
  onCardsChange,
}: {
  owner?: string | null;
  balances?: TokenBalance[];
  /** Bumped when the deck selection changes, so the parent can re-read it. */
  onCardsChange?: () => void;
}) {
  const quotes = useMarket();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  // Local tick: the stores are plain localStorage, so a write needs a nudge to
  // show up. Cheaper than threading the whole list through the parent.
  const [tick, setTick] = useState(0);

  const custom = owner ? readCustomTokens(owner) : [];
  const rows: { token: TokenRef; custom?: boolean }[] = [
    ...USABLE_EVM_TOKENS.map((token) => ({ token })),
    ...custom.map((token) => ({ token, custom: true })),
  ];
  const allTokens = rows.map((r) => r.token);

  const amountOf = (t: TokenRef) =>
    balances.find((b) =>
      t.native
        ? b.token.native
        : !!t.address && b.token.address?.toLowerCase() === t.address.toLowerCase()
    )?.amount ?? 0;

  function actionsFor(token: TokenRef, isCustom?: boolean): SwipeAction[] {
    if (!owner) return [];
    const pinned = hasCard(owner, allTokens, token);
    const out: SwipeAction[] = [
      pinned
        ? {
            label: "Remove card",
            icon: MinusIcon,
            bg: "#4a4a52",
            onSelect: () => {
              removeCard(owner, allTokens, token);
              setTick((n) => n + 1);
              onCardsChange?.();
            },
          }
        : {
            label: "Add card",
            icon: PlusIcon,
            bg: "var(--brand)",
            onSelect: () => {
              try {
                addCard(owner, allTokens, token);
                setTick((n) => n + 1);
                onCardsChange?.();
              } catch (e) {
                toast("error", (e as Error).message);
              }
            },
          },
    ];
    // Only user-added tokens can leave the list — the built-in ones aren't
    // ours to hide, they're what the wallet supports.
    if (isCustom) {
      out.push({
        label: "Delete",
        icon: TrashIcon,
        bg: "var(--negative)",
        onSelect: () => {
          removeCard(owner, allTokens, token);
          removeCustomToken(owner, token.address!);
          setTick((n) => n + 1);
          onCardsChange?.();
        },
      });
    }
    return out;
  }

  return (
    <div className="flex flex-col" key={tick}>
      {rows.map((r, i) => {
        const id = r.token.address ?? r.token.symbol;
        return (
          <SwipeRow
            key={id}
            id={id}
            openId={openId}
            onOpenChange={setOpenId}
            actions={actionsFor(r.token, r.custom)}
            style={{
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : undefined,
            }}
          >
            <AssetRow
              token={r.token}
              amount={amountOf(r.token)}
              quote={quotes?.[r.token.symbol]}
              custom={r.custom}
            />
          </SwipeRow>
        );
      })}
    </div>
  );
}

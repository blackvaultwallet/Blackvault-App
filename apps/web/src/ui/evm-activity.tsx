"use client";

// Activity tab (EVM): portfolio transition chart on top, then a scroll-contained
// transaction history (page stays put, only the list scrolls). Each row opens a
// slide-up detail sheet with the explorer link. A clock filter widens the time
// window. Timestamps are estimated from block delta (~0.35s/block) to avoid a
// per-tx RPC call; native ETH transfers + full history live on the explorer.

import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  getAddress,
  type Address,
} from "viem";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { EVM_TOKENS } from "@/lib/chain/evm/tokens";
import { mapLimit } from "@/lib/chain/evm/async-util";
import { EvmPortfolioChart } from "@/ui/evm-portfolio-chart";
import { readPrivateLog } from "@/lib/chain/evm/private-log";
import { readJournal, type JournalKind } from "@/lib/activity-journal";
import { Skeleton, Segmented } from "@/ui/primitives";
import type { TokenBalance, TokenRef } from "@/lib/chain/types";

const publicClient = createPublicClient({ chain: ACTIVE_EVM_CHAIN, transport: http() });
const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);
const CHUNK = BigInt(process.env.NEXT_PUBLIC_EVM_LOG_RANGE ?? "900");
const explorer = ACTIVE_EVM_CHAIN.blockExplorers?.default.url ?? "";
const MS_PER_BLOCK = 350; // ~0.35s/block on this Orbit L2

// Fixed window, no picker: local journal + private log show the last 24h
// (max 20 rows rendered); the raw on-chain scan stays shallow (~1h of blocks)
// to keep the tab fast — everything older lives on the explorer.
const LOOKBACK_BLOCKS = 10300n;
const WINDOW_MS = 24 * 3_600_000;

interface Item {
  hash: string;
  block: bigint;
  ts: number; // estimated ms
  token: TokenRef;
  amount: number;
  dir: "in" | "out";
  counterparty: string;
}

// Unified history row — public on-chain transfer, a local private entry, or a
// semantic journal action (name purchase, QR pay, payment request…).
interface Row {
  key: string;
  ts: number;
  kind: "public" | "private" | "journal";
  dir: "in" | "out" | "none";
  symbol: string;
  amount: number;
  hash?: string;
  block?: bigint;
  counterparty?: string;
  title?: string;
  jkind?: JournalKind;
}

// One getLogs per (direction, chunk) across ALL contracts (no address filter),
// then keep only our known tokens — 2 calls per chunk instead of 6, and chunks
// run 5 at a time. The old shape was ~200 sequential calls and crawled.
async function fetchTransfers(owner: Address, lookback: bigint): Promise<Item[]> {
  const latest = await publicClient.getBlockNumber();
  const nowMs = Date.now();
  const from = latest > lookback ? latest - lookback : 0n;
  const byAddr = new Map(
    EVM_TOKENS.filter((t) => !t.native && t.address).map((t) => [t.address!.toLowerCase(), t])
  );

  const ranges: [bigint, bigint][] = [];
  for (let s = from; s <= latest; s += CHUNK) {
    ranges.push([s, s + CHUNK - 1n < latest ? s + CHUNK - 1n : latest]);
  }

  const perDir = await Promise.all(
    (["out", "in"] as const).map((dir) =>
      mapLimit(ranges, 5, async ([start, end]) => {
        try {
          const logs = await publicClient.getLogs({
            event: TRANSFER,
            args: dir === "out" ? { from: owner } : { to: owner },
            fromBlock: start,
            toBlock: end,
          });
          const out: Item[] = [];
          for (const l of logs) {
            const token = byAddr.get(l.address.toLowerCase());
            if (!token) continue;
            out.push({
              hash: l.transactionHash,
              block: l.blockNumber,
              ts: nowMs - Number(latest - l.blockNumber) * MS_PER_BLOCK,
              token,
              amount: Number(formatUnits(l.args.value ?? 0n, token.decimals)),
              dir,
              counterparty: (dir === "out" ? l.args.to : l.args.from) ?? "",
            });
          }
          return out;
        } catch {
          return [] as Item[]; // skip a flaky chunk
        }
      })
    )
  );

  return perDir
    .flat(2)
    .sort((a, b) => Number(b.block - a.block));
}

function relTime(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function EvmActivity({
  address,
  balances,
}: {
  address: string | null;
  balances: TokenBalance[];
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Row | null>(null);

  const ethBalance = balances.find((b) => b.token.symbol === "ETH")?.amount ?? 0;
  const stableTotal = balances
    .filter((b) => b.token.symbol !== "ETH")
    .reduce((s, b) => s + b.amount, 0);

  useEffect(() => {
    if (!address) return;
    let active = true;
    const now = Date.now();

    // Local entries render immediately — the on-chain scan streams in after.
    const prv: Row[] = readPrivateLog(address)
      .filter((e) => now - e.ts <= WINDOW_MS)
      .map((e) => ({
        key: `priv-${e.id}`,
        ts: e.ts,
        kind: "private",
        dir: e.kind === "claim" ? "in" : "out",
        symbol: e.symbol,
        amount: e.amount,
      }));
    const journal = readJournal(address).filter((e) => now - e.ts <= WINDOW_MS);
    const jHashes = new Set(journal.filter((e) => e.hash).map((e) => e.hash!.toLowerCase()));
    const jr: Row[] = journal.map((e) => ({
      key: `jr-${e.id}`,
      ts: e.ts,
      kind: "journal",
      dir: e.dir,
      symbol: e.symbol ?? "",
      amount: e.amount ?? 0,
      hash: e.hash,
      counterparty: e.detail,
      title: e.title,
      jkind: e.kind,
    }));
    const local = [...prv, ...jr].sort((a, b) => b.ts - a.ts);
    queueMicrotask(() => active && setRows(local));

    fetchTransfers(getAddress(address), LOOKBACK_BLOCKS)
      .then((items) => {
        if (!active) return;
        // Rows that carry a tx hash already covered by a journal entry are
        // dropped — the semantic entry wins.
        const pub: Row[] = items
          .filter((it) => !jHashes.has(it.hash.toLowerCase()))
          .map((it, i) => ({
            key: `pub-${it.hash}-${it.dir}-${i}`,
            ts: it.ts,
            kind: "public",
            dir: it.dir,
            symbol: it.token.symbol,
            amount: it.amount,
            hash: it.hash,
            block: it.block,
            counterparty: it.counterparty,
          }));
        setRows([...pub, ...local].sort((a, b) => b.ts - a.ts));
      })
      .catch(() => {
        /* keep the local rows already shown */
      });
    return () => {
      active = false;
    };
  }, [address]);

  // Journal actions count as public-side wallet activity in the filter.
  // Rendered list caps at 20 — full history lives on the explorer.
  const visible =
    rows
      ?.filter((r) =>
        filter === "all"
          ? true
          : filter === "private"
            ? r.kind === "private"
            : r.kind === "public" || r.kind === "journal"
      )
      .slice(0, 20) ?? null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] w-full max-w-md flex-col gap-4 px-6 sm:px-8">
      <EvmPortfolioChart ethBalance={ethBalance} stableTotal={stableTotal} />

      {/* history header — last 24h, full history on the explorer */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Transaction History</h2>
        {address && explorer && (
          <a
            href={`${explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs"
            style={{ color: "var(--brand)" }}
          >
            See all
          </a>
        )}
      </div>

      {/* All / Private / Public */}
      <Segmented
        options={[
          { id: "all", label: "All" },
          { id: "private", label: "Private" },
          { id: "public", label: "Public" },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {/* scroll-contained history */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        {visible === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : visible.length === 0 ? (
          <p className="pt-6 text-center text-sm" style={{ color: "var(--text-dim)" }}>
            No {filter === "all" ? "" : `${filter} `}transactions in the last 24h.
          </p>
        ) : (
          <div className="flex flex-col">
            {visible.map((r) => {
              const priv_ = r.kind === "private";
              const jr = r.kind === "journal";
              const glyph = jr ? journalGlyph(r.jkind) : priv_ ? "◈" : r.dir === "in" ? "↓" : "↑";
              const gold = priv_ || (jr && (r.jkind === "name" || r.jkind === "name-change"));
              return (
                <button
                  key={r.key}
                  onClick={() => setSelected(r)}
                  className="bv-press flex items-center justify-between gap-3 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center text-base"
                      style={{
                        background: gold ? "var(--brand-soft)" : "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-pill)",
                        color: gold ? "var(--brand)" : r.dir === "in" ? "var(--positive)" : "var(--text-dim)",
                      }}
                    >
                      {glyph}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {jr
                          ? r.title
                          : `${r.dir === "in" ? "Received" : "Sent"} ${r.symbol}${priv_ ? " privately" : ""}`}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                        {jr
                          ? `${r.hash ? "Public · on-chain" : "Wallet action"} · ${relTime(r.ts)}`
                          : `${priv_ ? "Private · hidden" : "Public · on-chain"} · ${relTime(r.ts)}`}
                      </span>
                    </div>
                  </div>
                  {r.dir !== "none" && r.amount > 0 && (
                    <span
                      className="font-mono text-sm tabular-nums"
                      style={{ color: r.dir === "in" ? "var(--positive)" : "var(--text)" }}
                    >
                      {r.dir === "in" ? "+" : "−"}
                      {Number(r.amount.toFixed(6)).toString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <TxDetailSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ---------- transaction detail bottom sheet ---------- */

function journalGlyph(k?: JournalKind): string {
  if (k === "name" || k === "name-change") return "✦";
  if (k === "request-created") return "▤";
  if (k === "send-qr") return "▣";
  return "↑";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
        {label}
      </span>
      <span className="max-w-[60%] truncate text-right font-mono text-xs">{value}</span>
    </div>
  );
}

function TxDetailSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const short = (a?: string) =>
    a ? (a.length > 20 && a.startsWith("0x") ? `${a.slice(0, 8)}…${a.slice(-6)}` : a) : "—";
  const priv_ = row?.kind === "private";
  const jr = row?.kind === "journal";
  return (
    <Drawer.Root open={!!row} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background: "var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          {row && (
            <div className="p-6 pb-8">
              <div
                className="mx-auto mb-5 h-1 w-10"
                style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
              />
              <div className="flex flex-col items-center">
                <span
                  className="flex h-12 w-12 items-center justify-center text-xl"
                  style={{
                    background: priv_ || jr ? "var(--brand-soft)" : "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-pill)",
                    color: priv_ || jr ? "var(--brand)" : row.dir === "in" ? "var(--positive)" : "var(--text-dim)",
                  }}
                >
                  {jr ? journalGlyph(row.jkind) : priv_ ? "◈" : row.dir === "in" ? "↓" : "↑"}
                </span>
                {jr && <p className="mt-3 text-center text-base font-semibold">{row.title}</p>}
                {(!jr || (row.dir !== "none" && row.amount > 0)) && (
                  <p className={`${jr ? "mt-1" : "mt-3"} font-mono text-2xl font-semibold tabular-nums`}>
                    {row.dir === "in" ? "+" : "−"}
                    {Number(row.amount.toFixed(6)).toString()} {row.symbol}
                  </p>
                )}
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                  {jr
                    ? `Wallet action · ${relTime(row.ts)}`
                    : `${row.dir === "in" ? "Received" : "Sent"}${priv_ ? " privately" : ""} · ${relTime(row.ts)}`}
                </p>
              </div>

              <div className="mt-5 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <Row label="Status" value={<span style={{ color: "var(--positive)" }}>Completed</span>} />
                <Row
                  label="Type"
                  value={
                    jr
                      ? row.hash
                        ? "Wallet action · on-chain"
                        : "Wallet action · off-chain"
                      : priv_
                        ? "Private · amount hidden on-chain"
                        : "Public · on-chain"
                  }
                />
                <Row label="Network" value={ACTIVE_EVM_CHAIN.name} />
                {row.symbol && <Row label="Token" value={row.symbol} />}
                {jr && row.counterparty && <Row label="Detail" value={short(row.counterparty)} />}
                {!priv_ && !jr && (
                  <>
                    <Row label={row.dir === "in" ? "From" : "To"} value={short(row.counterparty)} />
                    <Row label="Block" value={row.block?.toString() ?? "—"} />
                  </>
                )}
                <Row
                  label="Time"
                  value={new Date(row.ts).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                />
                {!priv_ && row.hash && <Row label="Tx" value={short(row.hash)} />}
                {priv_ && <Row label="Visibility" value="This device only" />}
                {jr && !row.hash && <Row label="Visibility" value="This device only" />}
              </div>

              {!priv_ && explorer && row.hash ? (
                <a
                  href={`${explorer}/tx/${row.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bv-press bv-btn-primary mt-5 flex h-11 w-full items-center justify-center text-sm"
                >
                  View on explorer ↗
                </a>
              ) : jr ? null : (
                <p className="mt-5 text-center text-xs" style={{ color: "var(--text-faint)" }}>
                  Private transfers are unlinkable on-chain.
                </p>
              )}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

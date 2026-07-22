"use client";

// Private vault (ERC-5564 stealth), styled to match the Solana private page:
// total private $ value + the coins behind it, a stacked iOS-notification feed
// with a running gold border, then Send / Receive glass pills. Stealth has no
// shield/unshield step, so "Check incoming" scans and claims in one.

import { useEffect, useMemo, useState } from "react";
import { formatUnits, type WalletClient } from "viem";
import { getEvmRail } from "@/lib/chain/evm/rail-evm";
import {
  appendPrivateLog,
  readPrivateLog,
  type PrivateLogEntry,
} from "@/lib/chain/evm/private-log";
import type { TokenRef } from "@/lib/chain/types";
import { Card, Button } from "@/ui/primitives";
import { coinIcon } from "@/ui/evm-coins";
import { NotifStack } from "@/ui/notif-stack";
import { EmptyFeed } from "@/ui/empty-feed";
import { ShieldBanner } from "@/ui/shield-banner";
import { PrivateScanCard } from "@/ui/private-scan-card";
import { EvmPaymentRequest } from "@/ui/evm-payment-request";
import { EvmPrivateSend } from "@/ui/evm-private-send";
import { EvmPrivateReceive } from "@/ui/evm-private-receive";
import { useToast } from "@/components/toast";

interface FundedNoteRaw {
  token: TokenRef;
  amount: bigint;
}

const FEED_COPY = {
  claim: { title: "Received", tone: "var(--positive)" },
  send: { title: "Sent", tone: "var(--text)" },
} as const;

function relTime(ms?: number): string {
  if (!ms) return "pending";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function feedCard(f: PrivateLogEntry, priceOf: (s: string) => number) {
  const c = FEED_COPY[f.kind as keyof typeof FEED_COPY] ?? FEED_COPY.send;
  const send = f.kind === "send";
  const value = f.amount * priceOf(f.symbol);
  return (
    <div
      key={f.id}
      className="flex items-center gap-3 px-3 py-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
      }}
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        <span
          className="flex h-10 w-10 items-center justify-center text-sm"
          style={{
            background: "var(--surface-solid)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-pill)",
            color: c.tone,
          }}
        >
          {send ? "↑" : "↓"}
        </span>
        <span className="absolute -bottom-1 -right-1">{coinIcon(f.symbol, 18)}</span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{c.title}</span>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          {relTime("ts" in f ? f.ts : undefined)}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-sm tabular-nums" style={{ color: c.tone }}>
          {send ? "−" : "+"}
          {Number(f.amount.toFixed(6)).toString()} {f.symbol}
        </span>
        <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
          ${value.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// Morph-glass action pill with a gold gradient wash (matches the Solana page).
const CardGlyph = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" strokeLinecap="round" />
  </svg>
);

function GlassAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bv-press flex h-12 flex-1 items-center justify-center gap-2 text-sm font-medium disabled:opacity-40"
      style={{
        color: "var(--text)",
        background:
          "linear-gradient(135deg, rgba(216,180,94,0.28), rgba(216,180,94,0.05) 60%), var(--surface-2)",
        border: "1px solid rgba(216,180,94,0.32)",
        borderRadius: "var(--r-pill)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      <span className="text-base" style={{ color: "var(--brand)" }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

export function EvmPrivate({
  wallet,
  address,
  priceOf,
  publicBalances,
  onPublicBalanceChange,
}: {
  wallet: WalletClient | null;
  address: string | null;
  priceOf: (symbol: string) => number;
  // Stealth sends spend the public wallet, so the Send sheet gates on these.
  publicBalances: { token: { symbol: string }; amount: number }[];
  // Claiming credits — and sending debits — the public wallet, so let the parent
  // refresh its balance after those move funds.
  onPublicBalanceChange?: () => void;
}) {
  const toast = useToast();
  const rail = useMemo(
    () => (wallet && address ? getEvmRail(wallet, address) : null),
    [wallet, address]
  );

  const [enabled, setEnabled] = useState(false);
  const [metaUri, setMetaUri] = useState<string | null>(null);
  const [log, setLog] = useState<PrivateLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [payReqOpen, setPayReqOpen] = useState(false);

  // Rehydrate a previously-enabled identity (persisted) without re-signing.
  useEffect(() => {
    if (!rail?.metaAddressUri || enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(true);
    setMetaUri(rail.metaAddressUri);
    if (address) setLog(readPrivateLog(address));
  }, [rail, enabled, address]);

  async function enable() {
    if (!rail || busy) return;
    setBusy(true);
    try {
      await rail.register();
      setEnabled(true);
      setMetaUri(rail.metaAddressUri);
      if (address) setLog(readPrivateLog(address));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Scan the chain for incoming stealth notes and claim them. A claimed note is
  // swept into the public wallet, so we just log the receipt and let the parent
  // refresh the public balance — there's no separate private balance to track.
  async function runScan(logLine: (line: string) => void): Promise<{ claimed: number; found: number }> {
    if (!rail) return { claimed: 0, found: 0 };
    const scanned = await rail.scanIncoming();
    logLine(`${scanned.length} note${scanned.length === 1 ? "" : "s"} found`);
    if (scanned.length === 0) return { claimed: 0, found: 0 };
    const claiming = scanned.map((n) => n.raw as FundedNoteRaw);
    const { claimed } = await rail.claim(scanned, (s) => logLine(s));
    if (claimed > 0 && address) {
      let next = log;
      for (const n of claiming.slice(0, claimed)) {
        next = appendPrivateLog(address, {
          kind: "claim",
          symbol: n.token.symbol,
          amount: Number(formatUnits(n.amount, n.token.decimals)),
        });
      }
      setLog(next);
      onPublicBalanceChange?.();
    }
    return { claimed, found: scanned.length };
  }

  const feed = log.filter((e) => e.kind === "send" || e.kind === "claim");

  if (!enabled) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Private balance</h2>
        <Card>
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              Stealth transfers hide who you pay and who pays you. Enable once to
              derive your private keys — you&apos;ll sign a message, no funds move.
            </p>
            <Button onClick={enable} disabled={busy || !rail} className="h-11">
              {busy ? "Enabling…" : "Enable private balance"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      {/* interaction hero: scan + claim incoming stealth notes */}
      <PrivateScanCard onRun={runScan} />

      {/* stacked notification feed */}
      <div className="flex flex-col gap-2">
        {feed.length === 0 ? (
          <EmptyFeed />
        ) : (
          <NotifStack items={feed.slice(0, 5).map((f) => feedCard(f, priceOf))} />
        )}
      </div>

      {/* actions */}
      <div className="flex gap-2.5 pt-1">
        <GlassAction icon="↑" label="Send" onClick={() => setSendOpen(true)} disabled={busy} />
        <GlassAction icon={CardGlyph} label="Payment" onClick={() => setPayReqOpen(true)} />
        <GlassAction icon="↓" label="Receive" onClick={() => setReceiveOpen(true)} />
      </div>

      <ShieldBanner />

      <EvmPrivateSend
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        rail={rail}
        assets={rail?.privateAssets ?? []}
        spendBalances={publicBalances}
        priceOf={priceOf}
        onSent={(symbol, amount) => {
          if (address) setLog(appendPrivateLog(address, { kind: "send", symbol, amount }));
          onPublicBalanceChange?.();
        }}
      />

      <EvmPrivateReceive open={receiveOpen} onClose={() => setReceiveOpen(false)} metaUri={metaUri} />

      <EvmPaymentRequest open={payReqOpen} onClose={() => setPayReqOpen(false)} metaUri={metaUri} />
    </div>
  );
}

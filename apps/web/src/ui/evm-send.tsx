"use client";

// Public send, restyled to match the private sheet: gold-lit glass, recipient
// pill, amount card with the in-app keypad, network chips (RH live, others
// Soon). Review + slide-to-confirm consent gate before anything signs.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";
import { parseUnits } from "viem";
import { NumPad } from "@/ui/num-pad";
import { Button } from "@/ui/primitives";
import { ChainSelect } from "@/ui/chain-select";
import { SlideToStart } from "@/ui/slide-to-start";
import { coinIcon, coinName } from "@/ui/evm-coins";
import { findEvmToken } from "@/lib/chain/evm/tokens";
import { tokensFor } from "@/lib/chain/evm/custom-tokens";
import { tokenKey } from "@/lib/chain/evm/card-watchlist";
import type { TokenRef } from "@/lib/chain/types";
import { isEnsName, resolveEnsName } from "@/lib/chain/evm/ens";
import { getEvmAdapter } from "@/lib/chain/evm/adapter";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { CheckMark, ClockWait, Terminal } from "@/ui/transfer-flow";
import { useWallet } from "@/lib/chain/use-wallet";
import { appendJournal } from "@/lib/activity-journal";
import { useToast } from "@/components/toast";
import type { TokenBalance } from "@/lib/chain/types";

const glass = (strong = false): React.CSSProperties => ({
  background: strong ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
  border: `1px solid rgba(255,255,255,${strong ? 0.12 : 0.08})`,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
});

export function EvmSend({
  open,
  onClose,
  adapter,
  balances,
  priceOf,
  onSent,
  initialTo,
  initialAmount,
  initialToken,
  origin,
}: {
  open: boolean;
  onClose: () => void;
  adapter: ReturnType<typeof getEvmAdapter>;
  balances: TokenBalance[];
  priceOf: (symbol: string) => number;
  onSent: () => void;
  initialTo?: string;
  initialAmount?: string;
  initialToken?: string;
  /** Where this send came from — colors the Activity journal entry. */
  origin?: "qr" | "request";
}) {
  const toast = useToast();
  const { address } = useWallet();
  const [to, setTo] = useState(initialTo ?? "");
  // Selection is keyed by address, not symbol: this list can contain two
  // different tokens calling themselves the same thing.
  const tokens = useMemo(() => tokensFor(address), [address]);
  // A pay link carries a symbol for built-ins and an address for user-added
  // tokens — match either, but never fall back to a same-symbol impostor.
  const matchLink = (list: TokenRef[], want: string) =>
    list.find((t) => tokenKey(t).toLowerCase() === want.toLowerCase()) ??
    (want.startsWith("0x") ? undefined : findEvmToken(want));
  const [sel, setSel] = useState(() => {
    const t = initialToken ? matchLink(tokens, initialToken) : undefined;
    return t ? tokenKey(t) : "ETH";
  });
  const token = tokens.find((t) => tokenKey(t) === sel) ?? tokens[0]!;
  const symbol = token.symbol;
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  // Consent gate: nothing signs from the form stage.
  const [review, setReview] = useState<{ dest: string; ensName?: string } | null>(null);
  // After the slide: the sheet stays put and swaps to progress, then success —
  // same language as the private flow, without taking over the screen.
  const [lines, setLines] = useState<string[] | null>(null);
  const [sent, setSent] = useState<{ hash: string; amount: string; symbol: string } | null>(null);

  // Asset menu is portalled out (backdrop-filter creates a stacking context
  // that would trap it under the keypad) — same pattern as the private sheet.
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // A request can name a token this wallet hasn't added. Say so rather than
  // silently swapping in ETH and letting them pay the wrong thing.
  useEffect(() => {
    if (!open || !initialToken) return;
    if (!matchLink(tokens, initialToken)) {
      toast("error", "This request is for a token you haven't added yet");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialToken]);

  useEffect(() => {
    if (!pickOpen) return;
    const close = () => setPickOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pickOpen]);

  function togglePick() {
    if (!pickOpen && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setPickOpen((o) => !o);
  }

  const available = balances.find((b) => tokenKey(b.token) === sel)?.amount ?? 0;
  const usd = (parseFloat(amount) || 0) * priceOf(symbol);

  function onKey(k: string) {
    if (k === "back") setAmount((a) => a.slice(0, -1));
    else if (k === ".") setAmount((a) => (a.includes(".") ? a : (a || "0") + "."));
    else setAmount((a) => (a === "0" ? k : a + k));
  }

  async function toReview() {
    if (busy) return;
    const t = token;
    const raw = to.trim();
    if (!raw) return toast("error", "Enter a destination");
    if (raw.startsWith("st:")) {
      return toast("error", "That's a private address — use Send in your Vault");
    }
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast("error", "Enter an amount");
    if (n > available) return toast("error", `Only ${available} ${symbol} available`);
    // Gas preflight: without ETH the tx can never build and Sending… hangs.
    const ethBal = balances.find((b) => b.token.symbol === "ETH")?.amount ?? 0;
    if (!t.native && ethBal <= 0) {
      return toast("error", "No ETH for the network fee — add a little ETH first");
    }
    if (t.native && n >= ethBal) {
      return toast("error", "Leave a little ETH for the network fee");
    }
    setBusy(true);
    try {
      if (isEnsName(raw)) {
        const resolved = await resolveEnsName(raw);
        if (!resolved) {
          toast("error", `Couldn't resolve ${raw}`);
          return;
        }
        setReview({ dest: resolved, ensName: raw });
      } else {
        setReview({ dest: raw });
      }
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (busy || !review) return;
    const t = token;
    setBusy(true);
    const push = (l: string) => setLines((p) => [...(p ?? []), l]);
    // Rail stages arrive unprefixed — tag them so the terminal colours them.
    const log = (l: string) => push(/^[$>!✓✗#]/.test(l) ? l : `> ${l}`);
    setLines([`$ vault send --amount ${amount} --asset ${symbol}`]);
    log(`target ${review.ensName ?? shorten(review.dest)}`);
    log(`network ${ACTIVE_EVM_CHAIN.name}`);
    try {
      const hash = await adapter.send(t, review.dest, parseUnits(amount, t.decimals), log);
      log("awaiting confirmations");
      push("✓ transfer confirmed on-chain");
      if (address) {
        appendJournal(address, {
          kind: origin === "qr" ? "send-qr" : origin === "request" ? "send-request" : "send",
          title:
            origin === "qr"
              ? `Paid via QR — ${amount} ${symbol}`
              : origin === "request"
                ? `Paid payment request — ${amount} ${symbol}`
                : `Sent ${amount} ${symbol}`,
          symbol,
          amount: parseFloat(amount),
          dir: "out",
          hash,
          detail: review.ensName ?? review.dest,
        });
      }
      setSent({ hash, amount, symbol });
      onSent();
    } catch (e) {
      push(`! ${(e as Error).message}`);
      push("✗ transfer aborted");
      toast("error", (e as Error).message);
      setLines(null);
      setReview(null);
    } finally {
      setBusy(false);
    }
  }

  // Wipe every stage so the next open starts on a clean form.
  function finish() {
    setTo("");
    setAmount("");
    setReview(null);
    setLines(null);
    setSent(null);
    onClose();
  }

  return (
    <Drawer.Root
      open={open}
      // Never let a swipe dismiss the sheet mid-send — the tx is already in
      // flight and the user would lose sight of it.
      dismissible={!busy}
      onOpenChange={(o) => {
        if (o || busy) return;
        if (sent) return finish();
        setReview(null);
        onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background:
              "radial-gradient(120% 70% at 50% 0%, rgba(216,180,94,0.30), rgba(216,180,94,0.06) 45%, transparent 70%), var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div className="flex flex-col items-center p-5 pb-6">
            <div
              className="mb-4 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />
            <h3 className="self-start text-base font-semibold">
              {sent
                ? "Transfer Complete"
                : lines
                  ? "Sending"
                  : review
                    ? "Confirm send"
                    : "Send"}
            </h3>

            {sent ? (
              /* ---------- SUCCESS ---------- */
              <div className="flex w-full flex-col items-center pt-4">
                <CheckMark />
                <p className="mt-4 font-mono text-2xl font-semibold tabular-nums">
                  {sent.amount} <span style={{ color: "var(--text-dim)" }}>{sent.symbol}</span>
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
                  Sent · {ACTIVE_EVM_CHAIN.name}
                </p>
                <a
                  href={adapter.explorerTxUrl(sent.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="bv-press mt-5 h-11 w-full text-center text-sm font-medium leading-[2.75rem]"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-pill)",
                    color: "var(--text)",
                  }}
                >
                  View on explorer ↗
                </a>
                <Button onClick={finish} className="mt-2 h-12 w-full">
                  Done
                </Button>
              </div>
            ) : lines ? (
              /* ---------- PROCESSING ---------- */
              <div className="flex w-full flex-col items-center pt-2">
                <ClockWait />
                <p className="mt-2 text-sm font-semibold">Processing transfer</p>
                <p className="mb-2 text-xs" style={{ color: "var(--text-dim)" }}>
                  Sending {amount} {symbol} · don&apos;t close the app
                </p>
                <Terminal lines={lines} bodyClass="h-40" />
              </div>
            ) : review ? (
              <>
                <div
                  className="mt-3 flex w-full flex-col gap-2.5 p-4 text-sm"
                  style={{ ...glass(), borderRadius: "var(--r-card)" }}
                >
                  <Row label="Amount" value={`${amount} ${symbol}`} strong />
                  <Row label="To" value={review.ensName ?? shorten(review.dest)} />
                  {review.ensName && <Row label="Resolves to" value={shorten(review.dest)} />}
                  <Row label="Network" value="Robinhood Chain" />
                  <Row label="Fee" value="Paid in ETH" />
                </div>
                <p className="mt-3 text-center text-xs" style={{ color: "var(--text-dim)" }}>
                  Public transfer — visible on-chain. Check the address carefully.
                </p>
                <div className="mt-3 w-full">
                  {busy ? (
                    <Button disabled className="h-12 w-full">Sending…</Button>
                  ) : (
                    <SlideToStart key="send-confirm" label="Slide to send" onComplete={send} />
                  )}
                </div>
                <button
                  onClick={() => setReview(null)}
                  disabled={busy}
                  className="bv-press mt-2 h-10 w-full text-sm font-medium"
                  style={{ color: "var(--text-dim)" }}
                >
                  Back
                </button>
              </>
            ) : (
              <>
                {/* network */}
                <div className="mt-3 w-full">
                  <ChainSelect />
                </div>

                {/* recipient */}
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="0x… or your name service"
                  className="mt-2 w-full truncate px-4 py-3.5 font-mono text-xs outline-none"
                  style={{ ...glass(), borderRadius: "var(--r-card)" }}
                />

                {/* amount card — figure, available, asset picker */}
                <div className="mt-3 w-full p-5" style={{ ...glass(), borderRadius: "var(--r-card)" }}>
                  <p className="text-center font-mono text-4xl font-semibold tabular-nums">
                    {amount || "0"}
                    <span className="ml-2 text-xl" style={{ color: "var(--text-dim)" }}>
                      {symbol}
                    </span>
                  </p>
                  <p className="mt-1 text-center text-xs" style={{ color: "var(--text-dim)" }}>
                    ≈ ${usd.toFixed(2)} · Available: {Number(available.toFixed(6)).toString()} {symbol}
                  </p>

                  <button
                    ref={btnRef}
                    onClick={togglePick}
                    className="bv-press mt-4 flex w-full items-center justify-between gap-2 px-3 py-2.5"
                    style={{ ...glass(true), borderRadius: "var(--r-pill)" }}
                  >
                    <span className="flex items-center gap-2.5">
                      {coinIcon(symbol, 28)}
                      <span className="text-sm font-medium">{coinName(symbol)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-dim)" }}>
                      {symbol} <span>▾</span>
                    </span>
                  </button>
                </div>

                <div className="mt-3 w-full">
                  <NumPad onKey={onKey} decimal />
                </div>

                <Button onClick={toReview} disabled={busy} className="mt-1 h-12 w-full">
                  {busy ? "Checking…" : "Review send"}
                </Button>
                <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Public transfer · fee paid in ETH
                </p>
              </>
            )}
          </div>

          {/* asset menu, portalled above the sheet */}
          {pickOpen &&
            rect &&
            createPortal(
              <>
                <div
                  className="fixed inset-0 z-[998]"
                  style={{ pointerEvents: "auto" }}
                  onClick={() => setPickOpen(false)}
                />
                <div
                  className="bv-enter fixed z-[999] p-1"
                  style={{
                    top: rect.bottom + 6,
                    left: rect.left,
                    width: rect.width,
                    pointerEvents: "auto",
                    background: "var(--surface-solid)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--r-card)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                  }}
                >
                  {tokens.map((t) => (
                    <button
                      key={tokenKey(t)}
                      onClick={() => {
                        setSel(tokenKey(t));
                        setAmount("");
                        setPickOpen(false);
                      }}
                      className="bv-press flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2.5"
                    >
                      <span className="flex items-center gap-2.5">
                        {coinIcon(t.symbol, 26)}
                        <span
                          className="text-sm"
                          style={{ color: tokenKey(t) === sel ? "var(--brand)" : "var(--text)" }}
                        >
                          {coinName(t.symbol)}
                        </span>
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                        {t.symbol}
                      </span>
                    </button>
                  ))}
                </div>
              </>,
              document.body
            )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

const shorten = (a: string) => `${a.slice(0, 10)}…${a.slice(-8)}`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--text-dim)" }}>{label}</span>
      <span
        className={strong ? "text-sm font-semibold" : "text-xs font-medium"}
        style={{ overflowWrap: "anywhere", textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

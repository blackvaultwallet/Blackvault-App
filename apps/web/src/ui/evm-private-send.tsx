"use client";

// Send private (reference style): a gold-lit glass sheet — recipient on top,
// then one card holding the amount, what's available, and the asset picker as a
// full-width row; the amount is typed on an in-app keypad. Amounts are in token
// units; the $ equivalent sits under the figure.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";
import { parseUnits } from "viem";
import { NumPad } from "@/ui/num-pad";
import { Button } from "@/ui/primitives";
import { coinIcon, coinName } from "@/ui/evm-coins";
import { TransferFlow, type TransferSummary } from "@/ui/transfer-flow";
import { useToast } from "@/components/toast";
import type { getEvmRail } from "@/lib/chain/evm/rail-evm";
import type { RailAsset } from "@/lib/rail";
import type { TokenRef } from "@/lib/chain/types";

const toRailAsset = (t: TokenRef): RailAsset => ({
  symbol: t.symbol,
  mint: t.address ?? "",
  decimals: t.decimals,
  isNative: t.native ?? false,
});

// Frosted panel used for the recipient field, the amount card and the picker.
const glass = (strong = false): React.CSSProperties => ({
  background: strong ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
  border: `1px solid rgba(255,255,255,${strong ? 0.12 : 0.08})`,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
});

export function EvmPrivateSend({
  open,
  onClose,
  rail,
  assets,
  spendBalances,
  priceOf,
  initialTo,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  rail: ReturnType<typeof getEvmRail> | null;
  assets: TokenRef[];
  // A stealth send spends the PUBLIC wallet (funds land at a stealth address
  // only the recipient can sweep), so "available" is the public balance.
  spendBalances: { token: { symbol: string }; amount: number }[];
  priceOf: (symbol: string) => number;
  initialTo?: string;
  /** Reports what was sent so the caller can log it in the private feed. */
  onSent: (symbol: string, amount: number) => void;
}) {
  const toast = useToast();
  const [to, setTo] = useState(initialTo ?? "");
  const [symbol, setSymbol] = useState("USDG");
  const [amount, setAmount] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [flow, setFlow] = useState<{
    summary: TransferSummary;
    dest: string;
    asset: RailAsset;
    units: bigint;
    amt: number;
  } | null>(null);
  // The amount card uses backdrop-filter, which creates a stacking context — a
  // dropdown inside it would sit under the keypad. Portal it out and place it
  // from the button's rect instead.
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

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

  const token = assets.find((t) => t.symbol === symbol) ?? assets[0];
  const available = spendBalances.find((b) => b.token.symbol === symbol)?.amount ?? 0;
  const usd = (parseFloat(amount) || 0) * priceOf(symbol);

  function onKey(k: string) {
    if (k === "back") setAmount((a) => a.slice(0, -1));
    else if (k === ".") setAmount((a) => (a.includes(".") ? a : (a || "0") + "."));
    else setAmount((a) => (a === "0" ? k : a + k));
  }

  // Validate, then hand off to the full-screen confirm flow (the send runs
  // inside TransferFlow's onConfirm).
  function review() {
    if (!rail || !token) return;
    const dest = to.trim();
    if (!dest.startsWith("st:")) {
      return toast("error", "Private send needs an st:eth:… address — ENS names aren't supported");
    }
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast("error", "Enter an amount");
    if (n > available) return toast("error", `Only ${available} ${symbol} available`);
    // Gas preflight: stealth sends need ETH for fees (announce + transfer).
    const ethBal = spendBalances.find((b) => b.token.symbol === "ETH")?.amount ?? 0;
    if (ethBal <= 0) {
      return toast("error", "No ETH for network fees — add a little ETH first");
    }
    if (token?.native && n >= ethBal) {
      return toast("error", "Leave a little ETH for the network fee");
    }
    const short = dest.length > 16 ? `${dest.slice(0, 8)}…${dest.slice(-6)}` : dest;
    setFlow({
      summary: {
        mode: "private",
        symbol,
        icon: coinIcon(symbol, 56),
        amount,
        usd,
        fromLabel: "Your Vault",
        toLabel: short,
        network: "Robinhood Chain",
        fee: "~gas in ETH",
      },
      dest,
      asset: toRailAsset(token),
      units: parseUnits(amount, token.decimals),
      amt: n,
    });
  }

  return (
    <>
    <Drawer.Root open={open && !flow} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            // gold light pooling at the top, fading into the sheet
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
            <h3 className="self-start text-base font-semibold">Send private</h3>

            {/* recipient */}
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="st:eth:… recipient"
              className="mt-3 w-full truncate px-4 py-3.5 font-mono text-xs outline-none"
              style={{ ...glass(), borderRadius: "var(--r-card)" }}
            />

            {/* amount card — figure, available, and the asset picker inside it */}
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

              {/* asset picker — full width, same column as the recipient */}
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
                <span
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: "var(--text-dim)" }}
                >
                  {symbol} <span>▾</span>
                </span>
              </button>
            </div>

            <div className="mt-3 w-full">
              <NumPad onKey={onKey} decimal />
            </div>

            <Button onClick={review} className="mt-1 h-12 w-full">
              Send
            </Button>
            <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
              Spent from your public balance · recipient stays hidden · fees in ETH
            </p>
          </div>

          {/* asset menu, portalled above the sheet so the keypad can't cover it */}
          {pickOpen &&
            rect &&
            createPortal(
              <>
                {/* vaul sets pointer-events:none on body while the sheet is
                    modal, so the portalled menu must re-enable it or clicks
                    fall through to the keypad underneath. */}
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
                  {assets.map((t) => (
                    <button
                      key={t.symbol}
                      onClick={() => {
                        setSymbol(t.symbol);
                        setAmount("");
                        setPickOpen(false);
                      }}
                      className="bv-press flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2.5"
                    >
                      <span className="flex items-center gap-2.5">
                        {coinIcon(t.symbol, 26)}
                        <span
                          className="text-sm"
                          style={{ color: t.symbol === symbol ? "var(--brand)" : "var(--text)" }}
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

    {flow && (
      <TransferFlow
        open
        summary={flow.summary}
        onConfirm={async (logLine) => {
          if (!rail) throw new Error("No wallet");
          await rail.sendPrivate(flow.dest, flow.asset, flow.units, logLine);
          onSent(symbol, flow.amt);
          return {};
        }}
        onClose={() => setFlow(null)}
        onDone={() => {
          setFlow(null);
          setTo("");
          setAmount("");
          onClose();
        }}
      />
    )}
    </>
  );
}

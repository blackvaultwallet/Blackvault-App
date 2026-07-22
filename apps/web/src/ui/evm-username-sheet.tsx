"use client";

// Subname purchase sheet (reference: the send flow). Slides up from the
// bottom: check availability → purchase details (what you get, which wallet
// it connects to, price) → slide to pay → live progress → self-drawing
// checkmark on success. Free mode (no price configured) skips payment.

import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { parseUnits } from "viem";
import { useWallet } from "@/lib/chain/use-wallet";
import { useEvmWallet } from "@/lib/chain/evm/wallet";
import { getEvmChainAdapter } from "@/lib/chain";
import { findEvmToken } from "@/lib/chain/evm/tokens";
import {
  claimTerms,
  claimUsername,
  usernameTaken,
  type ClaimTerms,
} from "@/lib/chain/evm/username";
import { appendJournal } from "@/lib/activity-journal";
import { SlideToStart } from "@/ui/slide-to-start";
import { Button } from "@/ui/primitives";

const LABEL_RE = /^[a-z0-9-]{3,20}$/;

const glass = (strong = false): React.CSSProperties => ({
  background: strong ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
  border: `1px solid rgba(255,255,255,${strong ? 0.12 : 0.08})`,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
});

function CheckMark() {
  return (
    <div
      className="flex h-24 w-24 items-center justify-center rounded-full"
      style={{ background: "rgba(121,217,156,0.14)", animation: "tf-pop 420ms var(--ease-out) both" }}
    >
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden>
        <circle cx="44" cy="44" r="30" fill="var(--positive)" />
        <path
          d="M31 45 L40 54 L57 35"
          pathLength={1}
          className="bv-draw"
          stroke="#0b1a0f"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{ animationDelay: "160ms" }}
        />
      </svg>
    </div>
  );
}

function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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

type Stage = "pick" | "review" | "paying" | "success" | "error";

export function EvmUsernameSheet({
  open,
  onClose,
  onClaimed,
  isChange,
}: {
  open: boolean;
  onClose: () => void;
  /** Full claimed name, e.g. alice.blackvaultwallet.eth */
  onClaimed: (full: string) => void;
  /** True when the user already holds a name (this purchase replaces it). */
  isChange?: boolean;
}) {
  const { address } = useWallet();
  const { walletClient } = useEvmWallet();
  const [terms, setTerms] = useState<ClaimTerms | null>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [name, setName] = useState("");
  const [avail, setAvail] = useState<"unknown" | "checking" | "free" | "taken" | "invalid">("unknown");
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [claimed, setClaimed] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    claimTerms()
      .then((t) => active && setTerms(t))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open]);

  const price = terms?.priceUsdg ?? 0;
  const paid = price > 0;
  const parent = terms?.parent || "blackvaultwallet.eth";
  const shortAddr = address ? `${address.slice(0, 10)}…${address.slice(-8)}` : "—";

  function reset() {
    setStage("pick");
    setName("");
    setAvail("unknown");
    setSteps([]);
    setError("");
  }

  function close() {
    reset();
    onClose();
  }

  async function check() {
    const n = name.trim().toLowerCase();
    if (!LABEL_RE.test(n)) {
      setAvail("invalid");
      return;
    }
    setAvail("checking");
    const taken = await usernameTaken(n, parent);
    setAvail(taken ? "taken" : "free");
  }

  async function buy() {
    if (!address) return;
    const n = name.trim().toLowerCase();
    setStage("paying");
    const log = (s: string) => setSteps((p) => [...p, s]);
    try {
      let txHash: string | undefined;
      if (paid) {
        if (!terms?.revenueAddr) throw new Error("Claim service not configured");
        const usdg = findEvmToken("USDG");
        if (!usdg?.address || !walletClient) throw new Error("Wallet not ready");
        const adapter = getEvmChainAdapter(walletClient);
        // Gas preflight — a USDG payment still needs ETH for the fee.
        const bals = await adapter.getBalances(address);
        if ((bals.find((b) => b.token.symbol === "ETH")?.amount ?? 0) <= 0) {
          throw new Error("No ETH for the network fee — add a little ETH first");
        }
        log(`Paying ${price} USDG…`);
        txHash = await adapter.send(usdg, terms.revenueAddr, parseUnits(String(price), 6));
        log("Payment sent — verifying on-chain…");
      }
      log(`Registering ${n}.${parent}…`);
      const full = await claimUsername(n, address, txHash);
      appendJournal(address, {
        kind: isChange ? "name-change" : "name",
        title: isChange ? `Changed name to ${full}` : `Bought ${full}`,
        symbol: paid ? "USDG" : undefined,
        amount: paid ? price : undefined,
        dir: paid ? "out" : "none",
        hash: txHash,
        detail: full,
      });
      setClaimed(full);
      setStage("success");
      onClaimed(full);
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && stage !== "paying" && close()}>
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
          <div className="flex flex-col items-center p-5 pb-7">
            <div
              className="mb-4 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />

            {stage === "pick" && (
              <>
                <h3 className="self-start text-base font-semibold">Get your name</h3>
                <p className="mt-1 self-start text-xs leading-5" style={{ color: "var(--text-dim)" }}>
                  A name people can pay instead of a 0x address — resolvable anywhere ENS works.
                  {paid ? ` One-time ${price} USDG.` : " Free."}
                </p>

                <div className="mt-4 flex w-full items-center" style={{ ...glass(), borderRadius: "var(--r-card)" }}>
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setAvail("unknown");
                    }}
                    placeholder="yourname"
                    className="min-w-0 flex-1 bg-transparent px-4 py-3.5 font-mono text-sm outline-none"
                  />
                  <span className="whitespace-nowrap pr-4 font-mono text-xs" style={{ color: "var(--text-faint)" }}>
                    .{parent}
                  </span>
                </div>

                {avail !== "unknown" && avail !== "checking" && (
                  <p
                    className="mt-2 self-start text-xs font-medium"
                    style={{ color: avail === "free" ? "var(--positive)" : "var(--negative)" }}
                  >
                    {avail === "free" && `✓ ${name.trim().toLowerCase()}.${parent} is available`}
                    {avail === "taken" && "✗ Already taken — try another"}
                    {avail === "invalid" && "✗ 3–20 lowercase letters, numbers, or dashes"}
                  </p>
                )}

                {avail === "free" ? (
                  <Button onClick={() => setStage("review")} className="mt-4 h-12 w-full">
                    Continue
                  </Button>
                ) : (
                  <Button onClick={check} disabled={avail === "checking" || !name.trim()} className="mt-4 h-12 w-full">
                    {avail === "checking" ? "Checking…" : "Check availability"}
                  </Button>
                )}
              </>
            )}

            {stage === "review" && (
              <>
                <h3 className="self-start text-base font-semibold">Confirm purchase</h3>
                <div className="mt-3 flex w-full flex-col gap-2.5 p-4" style={{ ...glass(), borderRadius: "var(--r-card)" }}>
                  <DetailRow label="Subname" value={`${name.trim().toLowerCase()}.${parent}`} strong />
                  <DetailRow label="Connects to" value={shortAddr} />
                  <DetailRow label="Price" value={paid ? `${price} USDG · one-time` : "Free"} />
                  <DetailRow label="Network" value="Robinhood Chain" />
                  {paid && <DetailRow label="Pay with" value="USDG from your public balance" />}
                </div>
                <p className="mt-3 self-start text-xs leading-5" style={{ color: "var(--text-dim)" }}>
                  Payments sent to this name arrive at your wallet above. You can change your
                  name anytime{paid ? ` — each change costs ${price} USDG` : ""} and the old name is
                  released.
                </p>
                <div className="mt-4 w-full">
                  <SlideToStart
                    key="buy-name"
                    label={paid ? `Slide to pay ${price} USDG` : "Slide to claim"}
                    onComplete={buy}
                  />
                </div>
                <button
                  onClick={() => setStage("pick")}
                  className="bv-press mt-2 h-10 w-full text-sm font-medium"
                  style={{ color: "var(--text-dim)" }}
                >
                  Back
                </button>
              </>
            )}

            {stage === "paying" && (
              <>
                <h3 className="text-base font-semibold">Processing</h3>
                <div className="mt-4 flex w-full flex-col gap-2 p-4 font-mono text-xs" style={{ ...glass(), borderRadius: "var(--r-card)" }}>
                  {steps.map((s, i) => (
                    <p key={i} style={{ color: i === steps.length - 1 ? "var(--brand)" : "var(--positive)" }}>
                      {i === steps.length - 1 ? "› " : "✓ "}
                      {s}
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Keep this open — confirming on-chain…
                </p>
              </>
            )}

            {stage === "success" && (
              <>
                <div className="mt-2"><CheckMark /></div>
                <h3 className="mt-4 text-lg font-semibold">Name secured</h3>
                <p className="mt-1 font-mono text-sm" style={{ color: "var(--brand)" }}>
                  {claimed}
                </p>
                <p className="mt-2 text-center text-xs leading-5" style={{ color: "var(--text-dim)" }}>
                  Connected to {shortAddr}. Share it — payments to this name land in your wallet.
                </p>
                <Button onClick={close} className="mt-5 h-12 w-full">
                  Done
                </Button>
              </>
            )}

            {stage === "error" && (
              <>
                <h3 className="text-base font-semibold" style={{ color: "var(--negative)" }}>
                  Purchase failed
                </h3>
                <p className="mt-2 text-center text-xs leading-5" style={{ color: "var(--text-dim)" }}>
                  {error}
                </p>
                <Button onClick={() => setStage("review")} className="mt-4 h-12 w-full">
                  Try again
                </Button>
                <button
                  onClick={close}
                  className="bv-press mt-2 h-10 w-full text-sm font-medium"
                  style={{ color: "var(--text-dim)" }}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

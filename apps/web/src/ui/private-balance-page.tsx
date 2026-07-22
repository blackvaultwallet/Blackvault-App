"use client";

// Private Balance page (reference style): "Transfer Private" and "Swap Balance"
// modes. Transfer = send privately + check incoming + request payment.
// Swap = move between Public and Private balance (shield / unshield), with a
// From/To card pair and a switch in the middle.

import { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";
import { QRCodeSVG } from "qrcode.react";
import { Drawer } from "vaul";
import { createConnection, getPortfolio } from "@blackvault/sdk";
import { useVaultWallet } from "@/lib/wallet";
import { getPrivateRail } from "@/lib/umbra-rail";
import { UMBRA_RPC } from "@/lib/umbra";
import { useMarket } from "@/lib/market";
import { isSolName, resolveSolName } from "@/lib/sns";
import { recordActivity } from "@/lib/activity";
import { parseAmount, railAsset, solAsset } from "@/lib/tokens";
import { buildPayLink } from "@/lib/pay-request";
import { Card, Segmented } from "@/ui/primitives";
import { AssetSelect, type RailSymbol } from "@/ui/asset-select";
import { useToast } from "@/components/toast";
import type { RailNote } from "@/lib/rail";

const TOKEN_DECIMALS: Record<RailSymbol, number> = { SOL: 9, USDT: 6, USDC: 6 };

function railFor(sym: RailSymbol) {
  return sym === "SOL" ? solAsset() : railAsset(sym);
}

export function PrivateBalancePage({
  refreshKey,
  vaultActive,
  onActivated,
  onChanged,
  onPrivBalance,
}: {
  refreshKey?: number;
  vaultActive: boolean;
  onActivated: () => void;
  onChanged: () => void;
  onPrivBalance?: (sol: number | null) => void;
}) {
  const vw = useVaultWallet();
  const toast = useToast();
  const quotes = useMarket();

  const [mode, setMode] = useState("transfer");
  const [activating, setActivating] = useState(false);
  const [actStatus, setActStatus] = useState<string | null>(null);
  const [asset, setAsset] = useState<RailSymbol>("SOL");
  const [amount, setAmount] = useState("");

  const [publicBal, setPublicBal] = useState<Record<RailSymbol, number>>({
    SOL: 0,
    USDT: 0,
    USDC: 0,
  });
  const [privateBal, setPrivateBal] = useState<Record<RailSymbol, number | null>>({
    SOL: null,
    USDT: null,
    USDC: null,
  });

  const price = (s: RailSymbol) =>
    s === "SOL" ? quotes?.SOL?.price ?? 152.34 : 1;
  const usd = (parseFloat(amount) || 0) * price(asset);

  // load balances
  useEffect(() => {
    if (!vw.isConnected || !vw.address) return;
    let active = true;
    getPortfolio(createConnection(), [vw.address])
      .then((p) => {
        if (!active) return;
        const t = (sym: string) =>
          p.tokens.find((x) => x.mint === railFor(sym as RailSymbol)?.mint)?.amount ?? 0;
        setPublicBal({ SOL: p.totalSol, USDT: t("USDT"), USDC: t("USDC") });
      })
      .catch(() => {});
    (async () => {
      const rail = getPrivateRail(vw);
      const next: Record<RailSymbol, number | null> = { SOL: null, USDT: null, USDC: null };
      for (const s of ["SOL", "USDT", "USDC"] as RailSymbol[]) {
        const a = railFor(s);
        if (!a) continue;
        try {
          const b = await rail.getPrivateBalance(a);
          next[s] = b.status === "ready" ? b.amount : 0;
        } catch {
          next[s] = null;
        }
      }
      if (active) {
        setPrivateBal(next);
        onPrivBalance?.(next.SOL);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vw.isConnected, vw.address, refreshKey]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Private Balance</h1>

      {!vaultActive ? (
        <Card>
          <p className="text-sm font-medium">Activate Private Vault</p>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-dim)" }}>
            Register your wallet with the Umbra privacy protocol to shield and
            send privately. Costs a small devnet SOL fee.
          </p>
          {actStatus && (
            <p className="mt-2 break-words text-xs" style={{ color: "var(--text)" }}>
              {actStatus}
            </p>
          )}
          <button
            onClick={async () => {
              if (activating) return;
              setActivating(true);
              try {
                await getPrivateRail(vw).register(setActStatus);
                if (vw.address) localStorage.setItem(`bv_umbra_registered_${vw.address}`, "1");
                onActivated();
              } catch (e: any) {
                if (String(e?.message).toLowerCase().includes("already")) onActivated();
                else setActStatus("Failed: " + (e?.message ?? "error"));
              } finally {
                setActivating(false);
              }
            }}
            disabled={activating}
            className="bv-press bv-btn-primary mt-3 h-11 w-full text-sm disabled:opacity-50"
          >
            {activating ? "Working…" : "Activate"}
          </button>
        </Card>
      ) : (
        <>
      <div className="flex justify-center">
        <Segmented
          options={[
            { id: "transfer", label: "Transfer Private" },
            { id: "swap", label: "Swap Balance" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {mode === "transfer" ? (
        <TransferPrivate
          vw={vw}
          toast={toast}
          asset={asset}
          setAsset={setAsset}
          amount={amount}
          setAmount={setAmount}
          usd={usd}
          privateBal={privateBal[asset]}
          onChanged={onChanged}
        />
      ) : (
        <SwapBalance
          vw={vw}
          toast={toast}
          asset={asset}
          setAsset={setAsset}
          amount={amount}
          setAmount={setAmount}
          usd={usd}
          publicBal={publicBal[asset]}
          privateBal={privateBal[asset]}
          onChanged={onChanged}
        />
      )}
        </>
      )}
    </div>
  );
}

/* ---------- Transfer Private ---------- */

function TransferPrivate({
  vw,
  toast,
  asset,
  setAsset,
  amount,
  setAmount,
  usd,
  privateBal,
  onChanged,
}: any) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<RailNote[] | null>(null);
  const [reqOpen, setReqOpen] = useState(false);

  async function send() {
    if (!vw.address || busy) return;
    setStatus(null);
    const a = railFor(asset);
    if (!a) return;
    const units = parseAmount(amount, TOKEN_DECIMALS[asset as RailSymbol]);
    if (units === null || (privateBal !== null && parseFloat(amount) > privateBal)) {
      setStatus("Invalid amount.");
      return;
    }
    let dest: string;
    try {
      const raw = to.trim();
      dest = isSolName(raw)
        ? await resolveSolName(new Connection(UMBRA_RPC), raw)
        : raw;
    } catch {
      setStatus("Invalid recipient address or name.");
      return;
    }
    setBusy(true);
    try {
      await getPrivateRail(vw).sendPrivate(dest, a, units, setStatus);
      recordActivity(vw.address, {
        ts: Date.now(),
        type: "private-send",
        amountSol: parseFloat(amount),
      });
      toast("success", `Sent ${amount} ${asset} privately`);
      setAmount("");
      setTo("");
      setStatus(null);
      onChanged();
    } catch (e: any) {
      toast("error", e?.message ?? "Send failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkIncoming() {
    if (busy) return;
    setBusy(true);
    setStatus("Scanning for incoming private transfers…");
    try {
      const rail = getPrivateRail(vw);
      let found: RailNote[] = [];
      for (let i = 0; i < 6; i++) {
        found = await rail.scanIncoming();
        if (found.length) break;
        await new Promise((r) => setTimeout(r, 5000));
      }
      setIncoming(found);
      setStatus(found.length ? null : "No incoming transfers yet.");
    } catch (e: any) {
      setStatus("Failed: " + (e?.message ?? "scan error"));
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (!incoming?.length || busy) return;
    setBusy(true);
    setStatus("Claiming…");
    try {
      const { claimed, failed } = await getPrivateRail(vw).claim(incoming, setStatus);
      if (claimed > 0) recordActivity(vw.address, { ts: Date.now(), type: "private-receive" });
      toast(
        claimed > 0 ? "success" : "error",
        claimed > 0
          ? `${claimed} transfer(s) claimed${failed ? `, ${failed} already burnt` : ""}`
          : "Nothing to claim (already burnt)"
      );
      setIncoming(null);
      setStatus(null);
      onChanged();
    } catch (e: any) {
      toast("error", e?.message ?? "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  const link =
    typeof window !== "undefined" && vw.address
      ? buildPayLink(window.location.origin, {
          to: vw.address,
          amount: parseFloat(amount) || undefined,
        })
      : "";

  return (
    <>
      {/* amount card */}
      <Card>
        <div className="flex items-center justify-between">
          <span className="bv-label">Amount</span>
          <button
            onClick={() => privateBal != null && setAmount(String(privateBal))}
            className="text-xs"
            style={{ color: "var(--brand)" }}
          >
            MAX
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full bg-transparent font-mono text-3xl font-semibold outline-none"
          />
          <AssetSelect value={asset} onChange={setAsset} />
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
          ≈ ${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          {privateBal != null && ` · balance ${privateBal} ${asset}`}
        </p>
      </Card>

      {/* recipient + send */}
      <Card>
        <span className="bv-label">Send to</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Address or name.blackvault.sol"
          className="bv-input mt-2 w-full px-3 py-2.5 text-sm"
        />
        <button
          onClick={send}
          disabled={busy}
          className="bv-press bv-btn-primary mt-3 h-12 w-full text-sm disabled:opacity-50"
        >
          {busy ? "Working…" : "Send Privately"}
        </button>
        {status && (
          <p className="mt-3 break-words text-sm" style={{ color: "var(--text)" }}>
            {status}
          </p>
        )}
      </Card>

      {/* secondary actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={checkIncoming}
          disabled={busy}
          className="bv-press bv-btn-ghost h-12 text-sm disabled:opacity-50"
        >
          Check incoming
        </button>
        <button
          onClick={() => setReqOpen(true)}
          className="bv-press bv-btn-ghost h-12 text-sm"
        >
          Request payment
        </button>
      </div>

      {incoming && incoming.length > 0 && (
        <Card>
          <p className="text-sm">{incoming.length} incoming transfer(s) found.</p>
          <button
            onClick={claim}
            disabled={busy}
            className="bv-press bv-btn-primary mt-3 h-11 w-full text-sm disabled:opacity-50"
          >
            Claim
          </button>
        </Card>
      )}

      {/* request payment sheet */}
      <Drawer.Root open={reqOpen} onOpenChange={setReqOpen}>
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
            <div className="flex flex-col items-center p-6 pb-8 text-center">
              <div
                className="mb-5 h-1 w-10"
                style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
              />
              <p className="bv-label">Request payment</p>
              {link && (
                <div className="mt-4 rounded-lg bg-white p-3">
                  <QRCodeSVG value={link} size={160} />
                </div>
              )}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    toast("success", "Payment link copied");
                  } catch {}
                }}
                className="bv-press bv-btn-primary mt-5 h-11 w-full text-sm"
              >
                Copy link
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

/* ---------- Swap Balance (shield / unshield) ---------- */

function SwapBalance({
  vw,
  toast,
  asset,
  setAsset,
  amount,
  setAmount,
  usd,
  publicBal,
  privateBal,
  onChanged,
}: any) {
  // direction: true = Public → Private (shield), false = Private → Public
  const [toPrivate, setToPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const fromBal = toPrivate ? publicBal : privateBal;
  const toBal = toPrivate ? privateBal : publicBal;

  async function swap() {
    if (!vw.address || busy) return;
    setStatus(null);
    const a = railFor(asset);
    if (!a) return;
    const units = parseAmount(amount, TOKEN_DECIMALS[asset as RailSymbol]);
    if (units === null || (fromBal != null && parseFloat(amount) > fromBal)) {
      setStatus("Invalid amount.");
      return;
    }
    setBusy(true);
    try {
      const rail = getPrivateRail(vw);
      if (toPrivate) {
        await rail.deposit(a, units, setStatus);
        recordActivity(vw.address, { ts: Date.now(), type: "deposit", amountSol: parseFloat(amount) });
      } else {
        await rail.withdraw(a, units, setStatus);
        recordActivity(vw.address, { ts: Date.now(), type: "withdraw", amountSol: parseFloat(amount) });
      }
      toast("success", `Swapped ${amount} ${asset} to ${toPrivate ? "Private" : "Public"}`);
      setAmount("");
      setStatus(null);
      onChanged();
    } catch (e: any) {
      toast("error", e?.message ?? "Swap failed");
    } finally {
      setBusy(false);
    }
  }

  const sideCard = (label: string, side: "Public" | "Private", bal: number | null, editable: boolean) => (
    <Card>
      <div className="flex items-center justify-between">
        <span className="bv-label">{label}</span>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{
            background: side === "Private" ? "var(--brand-soft)" : "var(--surface-2)",
            color: side === "Private" ? "var(--brand)" : "var(--text-dim)",
          }}
        >
          {side} balance
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        {editable ? (
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full bg-transparent font-mono text-3xl font-semibold outline-none"
          />
        ) : (
          <span className="font-mono text-3xl font-semibold" style={{ color: "var(--text-dim)" }}>
            {amount || "0.00"}
          </span>
        )}
        <AssetSelect value={asset} onChange={setAsset} />
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
        ≈ ${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        {bal != null && ` · balance ${bal} ${asset}`}
      </p>
    </Card>
  );

  return (
    <>
      <div className="relative flex flex-col gap-2">
        {sideCard("From", toPrivate ? "Public" : "Private", fromBal, true)}

        {/* switch */}
        <button
          onClick={() => setToPrivate((v) => !v)}
          aria-label="Switch direction"
          className="bv-press absolute left-1/2 top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{
            background: "var(--brand-gradient)",
            color: "var(--cta-text)",
            borderRadius: "var(--r-pill)",
            border: "3px solid var(--bg)",
          }}
        >
          ⇅
        </button>

        {sideCard("To", toPrivate ? "Private" : "Public", toBal, false)}
      </div>

      {/* info */}
      <Card>
        <InfoRow k="Direction" v={`${toPrivate ? "Public → Private" : "Private → Public"}`} />
        <InfoRow k="Rate" v={`1 ${asset} = 1 ${asset}`} />
        <InfoRow k="Network fee" v="paid in SOL" />
        <InfoRow k="Estimated time" v="~ a few minutes" />
      </Card>

      <button
        onClick={swap}
        disabled={busy}
        className="bv-press bv-btn-primary h-12 w-full text-sm disabled:opacity-50"
      >
        {busy ? "Working…" : toPrivate ? "Shield to Private" : "Unshield to Public"}
      </button>
      {status && (
        <p className="break-words text-sm" style={{ color: "var(--text)" }}>
          {status}
        </p>
      )}
    </>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span style={{ color: "var(--text-dim)" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createSolanaRpc, address } from "@solana/kit";
import { guardDeposit } from "@blackvault/sdk";
import { UMBRA_RPC, LAMPORTS_PER_SOL, validateDepositSol } from "@/lib/umbra";
import { getPrivateRail } from "@/lib/umbra-rail";
import { useVaultWallet } from "@/lib/wallet";
import { recordActivity } from "@/lib/activity";
import { parseAmount, privateTokens, railAsset, solAsset } from "@/lib/tokens";

const PRESETS = [0.1, 0.5, 1];

export function UmbraDeposit({
  onDeposited,
  ready,
}: {
  onDeposited?: () => void;
  ready?: boolean;
}) {
  const rpc = useMemo(() => createSolanaRpc(UMBRA_RPC), []);
  const vw = useVaultWallet();

  const [amount, setAmount] = useState("0.1");
  const [token, setToken] = useState("SOL");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  const addr = vw.address;

  useEffect(() => {
    if (addr && localStorage.getItem(`bv_umbra_registered_${addr}`)) {
      setRegistered(true);
    }
  }, [addr]);

  // Guardian heuristics are SOL-shaped; round stable amounts are normal.
  const guardWarnings = useMemo(
    () =>
      token === "SOL"
        ? guardDeposit({ amountSol: parseFloat(amount) }).warnings
        : [],
    [amount, token]
  );

  async function deposit() {
    if (!vw.isConnected || !vw.address || busy) return;
    setStatus(null);

    const asset = token === "SOL" ? solAsset() : railAsset(token);
    if (!asset) {
      setStatus("Token unavailable.");
      return;
    }

    let units: bigint;
    if (asset.isNative) {
      let balanceSol = 0;
      try {
        const { value } = await rpc.getBalance(address(vw.address)).send();
        balanceSol = Number(value) / LAMPORTS_PER_SOL;
      } catch {
        setStatus("Could not read balance. Try again.");
        return;
      }
      const v = validateDepositSol(parseFloat(amount), balanceSol);
      if (!v.ok) {
        setStatus(v.reason);
        return;
      }
      units = v.lamports;
    } else {
      const parsed = parseAmount(amount, asset.decimals);
      if (parsed === null) {
        setStatus("Invalid amount.");
        return;
      }
      units = parsed;
    }

    setBusy(true);
    try {
      await getPrivateRail(vw).deposit(asset, units, setStatus);

      if (asset.isNative) {
        try {
          localStorage.setItem(
            `bv_last_deposit_${vw.address}`,
            JSON.stringify({ sol: parseFloat(amount), ts: Date.now() })
          );
        } catch {
          // storage unavailable
        }
      }

      recordActivity(vw.address, {
        ts: Date.now(),
        type: "deposit",
        amountSol: parseFloat(amount),
      });
      setStatus(`✓ ${amount} ${token} moved to Private Balance (devnet).`);
      onDeposited?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("Failed: " + msg);
    } finally {
      setBusy(false);
    }
  }

  if (!vw.isConnected || !(registered || ready)) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Deposit to Private Balance · devnet
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(String(p))}
            disabled={busy}
            className={
              amount === String(p)
                ? "rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm text-accent"
                : "rounded-lg border border-white/10 px-4 py-2 text-sm text-muted hover:border-accent/40"
            }
          >
            {p} SOL
          </button>
        ))}
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="custom"
          disabled={busy}
          className="w-24 bv-input px-3 py-2 text-sm"
        />
        <select
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy}
          className="bv-input px-2 py-2 text-sm"
        >
          <option value="SOL">SOL</option>
          {privateTokens().map((t) => (
            <option key={t.symbol} value={t.symbol}>
              {t.symbol}
            </option>
          ))}
        </select>
      </div>
      {guardWarnings.map((w) => (
        <p key={w} className="mt-2 text-xs leading-5 text-yellow-500/90">
          ⚠ {w}
        </p>
      ))}
      <button
        onClick={deposit}
        disabled={busy}
        className="mt-3 h-10 bv-press bv-btn-primary px-5 text-sm disabled:opacity-50"
      >
        {busy ? "Working…" : "Deposit to Private Balance"}
      </button>
      {status && (
        <p className="mt-3 break-words text-sm leading-6 text-foreground/90">
          {status}
        </p>
      )}
    </div>
  );
}

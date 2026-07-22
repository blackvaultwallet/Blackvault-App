"use client";

import { useEffect, useMemo, useState } from "react";
import { guardWithdraw } from "@blackvault/sdk";
import { validateWithdrawSol } from "@/lib/umbra";
import { getPrivateRail } from "@/lib/umbra-rail";
import { useVaultWallet } from "@/lib/wallet";
import { recordActivity } from "@/lib/activity";
import { parseAmount, privateTokens, railAsset, solAsset } from "@/lib/tokens";

function readLastDeposit(addr: string | undefined) {
  if (!addr) return null;
  try {
    const raw = localStorage.getItem(`bv_last_deposit_${addr}`);
    if (!raw) return null;
    return JSON.parse(raw) as { sol: number; ts: number };
  } catch {
    return null;
  }
}

export function UmbraWithdraw({
  ready,
  refreshKey,
  onWithdrawn,
}: {
  ready?: boolean;
  refreshKey?: number;
  onWithdrawn?: () => void;
}) {
  const vw = useVaultWallet();
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("SOL");
  const [privBal, setPrivBal] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  const addr = vw.address;

  useEffect(() => {
    if (addr && localStorage.getItem(`bv_umbra_registered_${addr}`)) {
      setRegistered(true);
    }
  }, [addr]);

  useEffect(() => {
    if (!vw.isConnected || !vw.address || !(registered || ready)) return;
    let active = true;
    (async () => {
      try {
        const asset = token === "SOL" ? solAsset() : railAsset(token);
        if (!asset) return;
        const bal = await getPrivateRail(vw).getPrivateBalance(asset);
        if (active) setPrivBal(bal.status === "ready" ? bal.amount : null);
      } catch {
        // validation still runs on submit
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vw.isConnected, vw.address, registered, ready, refreshKey, token]);

  const guardWarnings = useMemo(() => {
    if (token !== "SOL") return [];
    const last = readLastDeposit(addr);
    return guardWithdraw({
      amountSol: parseFloat(amount),
      lastDepositSol: last?.sol,
      minutesSinceDeposit: last ? (Date.now() - last.ts) / 60_000 : undefined,
    }).warnings;
  }, [amount, addr, token]);

  async function withdraw() {
    if (!vw.isConnected || !vw.address || busy) return;
    setStatus(null);

    const asset = token === "SOL" ? solAsset() : railAsset(token);
    if (!asset) {
      setStatus("Token unavailable.");
      return;
    }

    let units: bigint;
    if (asset.isNative) {
      const v = validateWithdrawSol(parseFloat(amount), privBal ?? 0);
      if (!v.ok) {
        setStatus(v.reason);
        return;
      }
      units = v.lamports;
    } else {
      const parsed = parseAmount(amount, asset.decimals);
      if (parsed === null || (privBal !== null && parseFloat(amount) > privBal)) {
        setStatus("Invalid amount.");
        return;
      }
      units = parsed;
    }

    setBusy(true);
    try {
      await getPrivateRail(vw).withdraw(asset, units, setStatus);

      recordActivity(vw.address, {
        ts: Date.now(),
        type: "withdraw",
        amountSol: parseFloat(amount),
      });
      setStatus(`✓ ${amount} ${token} withdrawn to public balance (devnet).`);
      setAmount("");
      onWithdrawn?.();
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
        Withdraw from Private Balance · devnet
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.0 SOL"
          disabled={busy}
          className="flex-1 bv-input px-3 py-2 text-sm"
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
        <button
          onClick={() => privBal != null && setAmount(String(privBal))}
          disabled={busy || privBal == null}
          className="bv-press bv-btn-ghost px-4 py-2 text-sm disabled:opacity-40"
        >
          Max
        </button>
        <button
          onClick={withdraw}
          disabled={busy}
          className="bv-press bv-btn-primary px-4 text-sm disabled:opacity-50"
        >
          {busy ? "…" : "Withdraw"}
        </button>
      </div>
      {privBal != null && (
        <p className="mt-2 text-xs text-muted">
          Private balance: {privBal} {token}
        </p>
      )}
      {guardWarnings.map((w) => (
        <p key={w} className="mt-2 text-xs leading-5 text-yellow-500/90">
          ⚠ {w}
        </p>
      ))}
      {status && (
        <p className="mt-3 break-words text-sm leading-6 text-foreground/90">
          {status}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { address } from "@solana/kit";
import { Connection } from "@solana/web3.js";
import { UMBRA_RPC, validateWithdrawSol } from "@/lib/umbra";
import { getPrivateRail } from "@/lib/umbra-rail";
import { useVaultWallet } from "@/lib/wallet";
import { isSolName, resolveSolName } from "@/lib/sns";
import { recordActivity } from "@/lib/activity";
import { parseAmount, privateTokens, railAsset, solAsset } from "@/lib/tokens";
import { ConfirmSheet } from "@/components/confirm-sheet";

export function UmbraSendPrivate({
  ready,
  refreshKey,
  onSent,
}: {
  ready?: boolean;
  refreshKey?: number;
  onSent?: () => void;
}) {
  const vw = useVaultWallet();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("SOL");
  const [privBal, setPrivBal] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [fromRequest, setFromRequest] = useState(false);
  const addr = vw.address;

  useEffect(() => {
    if (addr && localStorage.getItem(`bv_umbra_registered_${addr}`)) {
      setRegistered(true);
    }
  }, [addr]);

  // Prefill from a /pay link, one-shot.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("bv_pay_request");
      if (!raw) return;
      sessionStorage.removeItem("bv_pay_request");
      const req = JSON.parse(raw) as { to: string; amount?: number };
      setTo(req.to);
      if (req.amount) setAmount(String(req.amount));
      setFromRequest(true);
    } catch {
      // ignore malformed request
    }
  }, []);

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

  async function send() {
    if (!vw.isConnected || busy) return;
    setStatus(null);
    let dest;
    try {
      const raw = to.trim();
      dest = address(
        isSolName(raw)
          ? await resolveSolName(new Connection(UMBRA_RPC), raw)
          : raw
      );
    } catch {
      setStatus("Invalid recipient address or name.");
      return;
    }
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

    setConfirming(false);
    setBusy(true);
    try {
      await getPrivateRail(vw).sendPrivate(dest, asset, units, setStatus);
      if (vw.address) {
        recordActivity(vw.address, {
          ts: Date.now(),
          type: "private-send",
          amountSol: parseFloat(amount),
        });
      }
      setStatus(
        `✓ ${amount} ${token} sent privately to ${to.slice(0, 4)}…${to.slice(-4)} (devnet).`
      );
      setTo("");
      setAmount("");
      onSent?.();
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
        Send Privately · devnet
      </p>
      <p className="mt-1 text-xs text-muted">
        Amount stays hidden. Recipient must have an active Private Vault.
      </p>
      {fromRequest && (
        <p className="mt-1 text-xs text-accent">Payment request loaded.</p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Address or name.blackvault.sol"
          disabled={busy}
          className="bv-input px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
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
            onClick={() => {
              setStatus(null);
              if (!to.trim()) return setStatus("Enter a recipient.");
              if (!parseFloat(amount)) return setStatus("Invalid amount.");
              setConfirming(true);
            }}
            disabled={busy}
            className="bv-press bv-btn-primary px-4 text-sm disabled:opacity-50"
          >
            {busy ? "…" : "Send Privately"}
          </button>
        </div>
      </div>
      {privBal != null && (
        <p className="mt-2 text-xs text-muted">
          Private balance: {privBal} {token}
        </p>
      )}
      {status && (
        <p className="mt-3 break-words text-sm leading-6 text-foreground/90">
          {status}
        </p>
      )}
      <ConfirmSheet
        open={confirming}
        title="Review private transfer"
        rows={[
          ["To", to.trim()],
          ["Amount", `${amount} ${token}`],
        ]}
        note="Amount will be hidden on-chain. Recipient claims it from their vault. Network fee is paid in SOL."
        busy={busy}
        onConfirm={send}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { address as toAddress, createSolanaRpc } from "@solana/kit";
import { UMBRA_RPC } from "@/lib/umbra";
import { getPrivateRail } from "@/lib/umbra-rail";
import { useVaultWallet } from "@/lib/wallet";

const MIN_FEE_SOL = 0.01;

export function UmbraRegister({ onActivated }: { onActivated?: () => void }) {
  const vw = useVaultWallet();
  const rpc = useMemo(() => createSolanaRpc(UMBRA_RPC), []);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const address = vw.address;
  const storageKey = address ? `bv_umbra_registered_${address}` : null;

  useEffect(() => {
    if (storageKey && localStorage.getItem(storageKey)) {
      setDone(true);
      onActivated?.();
    }
  }, [storageKey, onActivated]);

  function markDone() {
    setDone(true);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, "1");
      } catch {
        // storage unavailable
      }
    }
    onActivated?.();
  }

  async function activate() {
    if (!vw.isConnected || !vw.address || busy || done) return;
    setBusy(true);

    // Registration pays fee + rent, so an empty wallet always fails simulation.
    setStatus("Checking balance…");
    try {
      const { value } = await rpc.getBalance(toAddress(vw.address)).send();
      if (Number(value) / 1_000_000_000 < MIN_FEE_SOL) {
        setStatus(
          "Balance too low. Fund your wallet with devnet SOL for fees (faucet.solana.com), then try again."
        );
        setBusy(false);
        return;
      }
    } catch {
      // balance read failed — let the real error surface below
    }

    setStatus("Preparing private vault…");
    try {
      await getPrivateRail(vw).register(setStatus);
      markDone();
      setStatus("✓ Private Vault active for this wallet (devnet).");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already")) {
        markDone();
        setStatus("✓ Private Vault already active for this wallet.");
      } else if (msg.includes("simulation failed")) {
        setStatus(
          "Failed: transaction rejected — likely not enough SOL for fees. Fund your wallet (faucet.solana.com) and try again."
        );
      } else {
        setStatus("Failed: " + msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!vw.isConnected) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Private Vault · Umbra (devnet)
      </p>
      <p className="mt-2 text-sm text-muted">
        Activate shielded privacy (registers your wallet with the Umbra
        protocol).
      </p>
      <button
        onClick={activate}
        disabled={busy || done}
        className={
          done
            ? "mt-3 h-10 cursor-default rounded-lg border border-accent/40 bg-accent/10 px-5 text-sm font-medium text-accent disabled:opacity-100"
            : "mt-3 h-10 bv-press bv-btn-primary px-5 text-sm disabled:opacity-50"
        }
      >
        {done
          ? "✓ Private Vault active"
          : busy
            ? "Working…"
            : "Activate Private Vault"}
      </button>
      {status && !done && (
        <p className="mt-3 break-words text-sm leading-6 text-foreground/90">
          {status}
        </p>
      )}
    </div>
  );
}

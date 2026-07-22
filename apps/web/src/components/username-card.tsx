"use client";

import { useEffect, useState } from "react";
import { SNS_SUFFIX, isValidUsername, normalizeUsername } from "@/lib/sns";
import { useVaultWallet } from "@/lib/wallet";

export function UsernameCard() {
  const { isConnected, address } = useVaultWallet();
  const [name, setName] = useState("");
  const [claimed, setClaimed] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (address) {
      setClaimed(localStorage.getItem(`bv_username_${address}`));
    }
  }, [address]);

  async function claim() {
    if (!address || busy) return;
    const clean = normalizeUsername(name);
    if (!isValidUsername(clean)) {
      setStatus("2-31 chars: lowercase letters, digits, hyphens.");
      return;
    }
    setBusy(true);
    setStatus("Claiming username…");
    try {
      const res = await fetch("/api/sns/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, owner: address }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Claim failed.");
        return;
      }
      localStorage.setItem(`bv_username_${address}`, data.name);
      setClaimed(data.name);
      setStatus(null);
    } catch {
      setStatus("Claim failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected || !address) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Username · devnet
      </p>
      {claimed ? (
        <p className="mt-2 font-mono text-lg text-accent">{claimed}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            Claim a name others can send to instead of your address.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="yourname"
              disabled={busy}
              className="flex-1 bv-input px-3 py-2 text-sm"
            />
            <span className="self-center text-sm text-muted">{SNS_SUFFIX}</span>
            <button
              onClick={claim}
              disabled={busy}
              className="bv-press bv-btn-primary px-4 text-sm disabled:opacity-50"
            >
              {busy ? "…" : "Claim"}
            </button>
          </div>
        </>
      )}
      {status && (
        <p className="mt-3 break-words text-sm leading-6 text-foreground/90">
          {status}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useVaultWallet } from "@/lib/wallet";

export function VaultButton() {
  const { ready, isConnected, address, login, logout } = useVaultWallet();
  const [copied, setCopied] = useState(false);

  if (!ready) return null;

  if (isConnected && address) {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // clipboard unavailable
      }
    };

    return (
      <div className="flex items-center gap-2">
        <button
          onClick={copy}
          title="Click to copy full address"
          className="bv-press bv-btn-brand inline-flex h-11 items-center gap-2 px-6 font-mono text-sm font-medium"
        >
          {copied ? "Copied ✓" : `${address.slice(0, 4)}…${address.slice(-4)}`}
        </button>
        <button
          onClick={logout}
          title="Log out / switch account"
          className="bv-press bv-btn-ghost h-11 px-5 text-sm font-medium"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="bv-press bv-btn-primary h-12 px-8 text-sm"
    >
      Open your Vault
    </button>
  );
}

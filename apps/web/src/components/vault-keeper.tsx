"use client";

import { useState } from "react";
import { createConnection, getPortfolio } from "@blackvault/sdk";
import { useVaultWallet } from "@/lib/wallet";

export function VaultKeeper({
  vaultActive,
  privateBalanceSol,
}: {
  vaultActive?: boolean;
  privateBalanceSol?: number | null;
}) {
  const { isConnected, address } = useVaultWallet();

  const [input, setInput] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!address || !input.trim() || loading) return;
    setLoading(true);
    setReply(null);
    try {
      const portfolio = await getPortfolio(createConnection(), [address]);
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          portfolio,
          privacy: {
            vaultActive: Boolean(vaultActive),
            privateBalanceSol: privateBalanceSol ?? null,
          },
        }),
      });
      const data = await res.json();
      setReply(data.reply ?? data.error ?? "No response.");
    } catch {
      setReply("Could not reach Vault Keeper.");
    } finally {
      setLoading(false);
    }
  }

  if (!isConnected || !address) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Vault Keeper · AI
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          placeholder="Ask about your portfolio…"
          className="flex-1 bv-input px-3 py-2 text-sm"
        />
        <button
          onClick={ask}
          disabled={loading}
          className="bv-press bv-btn-primary px-4 text-sm disabled:opacity-50"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
      {reply && (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
          {reply}
        </p>
      )}
    </div>
  );
}

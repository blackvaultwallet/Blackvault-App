"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { buildPayLink } from "@/lib/pay-request";
import { useVaultWallet } from "@/lib/wallet";

export function PaymentRequest({ ready }: { ready?: boolean }) {
  const { isConnected, address } = useVaultWallet();
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    if (!address || typeof window === "undefined") return null;
    const parsed = parseFloat(amount);
    return buildPayLink(window.location.origin, {
      to: address,
      amount: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
    });
  }, [address, amount]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  if (!isConnected || !address || !ready) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Request Payment · devnet
      </p>
      <p className="mt-1 text-xs text-muted">
        Share a link or QR — the sender pays you privately.
      </p>
      <div className="mt-3 flex items-start gap-4">
        <div className="flex-1">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Amount (optional)"
            className="w-full bv-input px-3 py-2 text-sm"
          />
          <button
            onClick={copy}
            className="mt-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-muted transition hover:border-accent/40"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </div>
        {link && (
          <div className="rounded-lg bg-white p-2">
            <QRCodeSVG value={link} size={112} />
          </div>
        )}
      </div>
    </div>
  );
}

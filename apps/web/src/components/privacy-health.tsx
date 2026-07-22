"use client";

import { useEffect, useState } from "react";
import {
  createConnection,
  getPortfolio,
  privacyHealthScore,
  type PrivacyHealth,
} from "@blackvault/sdk";
import { useVaultWallet } from "@/lib/wallet";

export function PrivacyHealthCard({
  vaultActive,
  privateBalanceSol,
}: {
  vaultActive?: boolean;
  privateBalanceSol?: number | null;
}) {
  const { isConnected, address } = useVaultWallet();
  const [health, setHealth] = useState<PrivacyHealth | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setHealth(null);
      return;
    }
    let active = true;
    (async () => {
      let accountCount = 1;
      try {
        const p = await getPortfolio(createConnection(), [address]);
        accountCount = p.accountCount;
      } catch {
        // fall back to a single account
      }
      if (!active) return;
      setHealth(
        privacyHealthScore({
          accountCount,
          usesStealth: Boolean(vaultActive),
          usesConfidential: (privateBalanceSol ?? 0) > 0,
        })
      );
    })();
    return () => {
      active = false;
    };
  }, [isConnected, address, vaultActive, privateBalanceSol]);

  if (!isConnected || !address || !health) return null;

  const color =
    health.level === "high"
      ? "text-green-400"
      : health.level === "medium"
        ? "text-accent"
        : "text-red-400";

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Privacy Health
      </p>
      <p className="mt-1 text-2xl font-semibold">
        <span className={color}>{health.score}</span>
        <span className="text-base text-muted"> /100 · {health.level}</span>
      </p>
      {health.tips.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm leading-6 text-muted">
          {health.tips.map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

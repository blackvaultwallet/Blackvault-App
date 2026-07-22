"use client";

import { useEffect, useState } from "react";
import { createConnection, getPortfolio } from "@blackvault/sdk";
import { useVaultWallet } from "@/lib/wallet";

export function OnboardingChecklist({
  vaultActive,
  privateBalanceSol,
  onGoVault,
}: {
  vaultActive: boolean;
  privateBalanceSol: number | null;
  onGoVault: () => void;
}) {
  const { isConnected, address } = useVaultWallet();
  const [hasSol, setHasSol] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (address) {
      setDismissed(!!localStorage.getItem(`bv_onboarded_${address}`));
    }
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) return;
    getPortfolio(createConnection(), [address])
      .then((p) => setHasSol(p.totalSol > 0))
      .catch(() => {});
  }, [isConnected, address]);

  const shielded = (privateBalanceSol ?? 0) > 0;
  const steps: [string, boolean][] = [
    ["Sign in", true],
    ["Fund wallet with devnet SOL", hasSol],
    ["Activate Private Vault", vaultActive],
    ["Shield your first deposit", shielded],
  ];
  const allDone = steps.every(([, ok]) => ok);

  useEffect(() => {
    if (allDone && address && !dismissed) {
      localStorage.setItem(`bv_onboarded_${address}`, "1");
    }
  }, [allDone, address, dismissed]);

  if (!isConnected || dismissed || allDone) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Getting started
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {steps.map(([label, ok]) => (
          <li key={label} className="flex items-center gap-2 text-sm">
            <span className={ok ? "text-accent" : "text-muted"}>
              {ok ? "✓" : "○"}
            </span>
            <span className={ok ? "text-muted line-through" : ""}>{label}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onGoVault}
        className="mt-3 bv-press bv-btn-brand px-4 py-2 text-sm"
      >
        Continue setup →
      </button>
    </div>
  );
}

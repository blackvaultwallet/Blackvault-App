"use client";

import { useExportWallet } from "@privy-io/react-auth/solana";
import { useVaultWallet } from "@/lib/wallet";

export function WalletExport() {
  const { isConnected, address } = useVaultWallet();
  const { exportWallet } = useExportWallet();

  if (!isConnected || !address) return null;

  return (
    <button
      onClick={() => exportWallet({ address })}
      className="rounded-lg border border-white/10 px-4 py-2 text-sm text-muted transition hover:border-accent/40"
    >
      Export private key (to Phantom)
    </button>
  );
}

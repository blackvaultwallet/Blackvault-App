"use client";

// Chain-agnostic wallet facade. NEXT_PUBLIC_CHAIN is a build-time constant, so
// branching on it here is stable across renders (only one chain's Privy hooks
// are ever called — never both, which would break the inactive chain).

import { isEvm } from "@/lib/chain";
import { useEvmWallet } from "@/lib/chain/evm/wallet";
import { useVaultWallet } from "@/lib/wallet";

export interface UnifiedWallet {
  ready: boolean;
  isConnected: boolean;
  address: string | null;
  login: () => void;
  logout: () => void;
  chain: "evm" | "solana";
}

export function useWallet(): UnifiedWallet {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isEvm()) {
    const w = useEvmWallet();
    return {
      ready: w.ready,
      isConnected: w.isConnected,
      address: w.address,
      login: w.login,
      logout: w.logout,
      chain: "evm",
    };
  }
  const w = useVaultWallet();
  return {
    ready: w.ready,
    isConnected: w.isConnected,
    address: w.address ?? null,
    login: w.login,
    logout: w.logout,
    chain: "solana",
  };
  /* eslint-enable react-hooks/rules-of-hooks */
}

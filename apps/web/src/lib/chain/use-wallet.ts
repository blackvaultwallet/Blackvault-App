"use client";

// Wallet facade over the Privy-backed EVM wallet (the app ships EVM-only).

import { useEvmWallet } from "@/lib/chain/evm/wallet";

export interface UnifiedWallet {
  ready: boolean;
  isConnected: boolean;
  address: string | null;
  login: () => void;
  logout: () => void;
}

export function useWallet(): UnifiedWallet {
  const w = useEvmWallet();
  return {
    ready: w.ready,
    isConnected: w.isConnected,
    address: w.address,
    login: w.login,
    logout: w.logout,
  };
}

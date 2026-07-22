"use client";

// Privy EVM embedded wallet → viem clients. Mirrors useVaultWallet's shape so
// UI can swap chains cleanly. Requires EVM enabled in the Privy dashboard.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";

export interface EvmWallet {
  ready: boolean;
  isConnected: boolean;
  address: string | null;
  walletClient: WalletClient | null;
  login: () => void;
  logout: () => void;
}

export function useEvmWallet(): EvmWallet {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const creating = useRef(false);
  const loggingOut = useRef(false);

  // Prefer the embedded wallet; fall back to the first connected one.
  const wallet =
    wallets.find((w) => w.walletClientType === "privy") ?? wallets[0] ?? null;
  const address = wallet?.address ?? null;

  // During logout Privy clears the wallet before flipping `authenticated`, which
  // would otherwise trip the auto-provision below into minting a fresh wallet —
  // so gate on an explicit logout intent and clear it once we're logged out.
  useEffect(() => {
    if (!authenticated) loggingOut.current = false;
  }, [authenticated]);

  const doLogout = useCallback(() => {
    loggingOut.current = true;
    logout();
  }, [logout]);

  // Auto-provision the embedded EVM wallet if a logged-in user lacks one
  // (otherwise the boot loader waits forever). Delay first so an existing
  // wallet has time to hydrate — avoids creating a duplicate.
  useEffect(() => {
    if (!ready || !authenticated || address || creating.current || loggingOut.current) return;
    const t = setTimeout(() => {
      if (address || creating.current || loggingOut.current) return;
      creating.current = true;
      createWallet()
        .catch(() => {})
        .finally(() => {
          creating.current = false;
        });
    }, 2000);
    return () => clearTimeout(t);
  }, [ready, authenticated, address, createWallet]);

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!wallet) return null;
    // getEthereumProvider() is async; a thin lazy transport defers it per call.
    const transport = custom({
      async request({ method, params }) {
        const provider = await wallet.getEthereumProvider();
        return provider.request({ method, params });
      },
    });
    return createWalletClient({
      account: address as `0x${string}` | undefined,
      chain: ACTIVE_EVM_CHAIN,
      transport,
    });
  }, [wallet, address]);

  return {
    ready,
    isConnected: authenticated && !!address,
    address,
    walletClient,
    login,
    logout: doLogout,
  };
}

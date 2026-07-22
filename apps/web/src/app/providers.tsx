"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import { useState } from "react";
import { ToastProvider } from "@/components/toast";
import { isEvm } from "@/lib/chain";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";

const DEVNET_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
const DEVNET_WSS = DEVNET_RPC.replace("https://", "wss://");

const solanaRpcs = {
  "solana:devnet": {
    rpc: createSolanaRpc(DEVNET_RPC),
    rpcSubscriptions: createSolanaRpcSubscriptions(DEVNET_WSS),
    blockExplorerUrl: "https://explorer.solana.com?cluster=devnet",
  },
  // Privy's internal UI resolves mainnet even for devnet txs — keep it registered.
  "solana:mainnet": {
    rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
    rpcSubscriptions: createSolanaRpcSubscriptions(
      "wss://api.mainnet-beta.solana.com"
    ),
    blockExplorerUrl: "https://explorer.solana.com",
  },
};

// EVM branch (flag NEXT_PUBLIC_CHAIN=robinhood). Solana config untouched below.
const evmConfig = {
  loginMethods: ["google", "email", "wallet"] as const,
  appearance: {
    walletChainType: "ethereum-only" as const,
    theme: "#0a0a0b",
    accentColor: "#d8b45e",
    logo: "/intro/shield.png",
    landingHeader: "BlackVault",
    loginMessage: "Private banking on-chain",
  },
  embeddedWallets: {
    showWalletUIs: false,
    ethereum: { createOnLogin: "all-users" as const },
  },
  defaultChain: ACTIVE_EVM_CHAIN,
  supportedChains: [ACTIVE_EVM_CHAIN],
};

const solanaConfig = {
  loginMethods: ["google", "email", "wallet"] as const,
  appearance: {
    walletChainType: "solana-only" as const,
    theme: "#0a0a0b",
    accentColor: "#d8b45e",
    logo: "/intro/shield.png",
    landingHeader: "BlackVault",
    loginMessage: "Private banking on Solana",
  },
  embeddedWallets: {
    // Silent signing; our cards surface per-step status. Revisit for mainnet.
    showWalletUIs: false,
    solana: { createOnLogin: "all-users" as const },
  },
  externalWallets: {
    solana: { connectors: toSolanaWalletConnectors() },
  },
  solana: { rpcs: solanaRpcs },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const inner = <ToastProvider>{children}</ToastProvider>;

  return (
    <QueryClientProvider client={queryClient}>
      {appId ? (
        <PrivyProvider
          appId={appId}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config={(isEvm() ? evmConfig : solanaConfig) as any}
        >
          {inner}
        </PrivyProvider>
      ) : (
        // No app ID (e.g. first deploy before env is set): skip Privy so the
        // build can prerender. The app needs the ID to actually authenticate.
        inner
      )}
    </QueryClientProvider>
  );
}

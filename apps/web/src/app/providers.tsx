"use client";

// EVM-only providers. The Solana Privy config was archived when the app went
// EVM-only; testnet vs mainnet is picked by NEXT_PUBLIC_EVM_NETWORK.

import { PrivyProvider } from "@privy-io/react-auth";
import { ToastProvider } from "@/components/toast";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { FUNDING_ORIGINS } from "@/lib/chain/evm/funding";

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
  // The deposit origins have to be listed here or Privy rejects the
  // switchChain the Relay flow needs. Robinhood Chain stays the default.
  supportedChains: [ACTIVE_EVM_CHAIN, ...FUNDING_ORIGINS.map((o) => o.chain)],
};

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const inner = <ToastProvider>{children}</ToastProvider>;

  if (!appId) {
    // No app ID (e.g. first deploy before env is set): skip Privy so the
    // build can prerender. The app needs the ID to actually authenticate.
    return inner;
  }
  return (
    <PrivyProvider
      appId={appId}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config={evmConfig as any}
    >
      {inner}
    </PrivyProvider>
  );
}

"use client";

// App shell: auth flow (intro → headless login → boot loader), then the EVM
// app. The Solana side was archived to ../blackvault-sol when the product went
// EVM-only — see that repo to revive it.

import { useEffect, useRef, useState } from "react";
import { usePrivy, useLoginWithOAuth } from "@privy-io/react-auth";
import { useWallet } from "@/lib/chain/use-wallet";
import { EvmApp } from "@/ui/evm-app";
import { IntroScreen } from "@/ui/intro-screen";
import { LoginScreen } from "@/ui/login-screen";
import { WalletLoader } from "@/ui/wallet-loader";

export function VaultApp() {
  const { isConnected } = useWallet();
  const { authenticated } = usePrivy();
  // Must stay mounted app-wide: Google login returns via full-page redirect
  // and Privy only exchanges the OAuth code while this hook is mounted.
  useLoginWithOAuth();
  const [oauthReturn] = useState(
    () =>
      typeof window !== "undefined" &&
      /privy_oauth/.test(window.location.search)
  );
  const [authView, setAuthView] = useState<"intro" | "create" | "login">("intro");
  const [booting, setBooting] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const prevAuth = useRef<boolean | null>(null);

  // Reset the auth flow so a later logout starts back at the intro.
  useEffect(() => {
    if (!authenticated) setAuthView("intro");
  }, [authenticated]);

  // Fresh login → boot loader for ≥5s. Privy flips `authenticated` first and
  // provisions the embedded wallet a moment later, so the loader also covers
  // that gap (isConnected flickers during it).
  useEffect(() => {
    const prev = prevAuth.current;
    prevAuth.current = authenticated;
    const freshLogin = prev === false || (prev === null && oauthReturn);
    if (!freshLogin || !authenticated) return;
    setBooting(true);
    setMinElapsed(false);
    const t = setTimeout(() => setMinElapsed(true), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    if (booting && minElapsed && isConnected) setBooting(false);
  }, [booting, minElapsed, isConnected]);

  // App subdomain: no marketing landing — intro slides, then our own
  // headless auth screen (Privy modal never opens).
  if (!authenticated) {
    // Back from Google but the code exchange hasn't finished — hold the loader.
    if (oauthReturn) return <WalletLoader />;
    if (authView === "intro") {
      return <IntroScreen onCreateWallet={() => setAuthView("create")} />;
    }
    return <LoginScreen onBack={() => setAuthView("intro")} />;
  }

  // Authenticated: hold the loader through boot AND wallet provisioning.
  if (booting || !isConnected) return <WalletLoader />;

  return <EvmApp />;
}

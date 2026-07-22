"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useLoginWithOAuth } from "@privy-io/react-auth";
import { createConnection, getPortfolio } from "@blackvault/sdk";
import { useWallet } from "@/lib/chain/use-wallet";
import { isEvm } from "@/lib/chain";
import { EvmApp } from "@/ui/evm-app";
import { SendSol } from "@/components/send-sol";
import { ComingSoon } from "@/ui/coming-soon";
import { UmbraSendPrivate } from "@/components/umbra-send-private";
import { UmbraReceivePrivate } from "@/components/umbra-receive-private";
import { PaymentRequest } from "@/components/payment-request";
import { ActivityView } from "@/ui/activity-view";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { SolSettings } from "@/ui/sol-settings";
import { IntroScreen } from "@/ui/intro-screen";
import { AppHeader } from "@/ui/app-header";
import { BannerCarousel } from "@/ui/banner-carousel";
import { AssetsScreen } from "@/ui/asset-list";
import { SolPortfolioCard } from "@/ui/sol-portfolio-card";
import { SolMarkets } from "@/ui/sol-markets";
import { useSolBalances } from "@/lib/sol-balances";
import { useMarket } from "@/lib/market";
import { SolPrivate } from "@/ui/sol-private";
import { LoginScreen } from "@/ui/login-screen";
import { WalletLoader } from "@/ui/wallet-loader";
import { BottomNav, SideNav, type NavId } from "@/ui/bottom-nav";

// "move", "assets" and "scan" are routes reachable from Home/header, not shown
// in the nav.
type Tab = NavId | "move" | "assets" | "scan";

const NAV_IDS: Tab[] = ["overview", "vault", "ai", "activity", "settings"];
const EXTRA: Tab[] = ["move", "assets", "scan"];
// Solana keeps its full five-item nav (no Degen — that's an EVM feature).
const SOL_NAV: NavId[] = ["overview", "vault", "ai", "activity", "settings"];

function readHashTab(): Tab {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace("#", "") as Tab;
  return NAV_IDS.includes(h) || EXTRA.includes(h) ? h : "overview";
}

const navActive = (t: Tab): NavId =>
  t === "move" || t === "assets" || t === "scan" ? "overview" : (t as NavId);

function ActivateHint({ onGo }: { onGo: () => void }) {
  return (
    <div className="bv-card bv-enter p-5 text-sm" style={{ color: "var(--text-dim)" }}>
      Private features need an active Private Vault.{" "}
      <button
        onClick={onGo}
        className="underline-offset-2 hover:underline"
        style={{ color: "var(--brand)" }}
      >
        Activate it in Vault →
      </button>
    </div>
  );
}

export function VaultApp() {
  const { isConnected, address } = useWallet();
  const { authenticated } = usePrivy();
  // Must stay mounted app-wide: Google login returns via full-page redirect
  // and Privy only exchanges the OAuth code while this hook is mounted.
  useLoginWithOAuth();
  const [oauthReturn] = useState(
    () =>
      typeof window !== "undefined" &&
      /privy_oauth/.test(window.location.search)
  );
  const [privBalRefresh, setPrivBalRefresh] = useState(0);
  const [umbraReady, setUmbraReady] = useState(false);
  const [privBalSol, setPrivBalSol] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [authView, setAuthView] = useState<"intro" | "create" | "login">("intro");
  const [booting, setBooting] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [probeDone, setProbeDone] = useState(false);
  const prevAuth = useRef<boolean | null>(null);

  const { balances: solBalances, refresh: refreshSolBal } = useSolBalances(address ?? null);
  const quotes = useMarket();
  const priceOf = (s: string) => (s === "SOL" ? quotes?.SOL?.price ?? 0 : 1);
  const changeOf = (s: string) => quotes?.[s]?.change24h ?? 0;

  const bump = () => setPrivBalRefresh((n) => n + 1);

  useEffect(() => {
    setTab(readHashTab());
  }, []);

  // Reset the auth flow so a later logout starts back at the intro.
  useEffect(() => {
    if (!authenticated) setAuthView("intro");
  }, [authenticated]);

  // Hydrate vault status from storage so the header badge is correct app-wide.
  useEffect(() => {
    if (address && localStorage.getItem(`bv_umbra_registered_${address}`)) {
      setUmbraReady(true);
    }
  }, [address]);

  // Fresh login → boot loader for ≥5s. Privy flips `authenticated` first and
  // provisions the embedded wallet a moment later, so the loader also covers
  // that gap (isConnected flickers during it).
  useEffect(() => {
    const prev = prevAuth.current;
    prevAuth.current = authenticated;
    // Fresh login this session, or landing back from the Google redirect.
    const freshLogin = prev === false || (prev === null && oauthReturn);
    if (!freshLogin || !authenticated) return;
    setBooting(true);
    setMinElapsed(false);
    setProbeDone(false);
    const t = setTimeout(() => setMinElapsed(true), 5000);
    return () => clearTimeout(t);
  }, [authenticated]);

  // RPC probe runs once the wallet address exists. EVM skips the Solana probe.
  useEffect(() => {
    if (!booting || !address || probeDone) return;
    if (isEvm()) {
      setProbeDone(true);
      return;
    }
    let active = true;
    getPortfolio(createConnection(), [address])
      .catch(() => null)
      .then(() => active && setProbeDone(true));
    return () => {
      active = false;
    };
  }, [booting, address, probeDone]);

  // Leave the loader only when everything is ready.
  useEffect(() => {
    if (booting && minElapsed && probeDone && isConnected) setBooting(false);
  }, [booting, minElapsed, probeDone, isConnected]);

  function go(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", `#${t}`);
  }

  // App subdomain: no marketing landing — intro slides, then our own
  // headless auth screen (Privy modal never opens).
  if (!authenticated) {
    // Back from Google but the code exchange hasn't finished — hold the loader.
    if (oauthReturn) {
      return <WalletLoader />;
    }
    if (authView === "intro") {
      return <IntroScreen onCreateWallet={() => setAuthView("create")} />;
    }
    return <LoginScreen onBack={() => setAuthView("intro")} />;
  }

  // Authenticated: hold the loader through boot AND wallet provisioning.
  if (booting || !isConnected) {
    return <WalletLoader />;
  }

  // EVM: render the Robinhood app; no Solana-wired component mounts.
  if (isEvm()) {
    return <EvmApp />;
  }

  return (
    <div
      className="flex min-h-full flex-1 flex-col"
      style={{ backgroundImage: "var(--bg-sheen)", backgroundRepeat: "no-repeat" }}
    >
      {NAV_IDS.includes(tab) ? (
        <AppHeader
          mode={tab === "vault" ? "private" : "public"}
          onToggleMode={() => go(tab === "vault" ? "overview" : "vault")}
          onScan={() => go("scan")}
          onOpenActivity={() => go("activity")}
        />
      ) : (
        <div className="relative z-30 px-5 py-4 sm:px-8">
          <button
            onClick={() => go("overview")}
            aria-label="Back"
            className="bv-press flex h-10 w-10 items-center justify-center"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "var(--r-pill)",
              color: "var(--text)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            ←
          </button>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-5xl flex-1">
          <SideNav active={navActive(tab)} onSelect={go} items={SOL_NAV} />

          <main className="w-full flex-1 px-6 pb-28 pt-8 sm:px-8 lg:pb-10">
            {tab === "overview" && (
              <div className="mx-auto flex w-full max-w-md flex-col gap-4">
                <SolPortfolioCard
                  balances={solBalances}
                  priceOf={priceOf}
                  changeOf={changeOf}
                  onAction={(a) => {
                    if (a === "Send" || a === "Receive") go("move");
                    else if (a === "Private") go("vault");
                    else go("settings");
                  }}
                />
                <OnboardingChecklist
                  vaultActive={umbraReady}
                  privateBalanceSol={privBalSol}
                  onGoVault={() => go("vault")}
                />
                <BannerCarousel />
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Your Assets</h2>
                    <button onClick={refreshSolBal} className="bv-press bv-btn-ghost px-3 py-1 text-xs">
                      Refresh
                    </button>
                  </div>
                  <SolMarkets />
                </div>
              </div>
            )}

            {tab === "move" && (
              <div className="flex flex-col gap-4">
                <SendSol />
                {umbraReady ? (
                  <>
                    <UmbraSendPrivate
                      ready={umbraReady}
                      refreshKey={privBalRefresh}
                      onSent={bump}
                    />
                    <UmbraReceivePrivate ready={umbraReady} onClaimed={bump} />
                    <PaymentRequest ready={umbraReady} />
                  </>
                ) : (
                  <ActivateHint onGo={() => go("vault")} />
                )}
              </div>
            )}

            {tab === "vault" && (
              <SolPrivate
                refreshKey={privBalRefresh}
                vaultActive={umbraReady}
                onActivated={() => setUmbraReady(true)}
                onChanged={bump}
                onPrivBalance={setPrivBalSol}
              />
            )}

            {tab === "ai" && <ComingSoon title="Vault Keeper" subtitle="Your AI copilot" />}

            {tab === "assets" && <AssetsScreen />}

            {tab === "scan" && <ComingSoon title="Scan" subtitle="Barcode & QR camera" />}

            {tab === "activity" && <ActivityView refreshKey={privBalRefresh} />}

            {tab === "settings" && (
              <SolSettings vaultActive={umbraReady} privateBalanceSol={privBalSol} />
            )}
          </main>
      </div>

      <BottomNav active={navActive(tab)} onSelect={go} items={SOL_NAV} />
    </div>
  );
}

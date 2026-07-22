"use client";

// Authenticated EVM app (Robinhood Chain). Rendered instead of the Solana
// shell when NEXT_PUBLIC_CHAIN=robinhood. Tabbed shell (Home/Vault/AI/Activity/
// Settings) mirroring the Solana app, with EVM data. Send via a bottom sheet.

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/chain/use-wallet";
import { useEvmWallet } from "@/lib/chain/evm/wallet";
import { getEvmChainAdapter } from "@/lib/chain";
import { useMarket } from "@/lib/market";
import { Skeleton } from "@/ui/primitives";
import { BannerCarousel } from "@/ui/banner-carousel";
import { EvmAppHeader } from "@/ui/evm-app-header";
import { EvmPortfolioCard } from "@/ui/evm-portfolio-card";
import { EvmActivity } from "@/ui/evm-activity";
import { EvmAi } from "@/ui/evm-ai";
import { EvmMarkets } from "@/ui/evm-markets";
import { EvmPrivate } from "@/ui/evm-private";
import { EvmNews } from "@/ui/evm-news";
import { EvmSettings } from "@/ui/evm-settings";
import { EvmSend } from "@/ui/evm-send";
import { EvmReceive } from "@/ui/evm-receive";
import { ComingSoonSheet } from "@/ui/coming-soon-sheet";
import { EvmDegen } from "@/ui/evm-degen";
import { CardShowcase } from "@/ui/card-showcase";
import { EvmPrivateScan } from "@/ui/evm-private-scan";
import { parseEvmPayRequest } from "@/lib/chain/evm/pay-link";
import { BottomNav, SideNav, type NavId } from "@/ui/bottom-nav";
import { AppLock } from "@/ui/app-lock";
import { lockEnabled } from "@/lib/biometric-lock";
import { useToast } from "@/components/toast";
import type { TokenBalance } from "@/lib/chain/types";

export function EvmApp() {
  const { address } = useWallet();
  const { walletClient } = useEvmWallet();
  const quotes = useMarket();
  const toast = useToast();
  const adapter = getEvmChainAdapter(walletClient ?? undefined);

  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [balErr, setBalErr] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [tab, setTab] = useState<NavId>("overview");
  const [activityOpen, setActivityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soon, setSoon] = useState<{ title: string; subtitle: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [prefill, setPrefill] = useState<{
    to: string;
    amount?: number;
    token?: string;
    origin?: "qr" | "request";
  } | null>(null);
  // Biometric app lock: null until the client checks localStorage, then locked
  // while enabled and not yet verified this page load.
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => {
    queueMicrotask(() => setLocked(lockEnabled()));
  }, []);
  // Private Vault gets its own gate: verify once per page load on first open.
  const vaultOk = useRef(false);
  const [vaultGate, setVaultGate] = useState(false);
  function openTab(id: NavId) {
    if (id === "vault" && lockEnabled() && !vaultOk.current) {
      setVaultGate(true);
      return;
    }
    setTab(id);
  }

  // A scanned QR is a BlackVault /pay link (or a raw address / st: meta-address).
  function handleScan(text: string) {
    setScanOpen(false);
    let req: ReturnType<typeof parseEvmPayRequest> = null;
    try {
      const u = new URL(text);
      req = parseEvmPayRequest({
        to: u.searchParams.get("to"),
        amount: u.searchParams.get("amount"),
        token: u.searchParams.get("token"),
        note: u.searchParams.get("note"),
      });
    } catch {
      req = parseEvmPayRequest({ to: text });
    }
    if (!req) return toast("error", "Unrecognized QR code");
    if (req.isPrivate) {
      openTab("vault");
      toast("success", "Open Send in Vault to pay privately");
    } else {
      setPrefill({ to: req.to, amount: req.amount, token: req.token, origin: "qr" });
      setSendOpen(true);
    }
  }

  // Handle an incoming /pay request: public opens Send prefilled; private
  // route to the Vault so the payer sends privately.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("bv_pay_request");
      sessionStorage.removeItem("bv_pay_request");
    } catch {
      /* storage unavailable */
    }
    if (!raw) return;
    queueMicrotask(() => {
      let req: ReturnType<typeof parseEvmPayRequest> = null;
      try {
        req = parseEvmPayRequest(JSON.parse(raw));
      } catch {
        req = null;
      }
      if (!req) return;
      if (req.isPrivate) {
        openTab("vault");
        toast("success", "Open Send in Vault to pay privately");
      } else {
        setPrefill({ to: req.to, amount: req.amount, token: req.token, origin: "request" });
        setSendOpen(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    if (!address) return;
    setLoading(true);
    setBalErr(null);
    try {
      setBalances(await adapter.getBalances(address));
    } catch (e) {
      setBalErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Initial load: keep setState out of the effect body (async callbacks only).
  useEffect(() => {
    if (!address) return;
    let active = true;
    adapter
      .getBalances(address)
      .then((b) => active && setBalances(b))
      .catch((e) => active && setBalErr((e as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const STABLES = new Set(["USDG", "USDC", "USDT"]);
  const price = (sym: string) =>
    sym === "ETH" ? quotes?.ETH?.price ?? 0 : STABLES.has(sym) ? 1 : 0;
  const change = (sym: string) => quotes?.[sym]?.change24h ?? 0;

  const [receiveOpen, setReceiveOpen] = useState(false);

  if (locked) return <AppLock onUnlock={() => setLocked(false)} />;

  return (
    <div
      className="flex min-h-full flex-1 flex-col"
      style={{ backgroundImage: "var(--bg-sheen)", backgroundRepeat: "no-repeat" }}
    >
      {tab !== "degen" && (
        <EvmAppHeader
          mode={tab === "vault" ? "private" : "public"}
          onToggleMode={() => (tab === "vault" ? setTab("overview") : openTab("vault"))}
          onScan={() => setScanOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <div className="mx-auto flex w-full max-w-5xl flex-1">
        <SideNav active={tab} onSelect={openTab} items={NAV} />

        <main
          className={
            tab === "activity"
              ? "w-full flex-1 overflow-hidden pt-2"
              : tab === "degen"
                ? "w-full flex-1 pb-24 lg:pb-6"
                : "w-full flex-1 px-6 pb-28 pt-4 sm:px-8 lg:pb-10"
          }
        >
          {tab === "overview" && (
            <div className="mx-auto flex w-full max-w-md flex-col gap-4">
              {loading && balances.length === 0 ? (
                <Skeleton className="h-[236px] w-full" />
              ) : (
                <EvmPortfolioCard
                  balances={balances}
                  priceOf={price}
                  changeOf={change}
                  onAction={(a) => {
                    if (a === "Send") setSendOpen(true);
                    else if (a === "Receive") setReceiveOpen(true);
                    else if (a === "NFC") setSoon({ title: "NFC Pay", subtitle: "Tap-to-pay" });
                    else setCardOpen(true);
                  }}
                />
              )}

              {/* gas warning: assets present but no ETH — every tx would fail */}
              {!loading &&
                (balances.find((b) => b.token.symbol === "ETH")?.amount ?? 0) <= 0 &&
                balances.some((b) => b.token.symbol !== "ETH" && b.amount > 0) && (
                  <div
                    className="flex items-center gap-2.5 px-4 py-3 text-xs"
                    style={{
                      background: "rgba(250,190,80,0.08)",
                      border: "1px solid rgba(250,190,80,0.35)",
                      borderRadius: "var(--r-card)",
                      color: "#fabe50",
                    }}
                  >
                    <span className="text-base">⛽</span>
                    <span>
                      <strong>No ETH for gas.</strong> Sends will fail until you add a little ETH
                      — bridge some to your wallet address.
                    </span>
                  </div>
                )}

              <BannerCarousel />

              {/* your assets — market prices + 24h + mini chart */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Your Assets</h2>
                  <button onClick={refresh} className="bv-press bv-btn-ghost px-3 py-1 text-xs">
                    {loading ? "…" : "Refresh"}
                  </button>
                </div>
                {balErr && (
                  <p className="text-xs" style={{ color: "var(--negative)" }}>
                    read error: {balErr}
                  </p>
                )}
                <EvmMarkets />
              </div>
            </div>
          )}

          {tab === "vault" && (
            <div className="mx-auto w-full max-w-md">
              <EvmPrivate
                wallet={walletClient}
                address={address}
                priceOf={price}
                publicBalances={balances}
                onPublicBalanceChange={refresh}
              />
            </div>
          )}

          {tab === "ai" && <EvmAi />}

          {tab === "degen" && <EvmDegen onBack={() => setTab("overview")} />}

          {tab === "news" && <EvmNews />}
        </main>
      </div>

      <BottomNav active={tab} onSelect={openTab} items={NAV} />

      {/* send sheet (keyed so a /pay prefill remounts with the new values) */}
      <EvmSend
        key={prefill ? `${prefill.to}-${prefill.amount ?? ""}-${prefill.token ?? ""}` : "send"}
        open={sendOpen}
        onClose={() => {
          setSendOpen(false);
          setPrefill(null);
        }}
        adapter={adapter}
        balances={balances}
        priceOf={price}
        onSent={() => setTimeout(refresh, 3000)}
        initialTo={prefill?.to}
        initialAmount={prefill?.amount ? String(prefill.amount) : undefined}
        initialToken={prefill?.token}
        origin={prefill?.origin}
      />

      <EvmReceive open={receiveOpen} onClose={() => setReceiveOpen(false)} address={address} />

      {/* Activity — reachable from the bell */}
      {activityOpen && (
        <Screen title="Activity" onClose={() => setActivityOpen(false)}>
          <EvmActivity address={address} balances={balances} />
        </Screen>
      )}

      {/* Settings — reachable from the profile menu */}
      {settingsOpen && (
        <Screen title="Settings" onClose={() => setSettingsOpen(false)}>
          <div className="px-6 pt-2 sm:px-8">
            <EvmSettings wallet={walletClient} />
          </div>
        </Screen>
      )}

      <ComingSoonSheet
        open={!!soon}
        title={soon?.title ?? ""}
        subtitle={soon?.subtitle ?? ""}
        onClose={() => setSoon(null)}
      />

      <CardShowcase open={cardOpen} onClose={() => setCardOpen(false)} />

      <EvmPrivateScan open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScan} />

      {/* biometric gate for the Private Vault */}
      {vaultGate && (
        <AppLock
          onUnlock={() => {
            vaultOk.current = true;
            setVaultGate(false);
            setTab("vault");
          }}
          onCancel={() => setVaultGate(false)}
        />
      )}
    </div>
  );
}

// Bottom nav trimmed to the three live areas; Activity + Settings moved to the
// header. The empty slots are held for upcoming features.
const NAV: NavId[] = ["overview", "vault", "ai", "degen", "news"];

// Full-screen overlay for header-launched areas (Activity, Settings).
function Screen({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: "var(--surface-solid)",
        backgroundImage: "var(--bg-sheen)",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4 sm:px-8">
        <button
          onClick={onClose}
          aria-label="Back"
          className="bv-press flex h-10 w-10 items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "var(--r-pill)",
            color: "var(--text)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg></button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{children}</div>
    </div>
  );
}


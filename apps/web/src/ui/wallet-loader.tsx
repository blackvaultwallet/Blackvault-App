"use client";

// Post-login boot screen: BlackVault coin with the chains we live on orbiting
// (RH Chain, Arbitrum, Ethereum, Optimism, Base) plus the stables.
// Shown ≥5s on fast connections; stays up until the app reports ready.

import Image from "next/image";
import {
  RhChainIcon,
  ArbitrumIcon,
  OptimismIcon,
  BaseIcon,
  UsdtIcon,
  UsdcIcon,
  EthIcon,
} from "@/ui/icons";

const ORBITERS = [RhChainIcon, UsdtIcon, ArbitrumIcon, EthIcon, OptimismIcon, UsdcIcon, BaseIcon];
const ORBIT_S = 9;

export function WalletLoader() {
  return (
    <main className="bv-page-in relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div aria-hidden className="bv-smoke pointer-events-none absolute inset-0" />

      {/* coin + orbit */}
      <div className="relative h-72 w-72">
        {/* orbit ring guide (very faint) */}
        <div
          aria-hidden
          className="absolute inset-4 rounded-full"
          style={{ border: "1px dashed var(--border)" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src="/intro/coin.png"
            alt="BlackVault"
            width={170}
            height={170}
            priority
            className="bv-float select-none"
            draggable={false}
          />
        </div>
        {ORBITERS.map((Icon, i) => (
          <span
            key={i}
            className="bv-orbit-item"
            style={{
              // negative delay spreads the coins evenly around the ring
              animationDelay: `${-(i * ORBIT_S) / ORBITERS.length}s`,
              filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
            }}
          >
            <Icon size={28} />
          </span>
        ))}
      </div>

      <p
        className="mt-8 text-sm font-medium"
        style={{ color: "var(--text-dim)" }}
      >
        Preparing your wallet
        <span className="animate-pulse">…</span>
      </p>
    </main>
  );
}

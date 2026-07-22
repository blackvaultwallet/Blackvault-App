"use client";

// Settings tab for the EVM (Robinhood) app: privacy health, username, wallet
// address, network, biometric app lock, 2FA (soon), key export, log out.
// Solana-only surfaces are never mounted here.

import { useEffect, useState } from "react";
import { type WalletClient } from "viem";
import { useExportWallet } from "@privy-io/react-auth";
import { useWallet } from "@/lib/chain/use-wallet";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { enrollLock, disableLock, lockEnabled, verifyLock } from "@/lib/biometric-lock";
import { EvmUsername } from "@/ui/evm-username";
import { EvmPrivacyHealth } from "@/ui/evm-privacy-health";
import { Card, SectionLabel, Badge } from "@/ui/primitives";

/* ---------- inline icons ---------- */
const svg = (d: React.ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const IconWallet = svg(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14" r="1" fill="currentColor" /></>);
const IconNet = svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" /></>);
const IconFace = svg(<><rect x="4" y="4" width="16" height="16" rx="4.5" /><path d="M9 9.5v1M15 9.5v1M9.5 14.5c1.2 1 3.8 1 5 0" /></>);
const IconLock = svg(<><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>);
const IconKey = svg(<><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2" /></>);
const IconOut = svg(<><path d="M15 12H4M11 8l-4 4 4 4" /><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></>);
const IconCopy = svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>);

/* ---------- shared button ---------- */
function PillBtn({
  onClick,
  disabled,
  soon,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  soon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || soon}
      className="bv-press h-9 shrink-0 px-4 text-xs font-semibold disabled:opacity-100"
      style={
        soon
          ? { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", color: "var(--text-faint)" }
          : { background: "rgba(216,180,94,0.12)", border: "1px solid rgba(216,180,94,0.3)", borderRadius: "var(--r-pill)", color: "var(--brand)" }
      }
    >
      {children}
    </button>
  );
}

export function EvmSettings({ wallet }: { wallet: WalletClient | null }) {
  const { address, logout } = useWallet();
  const { exportWallet } = useExportWallet();
  const [copied, setCopied] = useState(false);
  // Biometric app lock (device WebAuthn). Read after mount — localStorage only.
  const [bioLock, setBioLock] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setBioLock(lockEnabled()));
  }, []);

  async function toggleBioLock() {
    if (bioLock) {
      // Turning the lock OFF is sensitive — verify the biometric first.
      if (await verifyLock()) {
        disableLock();
        setBioLock(false);
      }
      return;
    }
    try {
      await enrollLock();
      setBioLock(true);
    } catch {
      /* user cancelled the platform prompt */
    }
  }

  // Key export reveals the private key — biometric gate when the lock is on.
  async function handleExport() {
    if (!address) return;
    if (lockEnabled() && !(await verifyLock())) return;
    exportWallet({ address });
  }

  const shortAddr = address ? `${address.slice(0, 10)}…${address.slice(-8)}` : "—";

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <EvmPrivacyHealth wallet={wallet} address={address} />

      <EvmUsername />

      {/* account */}
      <Card>
        <SectionLabel>Account</SectionLabel>
        <div className="mt-1 flex flex-col">
          <Row icon={IconWallet} label="Wallet address" sub={shortAddr}>
            <button
              onClick={copy}
              aria-label="Copy address"
              className="bv-press flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
              style={{ background: "rgba(216,180,94,0.12)", border: "1px solid rgba(216,180,94,0.3)", borderRadius: "var(--r-pill)", color: "var(--brand)" }}
            >
              {copied ? "Copied ✓" : <>{IconCopy} Copy</>}
            </button>
          </Row>
          <Divider />
          <Row icon={IconNet} label="Network" sub="Robinhood Chain">
            <Badge>{ACTIVE_EVM_CHAIN.testnet ? "testnet" : "mainnet"}</Badge>
          </Row>
        </div>
      </Card>

      {/* security */}
      <Card>
        <SectionLabel>Security</SectionLabel>
        <div className="mt-1 flex flex-col">
          <Row
            icon={IconFace}
            label="Biometric / Face ID"
            sub={bioLock ? "App lock active — unlocks vault, private, export" : "Lock the app with your face or fingerprint"}
          >
            <PillBtn onClick={toggleBioLock}>{bioLock ? "Disable" : "Enable"}</PillBtn>
          </Row>
          <Divider />
          <Row icon={IconLock} label="Two-factor auth" sub="Protect wallet actions">
            <PillBtn soon>Soon</PillBtn>
          </Row>
          <Divider />
          <Row icon={IconKey} label="Export private key" sub="Import into another wallet">
            <PillBtn onClick={handleExport}>Export</PillBtn>
          </Row>
        </div>
      </Card>

      <button
        onClick={logout}
        className="bv-press flex h-12 w-full items-center justify-center gap-2 text-sm font-medium"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", color: "var(--negative)" }}
      >
        {IconOut} Log out
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid var(--border)" }} />;
}

function Row({
  icon,
  label,
  sub,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--brand)" }}
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{label}</span>
          {sub && (
            <span className="truncate text-xs" style={{ color: "var(--text-dim)" }}>
              {sub}
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

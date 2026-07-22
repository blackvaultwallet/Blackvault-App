"use client";

// App header (glass style): QR/scan + a vault chip on the left; activity bell +
// wallet avatar menu on the right. The chip shows which vault you're in —
// Public (Home: public send/receive) vs Private (Vault tab) — and tapping it
// switches between them. Umbra activation now lives on the Vault page itself.

import { useState } from "react";
import { useVaultWallet } from "@/lib/wallet";
import { Badge } from "@/ui/primitives";

function QrIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M14 14h3v3M21 14v7h-7v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a6 6 0 0 0-6 6v3.2l-1.4 2.9a.7.7 0 0 0 .63 1H18.8a.7.7 0 0 0 .62-1L18 12.2V9a6 6 0 0 0-6-6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function iconBtn(): React.CSSProperties {
  return {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "var(--r-pill)",
    color: "var(--text)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };
}

export function AppHeader({
  mode,
  onToggleMode,
  onScan,
  onOpenActivity,
}: {
  mode: "public" | "private";
  onToggleMode?: () => void;
  onScan?: () => void;
  onOpenActivity?: () => void;
}) {
  const { address, logout } = useVaultWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const private_ = mode === "private";

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
    <header className="relative z-30 flex items-center justify-between px-5 py-4 sm:px-8">
      {/* left: scan + vault chip */}
      <div className="flex items-center gap-2">
        <button
          aria-label="Scan / receive"
          onClick={onScan}
          className="bv-press flex h-10 w-10 items-center justify-center"
          style={iconBtn()}
        >
          <QrIcon />
        </button>

        <button
          onClick={onToggleMode}
          title={private_ ? "Switch to public vault" : "Switch to private vault"}
          className="bv-press flex items-center gap-2 py-1.5 pl-2 pr-3 text-xs font-medium"
          style={{
            background: private_ ? "rgba(216, 180, 94, 0.14)" : "rgba(255, 255, 255, 0.05)",
            border: `1px solid ${private_ ? "rgba(216, 180, 94, 0.3)" : "rgba(255, 255, 255, 0.1)"}`,
            borderRadius: "var(--r-pill)",
            color: private_ ? "var(--brand)" : "var(--text-dim)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: private_ ? "var(--brand)" : "var(--text-faint)" }}
          />
          {private_ ? "Private Vault" : "Public Vault"}
        </button>
      </div>

      {/* right: activity + wallet */}
      <div className="flex items-center gap-2">
        <button
          aria-label="Activity"
          onClick={onOpenActivity}
          className="bv-press flex h-10 w-10 items-center justify-center"
          style={iconBtn()}
        >
          <BellIcon />
        </button>

        <div className="relative">
          <button
            aria-label="Wallet menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="bv-press flex h-10 w-10 items-center justify-center font-mono text-xs font-bold"
            style={{
              background: "var(--brand-gradient)",
              color: "var(--cta-text)",
              borderRadius: "var(--r-pill)",
            }}
          >
            {address ? address.slice(0, 2) : "•"}
          </button>
          {menuOpen && address && (
            <div
              className="bv-card bv-enter absolute right-0 top-12 w-64 p-4"
              style={{ background: "var(--surface-solid)" }}
            >
              <div className="flex items-center justify-between">
                <p className="bv-label">Wallet</p>
                <Badge>devnet</Badge>
              </div>
              <button
                onClick={copy}
                className="mt-2 w-full truncate text-left font-mono text-sm underline-offset-2 hover:underline"
                title="Copy address"
              >
                {copied ? "Copied ✓" : `${address.slice(0, 8)}…${address.slice(-8)}`}
              </button>
              <button onClick={logout} className="bv-press bv-btn-ghost mt-3 w-full py-2 text-sm">
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

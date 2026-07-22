"use client";

// Username card: shows your subname (tap to copy) with a Change action, or a
// CTA to get one. The whole purchase flow (availability check → details →
// slide to pay → success) lives in the bottom sheet (evm-username-sheet).

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/chain/use-wallet";
import { lookupUsername } from "@/lib/chain/evm/username";
import { EvmUsernameSheet } from "@/ui/evm-username-sheet";
import { Card, SectionLabel } from "@/ui/primitives";

const TagIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
    <path d="M4 4h7l9 9-7 7-9-9z" />
    <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" />
  </svg>
);

export function EvmUsername() {
  const { address } = useWallet();
  const [current, setCurrent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!address) return;
    let active = true;
    lookupUsername(address)
      .then((n) => active && setCurrent(n))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [address]);

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: "var(--brand)" }}>
          {TagIcon}
          <SectionLabel>Username</SectionLabel>
        </div>
        {current && (
          <button
            onClick={() => setSheetOpen(true)}
            className="bv-press px-3 py-1 text-xs font-semibold"
            style={{
              background: "rgba(216,180,94,0.12)",
              border: "1px solid rgba(216,180,94,0.3)",
              borderRadius: "var(--r-pill)",
              color: "var(--brand)",
            }}
          >
            Change
          </button>
        )}
      </div>

      {current ? (
        <button
          onClick={copy}
          className="bv-press mt-2 w-full truncate rounded-lg px-3 py-2 text-left font-mono text-sm"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {copied ? "Copied ✓" : current}
        </button>
      ) : (
        <>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-dim)" }}>
            Claim an ENS name so people can pay you by name instead of a 0x
            address. Works anywhere ENS is supported.
          </p>
          <button
            onClick={() => setSheetOpen(true)}
            className="bv-press mt-3 h-10 w-full text-sm font-semibold"
            style={{ background: "var(--brand-gradient)", color: "var(--cta-text)", borderRadius: "var(--r-pill)" }}
          >
            Get your name
          </button>
        </>
      )}

      <EvmUsernameSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClaimed={(full) => setCurrent(full)}
        isChange={!!current}
      />
    </Card>
  );
}

"use client";

// Small self-contained strip for receive surfaces: shows the user's subname
// (tap to copy) under the address/QR, or a nudge to get one in Settings.
// Private surfaces don't resolve ENS — they state the st:eth-only rule instead.

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/chain/use-wallet";
import { lookupUsername } from "@/lib/chain/evm/username";

export function NameTag({ variant = "public" }: { variant?: "public" | "private" }) {
  const { address } = useWallet();
  const [name, setName] = useState<string | null | "loading">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (variant === "private" || !address) return;
    let active = true;
    lookupUsername(address)
      .then((n) => active && setName(n))
      .catch(() => active && setName(null));
    return () => {
      active = false;
    };
  }, [address, variant]);

  if (variant === "private") {
    return (
      <p className="mt-2 w-full text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
        Private transfers use your st:eth address only — ENS names can&apos;t receive privately.
      </p>
    );
  }

  if (name === "loading") return null;

  if (!name) {
    return (
      <p className="mt-2 w-full text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
        You don&apos;t have a name service yet — get one in Settings.
      </p>
    );
  }

  async function copy() {
    if (!name || name === "loading") return;
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      onClick={copy}
      className="bv-press mt-2 flex w-full items-center justify-center gap-2 truncate rounded-lg px-3 py-2.5 font-mono text-xs"
      style={{
        background: "rgba(216,180,94,0.10)",
        border: "1px solid rgba(216,180,94,0.3)",
        color: "var(--brand)",
      }}
      title={name}
    >
      {copied ? "Copied ✓" : name}
    </button>
  );
}

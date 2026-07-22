"use client";

// Receive privately: show the stealth meta-address as a QR + copyable text.
// Anyone who scans it can pay you privately; the address itself reveals nothing
// about what you hold.

import { useState } from "react";
import { Drawer } from "vaul";
import { QRCodeSVG } from "qrcode.react";
import { ChainSelect } from "@/ui/chain-select";
import { NameTag } from "@/ui/name-tag";

export function EvmPrivateReceive({
  open,
  onClose,
  metaUri,
}: {
  open: boolean;
  onClose: () => void;
  metaUri: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!metaUri) return;
    try {
      await navigator.clipboard.writeText(metaUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background: "var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div className="flex flex-col items-center p-6 pb-8">
            <div
              className="mb-5 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />
            <h3 className="text-base font-semibold">Receive privately</h3>
            <p className="mt-1 text-center text-xs" style={{ color: "var(--text-dim)" }}>
              Share this private address. Payments land on one-time addresses only
              you can spend.
            </p>

            <div className="mt-4 w-full">
              <ChainSelect />
            </div>

            {metaUri && (
              <div className="mt-4 rounded-2xl bg-white p-3">
                <QRCodeSVG value={metaUri} size={196} level="M" />
              </div>
            )}

            <button
              onClick={copy}
              className="bv-press mt-5 w-full truncate rounded-lg px-3 py-3 text-center font-mono text-xs"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              title={metaUri ?? undefined}
            >
              {copied ? "Copied ✓" : metaUri ?? "—"}
            </button>
            <NameTag variant="private" />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

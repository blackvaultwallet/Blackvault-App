"use client";

// Our own PRIVATE payment request (no WalletConnect). Public receive already
// lives in the Receive action — this is the private counterpart: share a /pay
// link + QR pointing at your stealth meta-address, so the payer sends privately
// and you stay unlinked. Pick amount + token + note.

import { useRef, useState } from "react";
import { Drawer } from "vaul";
import { QRCodeSVG } from "qrcode.react";
import { USABLE_EVM_TOKENS } from "@/lib/chain/evm/tokens";
import { buildEvmPayLink } from "@/lib/chain/evm/pay-link";
import { useWallet } from "@/lib/chain/use-wallet";
import { appendJournal } from "@/lib/activity-journal";
import { coinIcon } from "@/ui/evm-coins";
import { NameTag } from "@/ui/name-tag";
import { useToast } from "@/components/toast";

export function EvmPaymentRequest({
  open,
  onClose,
  metaUri,
}: {
  open: boolean;
  onClose: () => void;
  metaUri: string | null;
}) {
  const toast = useToast();
  const { address } = useWallet();
  const [symbol, setSymbol] = useState("USDG");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Journal once per sheet open (sharing the link = the request going out).
  const journaled = useRef(false);

  const n = parseFloat(amount);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = metaUri
    ? buildEvmPayLink(origin, { to: metaUri, amount: n > 0 ? n : undefined, token: symbol, note })
    : "";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      if (address && !journaled.current) {
        journaled.current = true;
        appendJournal(address, {
          kind: "request-created",
          title: `Created private payment request${n > 0 ? ` — ${n} ${symbol}` : ""}`,
          symbol: n > 0 ? symbol : undefined,
          amount: n > 0 ? n : undefined,
          dir: "none",
          detail: note || undefined,
        });
      }
      toast("success", "Payment link copied");
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
            background:
              "radial-gradient(120% 70% at 50% 0%, rgba(216,180,94,0.22), rgba(216,180,94,0.05) 45%, transparent 70%), var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div className="flex flex-col p-5 pb-8">
            <div
              className="mx-auto mb-4 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Request private payment</h3>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: "var(--brand-soft)", border: "1px solid rgba(216,180,94,0.3)", color: "var(--brand)" }}
              >
                Private
              </span>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
              Payer sends to your stealth address — you stay unlinked. For a public
              request, use Receive.
            </p>

            {/* token row */}
            <div className="mt-4 flex flex-wrap gap-2">
              {USABLE_EVM_TOKENS.map((t) => {
                const active = symbol === t.symbol;
                return (
                  <button
                    key={t.symbol}
                    onClick={() => setSymbol(t.symbol)}
                    className="bv-press flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
                    style={{
                      background: active ? "var(--brand-soft)" : "var(--surface-2)",
                      border: `1px solid ${active ? "rgba(216,180,94,0.4)" : "var(--border)"}`,
                      borderRadius: "var(--r-pill)",
                      color: active ? "var(--brand)" : "var(--text-dim)",
                    }}
                  >
                    {coinIcon(t.symbol, 18)} {t.symbol}
                  </button>
                );
              })}
            </div>

            {/* amount + note */}
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Amount (optional)"
              className="bv-input mt-3 px-3 py-2.5 text-sm"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={60}
              className="bv-input mt-2 px-3 py-2.5 text-sm"
            />

            {/* QR + link */}
            {link ? (
              <>
                <div className="mx-auto mt-5 rounded-2xl bg-white p-3">
                  <QRCodeSVG value={link} size={188} level="M" />
                </div>
                <button
                  onClick={copy}
                  className="bv-press mt-4 w-full truncate rounded-lg px-3 py-3 text-center font-mono text-xs"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  title={link}
                >
                  {link.replace(/^https?:\/\//, "")}
                </button>
                <NameTag variant="private" />
                <button
                  onClick={copy}
                  className="bv-press mt-3 h-12 w-full text-sm font-semibold"
                  style={{ background: "var(--brand-gradient)", color: "var(--cta-text)", borderRadius: "var(--r-pill)" }}
                >
                  Copy payment link
                </button>
              </>
            ) : (
              <p className="mt-5 text-center text-sm leading-6" style={{ color: "var(--text-dim)" }}>
                Enable your <span style={{ color: "var(--brand)" }}>private balance</span> in the Vault
                first — then you can request payments privately.
              </p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

"use client";

// "Add token" sheet. Paste a contract address; we read the token's identity
// straight off the chain and show it back. Nothing is auto-suggested — on this
// chain a symbol alone means nothing, so the address the user pastes is the
// only thing we trust, and we say plainly that we haven't vetted it.

import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import {
  addCustomToken,
  fetchTokenMeta,
  type CustomToken,
} from "@/lib/chain/evm/custom-tokens";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { RhChainIcon } from "@/ui/icons";
import { Button } from "@/ui/primitives";

const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};

const LOOKS_LIKE_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
        {label}
      </span>
      <span
        className="text-sm font-semibold"
        style={{ overflowWrap: "anywhere", textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

export function EvmAddToken({
  open,
  owner,
  onClose,
  onAdded,
}: {
  open: boolean;
  owner: string | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [input, setInput] = useState("");
  const [meta, setMeta] = useState<CustomToken | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(value: string) {
    setInput(value);
    setMeta(null);
    setErr(null);
    // Showing the spinner here rather than in the effect keeps the typing
    // feedback immediate and the effect free of synchronous setState.
    setBusy(LOOKS_LIKE_ADDRESS.test(value.trim()));
  }

  function close() {
    edit("");
    setBusy(false);
    onClose();
  }

  // Look the token up once the field holds a plausible address. Debounced so a
  // paste doesn't fire a read per keystroke, and guarded by `live` so a slow
  // lookup for an old address can't land on top of a newer result.
  useEffect(() => {
    const value = input.trim();
    if (!LOOKS_LIKE_ADDRESS.test(value)) return;

    let live = true;
    const t = setTimeout(() => {
      fetchTokenMeta(value)
        .then((m) => live && setMeta(m))
        .catch((e: Error) => live && setErr(e.message))
        .finally(() => live && setBusy(false));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [input]);

  function add() {
    if (!meta || !owner) return;
    try {
      addCustomToken(owner, meta);
      onAdded();
      close();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && close()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background:
              "radial-gradient(120% 70% at 50% 0%, rgba(216,180,94,0.30), rgba(216,180,94,0.06) 45%, transparent 70%), var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div className="flex flex-col items-center p-5 pb-7">
            <div
              className="mb-4 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />

            <div className="flex w-full items-center justify-between gap-3">
              <Drawer.Title className="text-base font-semibold">
                Add Custom Token
              </Drawer.Title>
              {/* Which network the address will be read on — worth stating on a
                  screen where pasting a mainnet address on testnet just fails. */}
              <span
                className="flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-pill)",
                  color: "var(--text-dim)",
                }}
              >
                <RhChainIcon size={14} />
                {ACTIVE_EVM_CHAIN.name}
              </span>
            </div>
            <p className="mt-1 self-start text-xs leading-5" style={{ color: "var(--text-dim)" }}>
              Paste the token&apos;s contract address. We&apos;ll read its details from the chain.
            </p>

            <div className="mt-4 w-full" style={{ ...glass, borderRadius: "var(--r-card)" }}>
              <input
                value={input}
                onChange={(e) => edit(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent px-4 py-3.5 font-mono text-sm outline-none"
              />
            </div>

            {busy && (
              <p className="mt-3 self-start text-xs" style={{ color: "var(--text-faint)" }}>
                Reading contract…
              </p>
            )}

            {err && !busy && (
              <p className="mt-3 self-start text-xs font-medium" style={{ color: "var(--negative)" }}>
                {err}
              </p>
            )}

            {meta && !busy && (
              <>
                <div
                  className="mt-4 flex w-full flex-col gap-2.5 p-4"
                  style={{ ...glass, borderRadius: "var(--r-card)" }}
                >
                  <Row label="Name" value={meta.name ?? "—"} />
                  <Row label="Ticker" value={meta.symbol} />
                  <Row label="Decimals" value={String(meta.decimals)} />
                </div>

                {/* Anyone can deploy a token that copies a real one's name and
                    symbol; several already have on this chain. Say so. */}
                <div
                  className="mt-3 flex w-full items-start gap-2.5 px-4 py-3 text-xs leading-5"
                  style={{
                    background: "rgba(250,190,80,0.08)",
                    border: "1px solid rgba(250,190,80,0.35)",
                    borderRadius: "var(--r-card)",
                    color: "#fabe50",
                  }}
                >
                  <span className="text-sm">⚠</span>
                  <span>
                    <strong>Not verified.</strong> Anyone can create a token using a
                    well-known name and ticker. Only add this if you trust the address.
                  </span>
                </div>
              </>
            )}

            <Button onClick={add} disabled={!meta || busy || !owner} className="mt-4 h-12 w-full">
              Add custom token
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

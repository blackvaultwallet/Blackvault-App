"use client";

// Small asset dropdown (coin icon + ticker + chevron). The menu renders in a
// portal so surrounding glass cards (backdrop-filter stacking contexts) can't
// cover it.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SolanaIcon, UsdtIcon, UsdcIcon } from "@/ui/icons";

export const RAIL_ASSETS = ["SOL", "USDT", "USDC"] as const;
export type RailSymbol = (typeof RAIL_ASSETS)[number];

export function assetIcon(sym: string, size = 16) {
  if (sym === "SOL") return <SolanaIcon size={size} />;
  if (sym === "USDT") return <UsdtIcon size={size + 8} />;
  return <UsdcIcon size={size + 8} />;
}

function iconWrap(sym: string) {
  return (
    <span
      className="flex h-6 w-6 items-center justify-center"
      style={{
        background: sym === "SOL" ? "#141414" : "transparent",
        borderRadius: "var(--r-pill)",
      }}
    >
      {assetIcon(sym)}
    </span>
  );
}

export function AssetSelect({
  value,
  onChange,
}: {
  value: RailSymbol;
  onChange: (s: RailSymbol) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((o) => !o);
  }

  const W = 132;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="bv-press flex items-center gap-2 py-1.5 pl-2 pr-3 text-sm font-medium"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-pill)",
        }}
      >
        {iconWrap(value)}
        {value}
        <span style={{ color: "var(--text-dim)" }}>▾</span>
      </button>

      {mounted &&
        open &&
        rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
            <div
              className="bv-enter fixed z-[999] p-1"
              style={{
                top: rect.bottom + 6,
                left: Math.max(rect.right - W, 8),
                width: W,
                background: "var(--surface-solid)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-card)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              }}
            >
              {RAIL_ASSETS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className="bv-press flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm"
                  style={{ color: s === value ? "var(--brand)" : "var(--text)" }}
                >
                  {iconWrap(s)}
                  {s}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

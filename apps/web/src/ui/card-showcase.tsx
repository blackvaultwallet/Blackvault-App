"use client";

// Card showcase (Card action). Full-screen, black to match the card art: the
// BlackVault Visa sits centered with an idle float + interactive 3D tilt that
// follows the pointer, a moving gold shine, and a "Coming soon" tag below.
// Drop the artwork at /public/cards/blackvault-visa.png.

import Image from "next/image";
import { useRef, useState } from "react";

export function CardShowcase({ open, onClose }: { open: boolean; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0, active: false });

  function onMove(e: React.PointerEvent) {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5..0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    setT({ rx: -py * 16, ry: px * 22, active: true });
  }
  function reset() {
    setT({ rx: 0, ry: 0, active: false });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#050505" }}>
      <div className="px-5 py-5">
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
          }}
        >
          ←
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6" style={{ marginTop: -32 }}>
        <div
          ref={boxRef}
          onPointerMove={onMove}
          onPointerLeave={reset}
          onPointerCancel={reset}
          className="relative"
          style={{ perspective: 1100 }}
        >
          {/* idle float wrapper */}
          <div className={t.active ? "" : "bv-float"}>
            {/* interactive tilt */}
            <div
              className="relative"
              style={{
                transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`,
                transformStyle: "preserve-3d",
                transition: t.active ? "transform 90ms linear" : "transform 520ms var(--ease-out)",
              }}
            >
              <Image
                src="/cards/blackvault-visa.png"
                alt="BlackVault Visa Infinite"
                width={1540}
                height={1027}
                priority
                draggable={false}
                className="h-auto w-[min(88vw,430px)] select-none"
                style={{ display: "block" }}
              />
            </div>
          </div>
        </div>

        <p className="mt-12 text-lg font-semibold tracking-wide">BlackVault Visa Infinite</p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
          Spend your private balance in the real world.
        </p>
        <span
          className="mt-4 rounded-full px-3 py-1 text-[11px] font-medium"
          style={{ background: "var(--brand-soft)", border: "1px solid rgba(216,180,94,0.3)", color: "var(--brand)" }}
        >
          Coming soon
        </span>
      </div>
    </div>
  );
}

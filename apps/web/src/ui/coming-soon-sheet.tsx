"use client";

// Compact "under development" bottom-sheet card. Reused for actions that aren't
// built yet (NFC, Payment, Scan) — a small animated placeholder that slides up.

import { Drawer } from "vaul";

const K = `
@keyframes css-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes css-glow { 0%,100% { opacity:.35; } 50% { opacity:.7; } }
@keyframes css-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
`;

function Sparkle({ size = 52 }: { size?: number }) {
  const star = (cx: number, cy: number, r: number) =>
    `M${cx} ${cy - r}C${cx} ${cy - r * 0.28} ${cx + r * 0.28} ${cy} ${cx + r} ${cy}` +
    `C${cx + r * 0.28} ${cy} ${cx} ${cy + r * 0.28} ${cx} ${cy + r}` +
    `C${cx} ${cy + r * 0.28} ${cx - r * 0.28} ${cy} ${cx - r} ${cy}` +
    `C${cx - r * 0.28} ${cy} ${cx} ${cy - r * 0.28} ${cx} ${cy - r}Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="css-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8cd85" />
          <stop offset="0.55" stopColor="#c9a24b" />
          <stop offset="1" stopColor="#8f6f2e" />
        </linearGradient>
      </defs>
      <path d={star(12.5, 15.5, 11)} fill="url(#css-gold)" />
      <path d={star(24.5, 8.5, 5)} fill="url(#css-gold)" />
      <path d={star(21.5, 22, 3)} fill="url(#css-gold)" />
    </svg>
  );
}

export function ComingSoonSheet({
  open,
  title,
  subtitle,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background:
              "radial-gradient(120% 70% at 50% 0%, rgba(216,180,94,0.28), rgba(216,180,94,0.05) 45%, transparent 70%), var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <style>{K}</style>
          <div className="flex flex-col items-center p-6 pb-9 text-center">
            <div
              className="mb-6 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />

            <div className="relative flex h-20 w-20 items-center justify-center">
              <span
                className="absolute h-14 w-14 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(216,180,94,0.35), transparent 70%)", animation: "css-glow 2.6s var(--ease-in-out) infinite" }}
              />
              <div style={{ animation: "css-float 4s var(--ease-in-out) infinite" }}>
                <Sparkle />
              </div>
            </div>

            <h3 className="mt-4 text-lg font-bold">{title}</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
              {subtitle} is <span style={{ color: "var(--brand)" }}>under development</span>.
            </p>

            <div
              className="mt-5 h-1.5 w-40 overflow-hidden rounded-full"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <div
                className="h-full w-1/3 rounded-full"
                style={{ background: "var(--brand-gradient)", animation: "css-slide 1.9s var(--ease-in-out) infinite" }}
              />
            </div>

            <span
              className="mt-5 rounded-full px-3 py-1 text-[11px] font-medium"
              style={{ background: "var(--brand-soft)", border: "1px solid rgba(216,180,94,0.3)", color: "var(--brand)" }}
            >
              Coming soon
            </span>

            <button onClick={onClose} className="bv-press bv-btn-ghost mt-6 h-11 w-full text-sm">
              Got it
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

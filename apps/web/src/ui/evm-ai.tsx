"use client";

// AI tab: Vault Keeper intro. The policy-bound agent (session keys / ERC-7715)
// is deferred, so this describes what it will do and marks it coming soon.

import { Card, Badge } from "@/ui/primitives";

function Sparkle({ size = 26 }: { size?: number }) {
  const star = (cx: number, cy: number, r: number) =>
    `M${cx} ${cy - r}C${cx} ${cy - r * 0.28} ${cx + r * 0.28} ${cy} ${cx + r} ${cy}` +
    `C${cx + r * 0.28} ${cy} ${cx} ${cy + r * 0.28} ${cx} ${cy + r}` +
    `C${cx} ${cy + r * 0.28} ${cx - r * 0.28} ${cy} ${cx - r} ${cy}` +
    `C${cx - r * 0.28} ${cy} ${cx} ${cy - r * 0.28} ${cx} ${cy - r}Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d={star(12.5, 15.5, 11)} fill="currentColor" />
      <path d={star(24.5, 8.5, 5)} fill="currentColor" />
      <path d={star(21.5, 22, 3)} fill="currentColor" />
    </svg>
  );
}

const CAPABILITIES = [
  ["Auto-shield", "Sweep incoming funds into private balance on a schedule you set."],
  ["Policy-bound", "Acts only within limits you grant — amount caps, allowlists, expiry."],
  ["Session keys", "Delegated via ERC-7715 / 7702, revocable any time. Never holds your main key."],
];

export function EvmAi() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Vault Keeper</h1>

      <Card>
        <div className="flex items-start justify-between">
          <span
            className="flex h-11 w-11 items-center justify-center"
            style={{
              background: "var(--brand-soft)",
              border: "1px solid var(--brand-soft)",
              borderRadius: "var(--r-pill)",
              color: "var(--brand)",
            }}
          >
            <Sparkle />
          </span>
          <Badge>coming soon</Badge>
        </div>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-dim)" }}>
          An AI agent that manages your privacy for you — moving funds into your
          private balance and acting on your behalf, but only within permissions
          you explicitly grant and can revoke at any time.
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        {CAPABILITIES.map(([title, desc]) => (
          <Card key={title}>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-dim)" }}>
              {desc}
            </p>
          </Card>
        ))}
      </div>

      <p className="text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
        Deferred until stealth + gasless land on mainnet.
      </p>
    </div>
  );
}

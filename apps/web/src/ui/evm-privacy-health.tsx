"use client";

// Privacy Health for the EVM app. Scores how privately the wallet is being used
// (stealth enabled + whether private transfers have gone both ways) and shows an
// animated ring with actionable tips. Inputs are read locally — no RPC.

import { useEffect, useState } from "react";
import { type WalletClient } from "viem";
import { getEvmRail } from "@/lib/chain/evm/rail-evm";
import { readPrivateLog } from "@/lib/chain/evm/private-log";
import { Card, SectionLabel } from "@/ui/primitives";

type Health = { score: number; level: "high" | "medium" | "low"; tips: string[] };

export function EvmPrivacyHealth({
  wallet,
  address,
}: {
  wallet: WalletClient | null;
  address: string | null;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!address) return;
    let stealthOn = false;
    try {
      if (wallet) stealthOn = !!getEvmRail(wallet, address).metaAddressUri;
    } catch {
      /* rail not ready */
    }
    const log = readPrivateLog(address);
    const sent = log.some((e) => e.kind === "send");
    const received = log.some((e) => e.kind === "claim");

    const score = Math.min(100, 30 + (stealthOn ? 30 : 0) + (sent ? 20 : 0) + (received ? 20 : 0));
    const level: Health["level"] = score >= 80 ? "high" : score >= 50 ? "medium" : "low";

    const tips: string[] = [];
    if (!stealthOn) tips.push("Enable your private balance to shield who you transact with.");
    else if (!sent) tips.push("Send a private transfer to unlink yourself from recipients.");
    if (!received) tips.push("Receive a stealth payment to complete a private round-trip.");
    if (!tips.length) tips.push("Strong — you're transacting privately both ways.");

    // deferred so this doesn't count as a synchronous set-state in render
    queueMicrotask(() => setHealth({ score, level, tips }));
  }, [wallet, address]);

  // count the score up on change
  useEffect(() => {
    if (!health) return;
    const target = health.score;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / 1000, 1);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [health]);

  if (!health) return null;

  const [c1, c2] =
    health.level === "high"
      ? ["#34d399", "#8ff0b5"]
      : health.level === "low"
        ? ["#ef7370", "#f6a1a0"]
        : ["#e8cd85", "#c9a24b"];
  const accent =
    health.level === "high" ? "var(--positive)" : health.level === "low" ? "var(--negative)" : "var(--brand)";
  const r = 34;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - health.score / 100);
  const K = `
    @keyframes evph-draw { from { stroke-dashoffset: ${circ.toFixed(1)}; } to { stroke-dashoffset: ${off.toFixed(1)}; } }
    @keyframes evph-glow { 0%,100% { opacity:.35; } 50% { opacity:.7; } }
  `;

  return (
    <Card>
      <style>{K}</style>
      <div className="flex items-center gap-2">
        <SectionLabel>Privacy Health</SectionLabel>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
          style={{ background: `${c1}22`, border: `1px solid ${c1}55`, color: accent }}
        >
          {health.level}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <span
            className="absolute h-16 w-16 rounded-full"
            style={{ background: `radial-gradient(circle, ${c1}40, transparent 70%)`, animation: "evph-glow 2.6s var(--ease-in-out) infinite" }}
          />
          <svg width="96" height="96" viewBox="0 0 96 96">
            <defs>
              <linearGradient id="evph-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={c1} />
                <stop offset="1" stopColor={c2} />
              </linearGradient>
              <filter id="evph-blur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
            </defs>
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
            <circle
              cx="48"
              cy="48"
              r={r}
              fill="none"
              stroke="url(#evph-grad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={circ}
              transform="rotate(-90 48 48)"
              filter="url(#evph-blur)"
              style={{ opacity: 0.7, animation: "evph-draw 1.1s var(--ease-out) both" }}
            />
            <circle
              cx="48"
              cy="48"
              r={r}
              fill="none"
              stroke="url(#evph-grad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={circ}
              transform="rotate(-90 48 48)"
              style={{ animation: "evph-draw 1.1s var(--ease-out) both" }}
            />
          </svg>
          <div className="absolute flex items-center justify-center">
            <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: accent }}>
              {shown}
            </span>
          </div>
        </div>
        <ul className="flex-1 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-dim)" }}>
          {health.tips.slice(0, 2).map((tip) => (
            <li key={tip} className="flex gap-1.5">
              <span style={{ color: "var(--brand)" }}>•</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

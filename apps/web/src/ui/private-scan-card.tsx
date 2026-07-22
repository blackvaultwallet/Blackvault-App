"use client";

// EVM private "hero": since a claimed stealth note lands back in the public
// wallet, there's no standalone private balance worth showing. Instead this is
// an interaction card — left: title + gold "Check incoming"; right: a futuristic
// radar that morphs into a live scan terminal while claiming.

import { useEffect, useRef, useState } from "react";

const K = `
@keyframes psc-blink { 0%,55% { opacity: 1; } 56%,100% { opacity: 0; } }
@keyframes psc-scanline { 0% { top: 6%; } 100% { top: 92%; } }
@keyframes psc-pulse { 0%,100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.12); opacity: 1; } }
@keyframes psc-travel {
  0% { left: 15%; opacity: 0; }
  14% { opacity: 1; }
  46% { left: 46%; opacity: 1; }
  52% { opacity: .1; }
  60% { opacity: 1; }
  86% { opacity: 1; }
  100% { left: 79%; opacity: 0; }
}
`;

const PANEL: React.CSSProperties = {
  background:
    "linear-gradient(150deg, rgba(216,180,94,0.10), rgba(255,255,255,0.015) 45%, transparent 80%), var(--surface-2)",
  border: "1px solid rgba(216,180,94,0.22)",
  borderRadius: "var(--r-card)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

const goldBtn: React.CSSProperties = {
  background: "var(--brand-gradient)",
  color: "var(--cta-text)",
  borderRadius: "var(--r-pill)",
  boxShadow: "0 6px 18px rgba(216,180,94,0.25)",
};

function lineColor(l: string): string {
  if (l.startsWith("!") || l.startsWith("✗")) return "#f87171";
  if (l.startsWith("✓")) return "#86efac";
  if (l.startsWith("$")) return "#7dd3fc";
  if (l.startsWith(">")) return "#a7f3d0";
  return "var(--text-dim)";
}

const WalletGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="var(--brand)" strokeWidth="1.7" />
    <path d="M3 10h18" stroke="var(--brand)" strokeWidth="1.7" />
    <circle cx="16.5" cy="14" r="1.3" fill="var(--brand)" />
  </svg>
);

const ShieldGlyph = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 3l7 3v5c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z"
      stroke="var(--brand)"
      strokeWidth="1.7"
      strokeLinejoin="round"
      fill="rgba(216,180,94,0.16)"
    />
    <path d="M9.5 12l1.8 1.8 3.3-3.6" stroke="var(--brand)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const nodeStyle: React.CSSProperties = {
  background: "var(--surface-solid)",
  border: "1px solid rgba(216,180,94,0.3)",
  borderRadius: 8,
};

/* private transfer flow (idle): a coin travels wallet → shield → wallet,
   vanishing into the shield (goes private) as it crosses. */
function PrivateFlow() {
  return (
    <div
      className="relative flex h-full min-h-[96px] items-center justify-center overflow-hidden rounded-xl"
      style={{
        background: "radial-gradient(circle at center, rgba(216,180,94,0.08), transparent 72%), #0d0e12",
        border: "1px solid var(--border-strong)",
      }}
    >
      {/* dashed path */}
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute left-0 top-1/2 h-6 w-full -translate-y-1/2" aria-hidden>
        <line x1="15" y1="20" x2="85" y2="20" stroke="var(--brand)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4" className="bv-dash" />
      </svg>

      {/* wallets */}
      <span className="absolute left-[8%] flex h-6 w-6 items-center justify-center" style={nodeStyle}>
        {WalletGlyph}
      </span>
      <span className="absolute right-[8%] flex h-6 w-6 items-center justify-center" style={nodeStyle}>
        {WalletGlyph}
      </span>

      {/* traveling coin (rendered under the shield so it vanishes into it) */}
      <span
        className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
        style={{
          background: "var(--brand-gradient)",
          boxShadow: "0 0 8px rgba(216,180,94,0.6)",
          animation: "psc-travel 2.6s ease-in-out infinite",
        }}
      />

      {/* center shield */}
      <span
        className="relative flex h-8 w-8 items-center justify-center rounded-full"
        style={{
          background: "rgba(216,180,94,0.12)",
          border: "1px solid rgba(216,180,94,0.4)",
          animation: "psc-pulse 2.6s ease-in-out infinite",
        }}
      >
        {ShieldGlyph}
      </span>

      <span className="absolute bottom-1 right-2 font-mono text-[8px]" style={{ color: "var(--text-faint)" }}>
        private
      </span>
    </div>
  );
}

/* live scan terminal (typing) */
function ScanTerminal({ lines }: { lines: string[] }) {
  const [shown, setShown] = useState(0);
  const [partial, setPartial] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Type out the line at `shown`. Keyed on the line's content (not the array
  // ref) so appending later lines doesn't restart the one currently typing.
  const full = shown < lines.length ? lines[shown] : "";
  useEffect(() => {
    if (!full) return;
    let i = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPartial("");
    const id = setInterval(() => {
      i = Math.min(i + 1, full.length);
      setPartial(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        setShown((c) => c + 1);
      }
    }, 14);
    return () => clearInterval(id);
  }, [shown, full]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, partial]);

  const typing = shown < lines.length;
  return (
    <div
      ref={ref}
      className="relative h-full min-h-[96px] overflow-y-auto rounded-xl px-2.5 py-2 font-mono text-[10px] leading-[15px]"
      style={{ background: "#0a0b0e", border: "1px solid var(--border-strong)" }}
    >
      {/* scanline sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 h-px w-full"
        style={{ background: "rgba(216,180,94,0.35)", animation: "psc-scanline 1.6s linear infinite" }}
      />
      {lines.slice(0, shown).map((l, i) => (
        <div key={i} className="whitespace-pre-wrap break-words" style={{ color: lineColor(l) }}>
          {l}
        </div>
      ))}
      {typing && (
        <div className="whitespace-pre-wrap break-words" style={{ color: lineColor(lines[shown]) }}>
          {partial}
          <span style={{ animation: "psc-blink 1s step-end infinite" }}>▍</span>
        </div>
      )}
      {!typing && <span style={{ color: "var(--positive)", animation: "psc-blink 1s step-end infinite" }}>▍</span>}
    </div>
  );
}

export function PrivateScanCard({
  onRun,
}: {
  onRun: (log: (line: string) => void) => Promise<{ claimed: number; found: number }>;
}) {
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [lines, setLines] = useState<string[]>([]);

  async function go() {
    if (phase === "scanning") return;
    setPhase("scanning");
    setLines([]);
    const push = (l: string) => setLines((p) => [...p, l]);
    const log = (l: string) => push(/^[$>!✓✗]/.test(l) ? l : `> ${l}`);
    push("$ vault scan --incoming");
    try {
      const { claimed, found } = await onRun(log);
      push(found ? `✓ claimed ${claimed}/${found}` : "> no incoming notes");
    } catch (e) {
      push(`! ${(e as Error).message}`);
    } finally {
      setPhase("done");
    }
  }

  return (
    <div className="relative overflow-hidden p-4" style={PANEL}>
      <style>{K}</style>
      <div className="flex items-stretch gap-3">
        <div className="flex flex-1 flex-col justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Check Private balance</p>
            <p className="mt-0.5 text-[11px] leading-4" style={{ color: "var(--text-faint)" }}>
              Scan the chain for incoming stealth payments and claim them.
            </p>
          </div>
          <button
            onClick={go}
            disabled={phase === "scanning"}
            className="bv-press h-10 w-full text-sm font-semibold disabled:opacity-70"
            style={goldBtn}
          >
            {phase === "scanning" ? "Scanning…" : "Check incoming"}
          </button>
        </div>

        <div className="w-[44%] shrink-0">
          {phase === "idle" ? <PrivateFlow /> : <ScanTerminal lines={lines} />}
        </div>
      </div>
    </div>
  );
}

"use client";

// "Under development" placeholder for the AI tab. A floating gold sparkle with
// pulsing rings + an orbiting spark, an animated ellipsis, and a shimmering
// progress bar. Purely presentational.

const KEYFRAMES = `
@keyframes cs-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
@keyframes cs-dot { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
`;

function Sparkle({ size = 64 }: { size?: number }) {
  const star = (cx: number, cy: number, r: number) =>
    `M${cx} ${cy - r}C${cx} ${cy - r * 0.28} ${cx + r * 0.28} ${cy} ${cx + r} ${cy}` +
    `C${cx + r * 0.28} ${cy} ${cx} ${cy + r * 0.28} ${cx} ${cy + r}` +
    `C${cx} ${cy + r * 0.28} ${cx - r * 0.28} ${cy} ${cx - r} ${cy}` +
    `C${cx - r * 0.28} ${cy} ${cx} ${cy - r * 0.28} ${cx} ${cy - r}Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="cs-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8cd85" />
          <stop offset="0.55" stopColor="#c9a24b" />
          <stop offset="1" stopColor="#8f6f2e" />
        </linearGradient>
      </defs>
      <path d={star(12.5, 15.5, 11)} fill="url(#cs-gold)" />
      <path d={star(24.5, 8.5, 5)} fill="url(#cs-gold)" />
      <path d={star(21.5, 22, 3)} fill="url(#cs-gold)" />
    </svg>
  );
}

export function ComingSoon({
  title = "Vault Keeper",
  subtitle = "Your AI copilot",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <style>{KEYFRAMES}</style>
      <div aria-hidden className="bv-smoke pointer-events-none absolute inset-0" />

      <div className="relative flex h-44 w-44 items-center justify-center">
        {/* pulsing rings */}
        <span
          className="absolute inset-0 rounded-full"
          style={{ border: "1px solid var(--brand-soft)", animation: "bv-pulse 2.6s var(--ease-in-out) infinite" }}
        />
        <span
          className="absolute inset-8 rounded-full"
          style={{ border: "1px solid rgba(216,180,94,0.25)", animation: "bv-pulse 2.6s var(--ease-in-out) 0.4s infinite" }}
        />
        {/* orbiting spark */}
        <span
          className="absolute h-2 w-2 rounded-full"
          style={{ background: "var(--brand)", boxShadow: "0 0 10px var(--brand)", ["--orbit-r" as string]: "78px", animation: "bv-orbit 7s linear infinite" }}
        />
        {/* sparkle */}
        <div className="bv-float">
          <Sparkle />
        </div>
      </div>

      <h1 className="relative mt-8 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="relative mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
        {subtitle} is <span style={{ color: "var(--brand)" }}>under development</span>
        <span style={{ animation: "cs-dot 1.4s infinite", animationDelay: "0s" }}>.</span>
        <span style={{ animation: "cs-dot 1.4s infinite", animationDelay: "0.2s" }}>.</span>
        <span style={{ animation: "cs-dot 1.4s infinite", animationDelay: "0.4s" }}>.</span>
      </p>

      {/* shimmering progress */}
      <div
        className="relative mt-7 h-1.5 w-48 overflow-hidden rounded-full"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div
          className="h-full w-1/3 rounded-full"
          style={{ background: "var(--brand-gradient)", animation: "cs-slide 1.9s var(--ease-in-out) infinite" }}
        />
      </div>

      <span
        className="relative mt-5 rounded-full px-3 py-1 text-[11px] font-medium"
        style={{ background: "var(--brand-soft)", border: "1px solid rgba(216,180,94,0.3)", color: "var(--brand)" }}
      >
        Coming soon
      </span>
    </div>
  );
}

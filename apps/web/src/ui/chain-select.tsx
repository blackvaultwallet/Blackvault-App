"use client";

// Network selector chips for send/receive sheets. Robinhood Chain is the only
// live network; the other EVM chains are shown as a roadmap tease ("Soon") and
// stay unselectable, so RH is always the effective choice.

const CHAINS: { label: string; dot: string; live?: boolean }[] = [
  { label: "RH Chain", dot: "#d8b45e", live: true },
  { label: "Ethereum", dot: "#8a92b2" },
  { label: "Arbitrum", dot: "#2d374b" },
  { label: "Base", dot: "#0052ff" },
  { label: "Optimism", dot: "#ff0420" },
];

export function ChainSelect() {
  return (
    <div className="flex w-full gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
      {CHAINS.map((c) => (
        <button
          key={c.label}
          disabled={!c.live}
          className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium"
          style={
            c.live
              ? {
                  background: "rgba(216,180,94,0.14)",
                  border: "1px solid rgba(216,180,94,0.35)",
                  borderRadius: "var(--r-pill)",
                  color: "var(--brand)",
                }
              : {
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-pill)",
                  color: "var(--text-faint)",
                }
          }
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot, opacity: c.live ? 1 : 0.5 }} />
          {c.label}
          {!c.live && (
            <span className="text-[9px] uppercase tracking-wide" style={{ opacity: 0.7 }}>
              Soon
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

"use client";

// Full-screen transfer flow (reference: Confirm Swap → processing → success).
// Shared by public and private sends. Three stages:
//   confirm    — from / to / network / estimated fee, slide-to-confirm
//   processing — a waiting clock + a live terminal that logs the send steps
//   success    — checkmark, what was sent, timestamp + detail, View in Wallet
// The caller passes onConfirm(log): it performs the real send and streams
// progress lines into the terminal. Resolve → success, throw → error.

import { useEffect, useRef, useState } from "react";
import { SlideToStart } from "@/ui/slide-to-start";

export type TransferSummary = {
  mode: "public" | "private";
  symbol: string;
  icon: React.ReactNode;
  amount: string; // "0.5"
  usd?: number;
  fromLabel: string; // "Your Vault" or short address
  toLabel: string; // recipient name or short address
  network: string; // "Solana · devnet"
  fee: string; // "~0.000005 SOL"
};

type Stage = "confirm" | "processing" | "success" | "error";

const KEYFRAMES = `
@keyframes tf-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes tf-spin { to { transform: rotate(360deg); } }
@keyframes tf-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
@keyframes tf-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
`;

function usd(n?: number) {
  return n == null ? "" : `≈ $${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* waiting clock: pulsing ring + a hand sweeping around */
function ClockWait() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <span
        className="absolute inset-0 rounded-full"
        style={{ border: "2px solid var(--brand-soft)", animation: "bv-pulse 1.8s ease-in-out infinite" }}
      />
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden>
        <circle cx="32" cy="32" r="26" stroke="var(--border-strong)" strokeWidth="3" />
        <g style={{ transformOrigin: "32px 32px", animation: "tf-spin 1.4s linear infinite" }}>
          <line x1="32" y1="32" x2="32" y2="14" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <line x1="32" y1="32" x2="44" y2="40" stroke="var(--text-dim)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="32" cy="32" r="3" fill="var(--brand)" />
      </svg>
    </div>
  );
}

/* success mark: circle + check that self-draw */
function CheckMark() {
  return (
    <div
      className="flex h-24 w-24 items-center justify-center rounded-full"
      style={{ background: "rgba(121,217,156,0.14)", animation: "tf-pop 420ms var(--ease-out) both" }}
    >
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden>
        <circle cx="44" cy="44" r="30" fill="var(--positive)" />
        <path
          d="M31 45 L40 54 L57 35"
          pathLength={1}
          className="bv-draw"
          stroke="#0b1a0f"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{ animationDelay: "160ms" }}
        />
      </svg>
    </div>
  );
}

/* code-style colour per log line prefix */
function lineColor(l: string): string {
  if (l.startsWith("!") || l.startsWith("✗")) return "#f87171";
  if (l.startsWith("✓")) return "#86efac";
  if (l.startsWith("$")) return "#7dd3fc";
  if (l.startsWith(">")) return "#a7f3d0";
  if (l.startsWith("#")) return "var(--text-faint)";
  return "var(--text-dim)";
}

/* Linux-style terminal: window chrome + a log that types itself out. */
function Terminal({ lines }: { lines: string[] }) {
  const [shown, setShown] = useState(0);
  const [partial, setPartial] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown >= lines.length) return;
    const full = lines[shown];
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
    }, 16);
    return () => clearInterval(id);
  }, [shown, lines]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, partial]);

  const typing = shown < lines.length;

  return (
    <div
      className="mt-1 w-full overflow-hidden"
      style={{
        background: "#0a0b0e",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-card)",
        boxShadow: "0 12px 34px rgba(0,0,0,0.55)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: "#15171c", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: "#ff5f56" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#ffbd2e" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#27c93f" }} />
        <span className="ml-2 font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
          vault@blackvault — transfer
        </span>
      </div>
      <div ref={bodyRef} className="h-52 overflow-y-auto px-4 py-3 font-mono text-xs leading-6">
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} className="whitespace-pre-wrap break-words" style={{ color: lineColor(l) }}>
            {l}
          </div>
        ))}
        {typing && (
          <div className="whitespace-pre-wrap break-words" style={{ color: lineColor(lines[shown]) }}>
            {partial}
            <span style={{ animation: "tf-blink 1s step-end infinite" }}>▍</span>
          </div>
        )}
        {!typing && (
          <span style={{ color: "var(--positive)", animation: "tf-blink 1s step-end infinite" }}>▍</span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm" style={{ color: "var(--text-dim)" }}>
        {label}
      </span>
      <div className="flex flex-col items-end">
        <span className="text-sm font-medium">{value}</span>
        {sub && (
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

export function TransferFlow({
  open,
  summary,
  onConfirm,
  onClose,
  onDone,
}: {
  open: boolean;
  summary: TransferSummary | null;
  onConfirm: (log: (line: string) => void) => Promise<{ signature?: string }>;
  onClose: () => void; // cancel from confirm
  onDone: () => void; // View in Wallet
}) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [lines, setLines] = useState<string[]>([]);
  const [sig, setSig] = useState<string | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Parent mounts this only while a transfer is live, so state starts fresh
  // every open — no reset effect needed.

  async function run() {
    setStage("processing");
    const push = (line: string) => setLines((p) => [...p, line]);
    // Rail stage strings arrive unprefixed — tag them as log steps so the
    // terminal colours them like the rest.
    const log = (line: string) =>
      push(/^[$>!✓✗#]/.test(line) ? line : `> ${line}`);

    push(`$ vault ${priv ? "send --private" : "send"} --amount ${summary?.amount} --asset ${summary?.symbol}`);
    log(`target ${summary?.toLabel}`);
    log(`network ${summary?.network}`);
    log("signing intent");
    try {
      const res = await onConfirm(log);
      log("awaiting confirmations");
      push("✓ transfer confirmed on-chain");
      setSig(res.signature);
      setDoneAt(Date.now());
      setStage("success");
    } catch (e) {
      push(`! ${(e as Error).message}`);
      push("✗ transfer aborted");
      setErr((e as Error).message);
      setStage("error");
    }
  }

  if (!open || !summary) return null;
  const priv = summary.mode === "private";

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 60, background: "var(--surface-solid)", pointerEvents: "auto" }}>
      <style>{KEYFRAMES}</style>
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ animation: "tf-up 340ms var(--ease-out)", backgroundImage: "var(--bg-sheen)", backgroundRepeat: "no-repeat" }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-5 sm:px-8">
          {stage === "confirm" ? (
            <button onClick={onClose} aria-label="Cancel" className="bv-press text-lg" style={{ color: "var(--text-dim)" }}>
              ←
            </button>
          ) : (
            <span className="w-5" />
          )}
          <span className="text-sm font-semibold">
            {stage === "success" ? "Transfer Complete" : stage === "error" ? "Transfer Failed" : `Confirm ${priv ? "Private " : ""}Transfer`}
          </span>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-medium"
            style={{
              background: priv ? "rgba(216,180,94,0.14)" : "var(--surface-2)",
              border: `1px solid ${priv ? "rgba(216,180,94,0.3)" : "var(--border)"}`,
              color: priv ? "var(--brand)" : "var(--text-dim)",
            }}
          >
            {priv ? "Private" : "Public"}
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5 pb-8 sm:px-8">
          {/* ---------- CONFIRM ---------- */}
          {stage === "confirm" && (
            <>
              <div className="flex flex-col items-center gap-3 pb-6 pt-8">
                <span className="flex h-16 w-16 items-center justify-center">{summary.icon}</span>
                <p className="font-mono text-3xl font-semibold tabular-nums">
                  {summary.amount} <span style={{ color: "var(--text-dim)" }}>{summary.symbol}</span>
                </p>
                {summary.usd != null && (
                  <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                    {usd(summary.usd)}
                  </p>
                )}
              </div>

              <div className="w-full p-1" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}>
                <div className="px-4">
                  <Row label="From" value={summary.fromLabel} />
                  <div style={{ borderTop: "1px solid var(--border)" }} />
                  <Row label="To" value={summary.toLabel} />
                  <div style={{ borderTop: "1px solid var(--border)" }} />
                  <Row label="Network" value={summary.network} />
                  <div style={{ borderTop: "1px solid var(--border)" }} />
                  <Row label="Estimated fee" value={summary.fee} />
                </div>
              </div>

              <p className="mt-4 text-center text-xs" style={{ color: "var(--text-faint)" }}>
                {priv ? "Recipient and amount stay hidden on-chain." : "This transfer is public on-chain."}
              </p>

              <div className="mt-auto pt-6">
                <SlideToStart key="confirm-slide" label="Slide to confirm" onComplete={run} />
              </div>
            </>
          )}

          {/* ---------- PROCESSING ---------- */}
          {stage === "processing" && (
            <div className="flex flex-1 flex-col items-center">
              <div className="flex flex-col items-center gap-4 pb-6 pt-10">
                <ClockWait />
                <p className="text-lg font-semibold">Processing transfer</p>
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                  Sending {summary.amount} {summary.symbol} · don&apos;t close the app
                </p>
              </div>
              <Terminal lines={lines} />
            </div>
          )}

          {/* ---------- SUCCESS ---------- */}
          {stage === "success" && (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-col items-center gap-3 pb-6 pt-8">
                <CheckMark />
                <p className="text-2xl font-bold">Transfer Successful</p>
                <p className="text-center text-sm" style={{ color: "var(--text-dim)" }}>
                  {summary.amount} {summary.symbol} sent to {summary.toLabel}
                </p>
              </div>

              <div className="w-full px-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}>
                <Row label="Amount" value={`${summary.amount} ${summary.symbol}`} sub={usd(summary.usd)} />
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <Row label="To" value={summary.toLabel} />
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <Row label="Network" value={summary.network} />
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <Row label="Fee" value={summary.fee} />
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <Row
                  label="Date"
                  value={doneAt ? new Date(doneAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                />
                {sig && (
                  <>
                    <div style={{ borderTop: "1px solid var(--border)" }} />
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(sig);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch {
                          /* clipboard unavailable */
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                    >
                      <span className="text-sm" style={{ color: "var(--text-dim)" }}>
                        {priv ? "Reference" : "Signature"}
                      </span>
                      <span className="font-mono text-sm" style={{ color: "var(--brand)" }}>
                        {copied ? "Copied ✓" : `${sig.slice(0, 6)}…${sig.slice(-6)}`}
                      </span>
                    </button>
                  </>
                )}
              </div>

              <div className="mt-auto pt-6">
                <button
                  onClick={onDone}
                  className="bv-press h-14 w-full text-base font-semibold"
                  style={{ background: "var(--text)", color: "var(--surface-solid)", borderRadius: "var(--r-pill)" }}
                >
                  View in Wallet
                </button>
              </div>
            </div>
          )}

          {/* ---------- ERROR ---------- */}
          {stage === "error" && (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-col items-center gap-3 pb-6 pt-10">
                <div className="flex h-24 w-24 items-center justify-center rounded-full" style={{ background: "rgba(239,115,112,0.14)" }}>
                  <span className="text-4xl" style={{ color: "var(--negative)" }}>
                    ✕
                  </span>
                </div>
                <p className="text-xl font-bold">Transfer failed</p>
                <p className="max-w-xs break-words text-center text-sm" style={{ color: "var(--text-dim)" }}>
                  {err}
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-3 pt-6">
                <button
                  onClick={() => setStage("confirm")}
                  className="bv-press h-12 w-full text-sm font-semibold"
                  style={{ background: "var(--brand-gradient)", color: "var(--cta-text)", borderRadius: "var(--r-pill)" }}
                >
                  Try again
                </button>
                <button onClick={onClose} className="bv-press bv-btn-ghost h-12 w-full text-sm">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

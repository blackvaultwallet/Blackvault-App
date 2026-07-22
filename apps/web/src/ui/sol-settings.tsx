"use client";

// Futuristic settings screen (Solana): morph-glass panels washed in gold, a
// ringed privacy score, then security / username / export / test funds. Keeps
// the original logic from the standalone cards, just a cohesive redesign.

import { useEffect, useState } from "react";
import { usePrivy, useMfaEnrollment } from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";
import {
  createConnection,
  getPortfolio,
  privacyHealthScore,
  type PrivacyHealth,
} from "@blackvault/sdk";
import { useVaultWallet } from "@/lib/wallet";
import { SNS_SUFFIX, isValidUsername, normalizeUsername } from "@/lib/sns";
import { findToken } from "@/lib/tokens";

/* ---------- shared shells ---------- */

const PANEL: React.CSSProperties = {
  background:
    "linear-gradient(157deg, rgba(216,180,94,0.10), rgba(255,255,255,0.015) 42%, transparent 78%), var(--surface-2)",
  border: "1px solid rgba(216,180,94,0.18)",
  borderRadius: "var(--r-card)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 30px rgba(0,0,0,0.4)",
};

function Panel({
  icon,
  title,
  meta,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden p-5" style={PANEL}>
      {/* corner gold bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(216,180,94,0.22), transparent 70%)" }}
      />
      <div className="relative flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center"
          style={{ background: "var(--brand-gradient)", color: "var(--cta-text)", borderRadius: 10 }}
        >
          {icon}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{title}</span>
          {meta && (
            <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-faint)" }}>
              {meta}
            </span>
          )}
        </div>
      </div>
      <div className="relative mt-4">{children}</div>
    </div>
  );
}

const goldBtn = "bv-press h-11 px-5 text-sm font-semibold";
const goldBtnStyle: React.CSSProperties = {
  background: "var(--brand-gradient)",
  color: "var(--cta-text)",
  borderRadius: "var(--r-pill)",
  boxShadow: "0 6px 18px rgba(216,180,94,0.25)",
};
const ghostBtn = "bv-press h-11 px-5 text-sm font-medium";
const ghostBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(216,180,94,0.22)",
  borderRadius: "var(--r-pill)",
  color: "var(--text)",
};

/* ---------- icons ---------- */

const iShield = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 3l7 3v5c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
const iLock = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
const iTag = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 4h7l9 9-7 7-9-9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
  </svg>
);
const iKey = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M11 11l8 8M16 16l2-2M18 18l2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const iDrop = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 3s6 6.5 6 10.5a6 6 0 1 1-12 0C6 9.5 12 3 12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

/* ---------- privacy health (ringed) ---------- */

function PrivacyPanel({
  vaultActive,
  privateBalanceSol,
}: {
  vaultActive?: boolean;
  privateBalanceSol?: number | null;
}) {
  const { isConnected, address } = useVaultWallet();
  const [health, setHealth] = useState<PrivacyHealth | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    let active = true;
    (async () => {
      let accountCount = 1;
      try {
        const p = await getPortfolio(createConnection(), [address]);
        accountCount = p.accountCount;
      } catch {
        /* single account fallback */
      }
      if (!active) return;
      setHealth(
        privacyHealthScore({
          accountCount,
          usesStealth: Boolean(vaultActive),
          usesConfidential: (privateBalanceSol ?? 0) > 0,
        })
      );
    })();
    return () => {
      active = false;
    };
  }, [isConnected, address, vaultActive, privateBalanceSol]);

  // Count the score up on load.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!health) return;
    const target = health.score;
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [health]);

  if (!isConnected || !address || !health) return null;

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
    @keyframes ring-draw { from { stroke-dashoffset: ${circ.toFixed(1)}; } to { stroke-dashoffset: ${off.toFixed(1)}; } }
    @keyframes ring-spin { to { transform: rotate(360deg); } }
    @keyframes ring-glow { 0%,100% { opacity:.35; } 50% { opacity:.7; } }
  `;

  return (
    <Panel icon={iShield} title="Privacy Health" meta="Score">
      <style>{K}</style>
      <div className="flex items-center gap-4">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          {/* soft glow behind */}
          <span
            className="absolute h-16 w-16 rounded-full"
            style={{
              background: `radial-gradient(circle, ${c1}40, transparent 70%)`,
              animation: "ring-glow 2.6s var(--ease-in-out) infinite",
            }}
          />
          <svg width="96" height="96" viewBox="0 0 96 96">
            <defs>
              <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={c1} />
                <stop offset="1" stopColor={c2} />
              </linearGradient>
              <filter id="ring-blur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
            </defs>
            {/* rotating HUD ticks */}
            <circle
              cx="48"
              cy="48"
              r="44"
              fill="none"
              stroke={c1}
              strokeOpacity="0.2"
              strokeWidth="1.5"
              strokeDasharray="1.5 7"
              style={{ transformBox: "fill-box", transformOrigin: "center", animation: "ring-spin 9s linear infinite" }}
            />
            {/* base track */}
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-solid)" strokeWidth="7" />
            {/* blurred glow arc */}
            <circle
              cx="48"
              cy="48"
              r={r}
              fill="none"
              stroke="url(#ring-grad)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circ}
              transform="rotate(-90 48 48)"
              filter="url(#ring-blur)"
              style={{ opacity: 0.75, animation: "ring-draw 1.1s var(--ease-out) both" }}
            />
            {/* main arc */}
            <circle
              cx="48"
              cy="48"
              r={r}
              fill="none"
              stroke="url(#ring-grad)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circ}
              transform="rotate(-90 48 48)"
              style={{ animation: "ring-draw 1.1s var(--ease-out) both" }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: accent }}>
              {shown}
            </span>
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
              /100 · {health.level}
            </span>
          </div>
        </div>
        {health.tips.length > 0 && (
          <ul className="flex-1 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-dim)" }}>
            {health.tips.slice(0, 2).map((tip) => (
              <li key={tip} className="flex gap-1.5">
                <span style={{ color: "var(--brand)" }}>•</span>
                {tip}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ---------- security ---------- */

function SecurityPanel() {
  const { isConnected } = useVaultWallet();
  const { user } = usePrivy();
  const { showMfaEnrollmentModal } = useMfaEnrollment();
  if (!isConnected) return null;

  const methods = user?.mfaMethods ?? [];
  const enrolled = methods.length > 0;
  return (
    <Panel icon={iLock} title="Security" meta="2FA">
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        {enrolled
          ? `2FA active: ${methods.join(", ")}. Wallet actions require a code.`
          : "Add a second factor (authenticator app or passkey) to protect wallet actions."}
      </p>
      <button
        onClick={showMfaEnrollmentModal}
        className={enrolled ? ghostBtn : goldBtn}
        style={{ ...(enrolled ? ghostBtnStyle : goldBtnStyle), marginTop: 14 }}
      >
        {enrolled ? "Manage 2FA" : "Enable 2FA"}
      </button>
    </Panel>
  );
}

/* ---------- username ---------- */

function UsernamePanel() {
  const { isConnected, address } = useVaultWallet();
  const [name, setName] = useState("");
  const [claimed, setClaimed] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!address) return;
    const key = `bv_username_${address}`;
    queueMicrotask(() => setClaimed(localStorage.getItem(key)));
  }, [address]);

  async function claim() {
    if (!address || busy) return;
    const clean = normalizeUsername(name);
    if (!isValidUsername(clean)) {
      setStatus("2-31 chars: lowercase letters, digits, hyphens.");
      return;
    }
    setBusy(true);
    setStatus("Claiming username…");
    try {
      const res = await fetch("/api/sns/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, owner: address }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Claim failed.");
        return;
      }
      localStorage.setItem(`bv_username_${address}`, data.name);
      setClaimed(data.name);
      setStatus(null);
    } catch {
      setStatus("Claim failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected || !address) return null;

  return (
    <Panel icon={iTag} title="Username" meta="devnet">
      {claimed ? (
        <p className="font-mono text-lg" style={{ color: "var(--brand)" }}>
          {claimed}
        </p>
      ) : (
        <>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Claim a name others can send to instead of your address.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="yourname"
              disabled={busy}
              className="min-w-0 flex-1 bv-input px-3 py-2.5 text-sm"
            />
            <span className="text-sm" style={{ color: "var(--text-faint)" }}>
              {SNS_SUFFIX}
            </span>
            <button onClick={claim} disabled={busy} className={goldBtn} style={{ ...goldBtnStyle, height: 42 }}>
              {busy ? "…" : "Claim"}
            </button>
          </div>
        </>
      )}
      {status && (
        <p className="mt-3 break-words text-sm leading-6" style={{ color: "var(--text)" }}>
          {status}
        </p>
      )}
    </Panel>
  );
}

/* ---------- export ---------- */

function ExportPanel() {
  const { isConnected, address } = useVaultWallet();
  const { exportWallet } = useExportWallet();
  if (!isConnected || !address) return null;
  return (
    <Panel icon={iKey} title="Export key" meta="self-custody">
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        Move your private key into Phantom or any Solana wallet.
      </p>
      <button
        onClick={() => exportWallet({ address })}
        className={ghostBtn}
        style={{ ...ghostBtnStyle, marginTop: 14 }}
      >
        Export private key
      </button>
    </Panel>
  );
}

/* ---------- faucet ---------- */

function FaucetPanel() {
  const { isConnected, address } = useVaultWallet();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function getUsdt() {
    if (!address || busy) return;
    setBusy(true);
    setStatus("Minting 100 test USDT…");
    try {
      const res = await fetch("/api/dev/usdt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mint", to: address, mint: findToken("USDT")?.mint, amount: 100 }),
      });
      const data = await res.json();
      setStatus(res.ok ? "✓ 100 USDT received." : data.error ?? "Failed.");
    } catch {
      setStatus("Failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected) return null;

  return (
    <Panel icon={iDrop} title="Test Funds" meta="devnet">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={getUsdt} disabled={busy} className={ghostBtn} style={{ ...ghostBtnStyle, height: 40 }}>
          {busy ? "…" : "Get 100 test USDT"}
        </button>
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-sm underline-offset-2 hover:underline" style={{ color: "var(--text-dim)" }}>
          USDC faucet ↗
        </a>
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="text-sm underline-offset-2 hover:underline" style={{ color: "var(--text-dim)" }}>
          SOL faucet ↗
        </a>
      </div>
      {status && (
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text)" }}>
          {status}
        </p>
      )}
    </Panel>
  );
}

/* ---------- screen ---------- */

export function SolSettings({
  vaultActive,
  privateBalanceSol,
}: {
  vaultActive?: boolean;
  privateBalanceSol?: number | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3.5">
      <div className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Privacy, security &amp; wallet controls
        </p>
      </div>
      <PrivacyPanel vaultActive={vaultActive} privateBalanceSol={privateBalanceSol} />
      <SecurityPanel />
      <UsernamePanel />
      <ExportPanel />
      <FaucetPanel />
    </div>
  );
}

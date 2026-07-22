"use client";

// Private vault for Solana (Umbra), in the EVM-style layout: total private $
// value + the coins behind it, an iOS-notification feed, then Send / Receive /
// Request / Scan (+ Shield, since Umbra needs a deposit to fund the private
// balance). Wired to the shared PrivateRail (getPrivateRail = Umbra).

import { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";
import { QRCodeSVG } from "qrcode.react";
import { Drawer } from "vaul";
import { getPrivateRail } from "@/lib/umbra-rail";
import { UMBRA_RPC } from "@/lib/umbra";
import { useMarket } from "@/lib/market";
import { useVaultWallet } from "@/lib/wallet";
import { isSolName, resolveSolName } from "@/lib/sns";
import { recordActivity } from "@/lib/activity";
import { parseAmount, railAsset, solAsset } from "@/lib/tokens";
import { buildPayLink } from "@/lib/pay-request";
import { readPrivateLog, appendPrivateLog, type PrivateLogEntry } from "@/lib/chain/evm/private-log";
import { AssetSelect, assetIcon, type RailSymbol } from "@/ui/asset-select";
import { NumPad } from "@/ui/num-pad";
import { TransferFlow, type TransferSummary } from "@/ui/transfer-flow";
import { NotifStack } from "@/ui/notif-stack";
import { EmptyFeed } from "@/ui/empty-feed";
import { ShieldBanner } from "@/ui/shield-banner";
import { Card, Button } from "@/ui/primitives";
import { useToast } from "@/components/toast";
import type { RailAsset } from "@/lib/rail";

const DECIMALS: Record<RailSymbol, number> = { SOL: 9, USDT: 6, USDC: 6 };
const SYMS: RailSymbol[] = ["SOL", "USDC", "USDT"];
const NAMES: Record<RailSymbol, string> = { SOL: "Solana", USDC: "USD Coin", USDT: "Tether" };

function railFor(sym: RailSymbol) {
  return sym === "SOL" ? solAsset() : railAsset(sym);
}

// Umbra's scanIncoming keeps returning already-claimed/burnt notes on devnet, so
// remember the ones we've spent and filter them out (local; funds unaffected).
const DKEY = (a: string) => `bv_sol_dismissed_notes_${a}`;
function readDismissed(a: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(DKEY(a)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function addDismissed(a: string, ids: string[]) {
  if (typeof localStorage === "undefined") return;
  try {
    const cur = readDismissed(a);
    ids.forEach((id) => cur.add(id));
    localStorage.setItem(DKEY(a), JSON.stringify([...cur]));
  } catch {
    /* quota / unavailable */
  }
}

function coinCircle(sym: string, size = 32) {
  return (
    <span
      className="flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: sym === "SOL" ? "#141414" : "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-pill)",
      }}
    >
      {assetIcon(sym, size === 32 ? 16 : 12)}
    </span>
  );
}

function relTime(ms?: number): string {
  if (!ms) return "pending";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const FEED_COPY = {
  claim: { title: "Received", tone: "var(--positive)" },
  send: { title: "Sent", tone: "var(--text)" },
} as const;

function feedCard(f: PrivateLogEntry, price: (s: string) => number) {
  const c = FEED_COPY[f.kind as keyof typeof FEED_COPY];
  const send = f.kind === "send";
  const value = f.amount * price(f.symbol);
  return (
    <div
      key={f.id}
      className="flex items-center gap-3 px-3 py-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-card)",
      }}
    >
      {/* arrow (send/received) + coin */}
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        <span
          className="flex h-10 w-10 items-center justify-center text-sm"
          style={{
            background: "var(--surface-solid)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-pill)",
            color: c.tone,
          }}
        >
          {send ? "↑" : "↓"}
        </span>
        <span className="absolute -bottom-1 -right-1">{coinCircle(f.symbol, 18)}</span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{c.title}</span>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          {relTime("ts" in f ? f.ts : undefined)}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-sm tabular-nums" style={{ color: c.tone }}>
          {send ? "−" : "+"}
          {f.amount > 0 ? Number(f.amount.toFixed(6)).toString() : "•••"} {f.symbol}
        </span>
        <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
          {f.amount > 0 ? `$${value.toFixed(2)}` : "private"}
        </span>
      </div>
    </div>
  );
}

// Morph-glass action pill with a gold gradient wash (reference style).
function GlassAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bv-press flex h-12 flex-1 items-center justify-center gap-2 text-sm font-medium disabled:opacity-40"
      style={{
        color: "var(--text)",
        background:
          "linear-gradient(135deg, rgba(216,180,94,0.28), rgba(216,180,94,0.05) 60%), var(--surface-2)",
        border: "1px solid rgba(216,180,94,0.32)",
        borderRadius: "var(--r-pill)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      <span className="text-base" style={{ color: "var(--brand)" }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

export function SolPrivate({
  vaultActive,
  onActivated,
  onChanged,
  refreshKey,
  onPrivBalance,
}: {
  vaultActive: boolean;
  onActivated: () => void;
  onChanged: () => void;
  refreshKey?: number;
  onPrivBalance?: (sol: number | null) => void;
}) {
  const vw = useVaultWallet();
  const toast = useToast();
  const quotes = useMarket();

  const [privateBal, setPrivateBal] = useState<Record<RailSymbol, number | null>>({
    SOL: null,
    USDT: null,
    USDC: null,
  });
  const [publicBal, setPublicBal] = useState<Record<RailSymbol, number>>({ SOL: 0, USDT: 0, USDC: 0 });
  const [log, setLog] = useState<PrivateLogEntry[]>([]);
  const [activating, setActivating] = useState(false);
  const [actStatus, setActStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);

  const price = (s: string) => (s === "SOL" ? quotes?.SOL?.price ?? 152.34 : 1);

  useEffect(() => {
    if (!vaultActive || !vw.isConnected || !vw.address) return;
    let active = true;
    (async () => {
      if (vw.address) setLog(readPrivateLog(vw.address));
      const rail = getPrivateRail(vw);
      const next: Record<RailSymbol, number | null> = { SOL: null, USDT: null, USDC: null };
      for (const s of SYMS) {
        const a = railFor(s);
        if (!a) continue;
        try {
          const b = await rail.getPrivateBalance(a);
          next[s] = b.status === "ready" ? b.amount : 0;
        } catch {
          next[s] = null;
        }
      }
      if (!active) return;
      setPrivateBal(next);
      onPrivBalance?.(next.SOL);
      // NOTE: don't auto-scan incoming here — Umbra's scanIncoming returns
      // already-burnt notes on devnet, so it'd show a phantom "N incoming" every
      // refresh. Users check manually via the button.
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultActive, vw.isConnected, vw.address, refreshKey]);

  // Umbra can't tell a fresh note from an already-burnt one without trying, so
  // Check = scan + claim in one: burnt notes fail silently and get dismissed,
  // genuinely new ones are claimed and land in the feed. No lingering banner.
  async function checkIncoming() {
    if (busy) return;
    setBusy(true);
    try {
      const rail = getPrivateRail(vw);
      const found = await rail.scanIncoming();
      const dis = vw.address ? readDismissed(vw.address) : new Set<string>();
      const fresh = found.filter((n) => !dis.has(n.id));
      if (!fresh.length) {
        toast("success", "No incoming private transfers");
        return;
      }
      const { claimed } = await rail.claim(fresh);
      if (vw.address) {
        addDismissed(vw.address, fresh.map((n) => n.id));
        if (claimed > 0) {
          recordActivity(vw.address, { ts: Date.now(), type: "private-receive" });
          setLog(appendPrivateLog(vw.address, { kind: "claim", symbol: "SOL", amount: 0 }));
          onChanged();
        }
      }
      toast("success", claimed > 0 ? `${claimed} received` : "No incoming private transfers");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const totalUsd = SYMS.reduce((sum, s) => sum + (privateBal[s] ?? 0) * price(s), 0);
  const held = SYMS.filter((s) => (privateBal[s] ?? 0) > 0);

  // Only real send/receive events (pending incoming lives in the claim banner).
  const feed = log.filter((e) => e.kind === "send" || e.kind === "claim");

  if (!vaultActive) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <h2 className="text-base font-semibold">Private balance</h2>
        <Card>
          <p className="text-sm font-medium">Activate Private Vault</p>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-dim)" }}>
            Register with the Umbra privacy protocol to shield and send privately.
            Costs a small devnet SOL fee.
          </p>
          {actStatus && (
            <p className="mt-2 break-words text-xs" style={{ color: "var(--text)" }}>
              {actStatus}
            </p>
          )}
          <Button
            onClick={async () => {
              if (activating) return;
              setActivating(true);
              try {
                await getPrivateRail(vw).register(setActStatus);
                if (vw.address) localStorage.setItem(`bv_umbra_registered_${vw.address}`, "1");
                onActivated();
              } catch (e) {
                const m = (e as Error).message ?? "error";
                if (m.toLowerCase().includes("already")) onActivated();
                else setActStatus("Failed: " + m);
              } finally {
                setActivating(false);
              }
            }}
            disabled={activating}
            className="mt-3 h-11 w-full"
          >
            {activating ? actStatus ?? "Working…" : "Activate"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      {/* hero */}
      <div className="flex flex-col items-center pt-2">
        <div className="flex items-center gap-2">
          <span className="bv-label">Private balance</span>
          <button
            onClick={checkIncoming}
            disabled={busy}
            className="bv-press bv-btn-ghost px-2 py-0.5 text-[10px]"
          >
            {busy ? "…" : "Check incoming"}
          </button>
        </div>
        <p className="mt-1 font-mono text-4xl font-semibold tabular-nums">${totalUsd.toFixed(2)}</p>
        {held.length > 0 && (
          <div className="mt-4 flex w-full flex-col">
            {held.map((s, i) => (
              <div
                key={s}
                className="flex items-center justify-between gap-3 py-2.5"
                style={{ borderBottom: i < held.length - 1 ? "1px solid var(--border)" : undefined }}
              >
                <span className="flex items-center gap-2.5">
                  {coinCircle(s)}
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{NAMES[s]}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
                      {Number((privateBal[s] ?? 0).toFixed(6)).toString()} {s}
                    </span>
                  </span>
                </span>
                <span className="font-mono text-sm tabular-nums">
                  ${((privateBal[s] ?? 0) * price(s)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* notification feed */}
      <div className="flex flex-col gap-2">
        {feed.length === 0 ? (
          <EmptyFeed />
        ) : (
          <NotifStack items={feed.slice(0, 5).map((f) => feedCard(f, price))} />
        )}
      </div>

      {/* actions */}
      <div className="flex gap-2.5 pt-1">
        <GlassAction icon="↑" label="Send" onClick={() => setSendOpen(true)} disabled={busy} />
        <GlassAction icon="↓" label="Receive" onClick={() => setReceiveOpen(true)} />
        <GlassAction icon="⧉" label="Request" onClick={() => setRequestOpen(true)} />
      </div>

      <ShieldBanner />

      <button
        onClick={() => setShieldOpen(true)}
        className="bv-press h-12 w-full text-sm font-semibold"
        style={{
          background: "var(--brand-gradient)",
          color: "var(--cta-text)",
          borderRadius: "var(--r-pill)",
          boxShadow: "0 6px 18px rgba(216,180,94,0.28)",
        }}
      >
        Shield / Unshield balance
      </button>

      <SolSendSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        vw={vw}
        privateBal={privateBal}
        price={price}
        onSent={(symbol, amount) => {
          if (vw.address) setLog(appendPrivateLog(vw.address, { kind: "send", symbol, amount }));
          onChanged();
        }}
      />

      <SolReceiveSheet open={receiveOpen} onClose={() => setReceiveOpen(false)} address={vw.address ?? null} />

      <SolRequestSheet open={requestOpen} onClose={() => setRequestOpen(false)} address={vw.address ?? null} />

      <SolShieldSheet
        open={shieldOpen}
        onClose={() => setShieldOpen(false)}
        vw={vw}
        publicBal={publicBal}
        privateBal={privateBal}
        price={price}
        setPublicBal={setPublicBal}
        onChanged={onChanged}
      />
    </div>
  );
}

/* ---------- send (keypad) ---------- */

function SheetShell({
  open,
  onClose,
  gold,
  children,
}: {
  open: boolean;
  onClose: () => void;
  gold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background: gold
              ? "radial-gradient(120% 70% at 50% 0%, rgba(216,180,94,0.30), rgba(216,180,94,0.06) 45%, transparent 70%), var(--surface-solid)"
              : "var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div className="flex flex-col items-center p-5 pb-6">
            <div
              className="mb-4 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

const glass = (strong = false): React.CSSProperties => ({
  background: strong ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
  border: `1px solid rgba(255,255,255,${strong ? 0.12 : 0.08})`,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
});

function SolSendSheet({
  open,
  onClose,
  vw,
  privateBal,
  price,
  initialTo,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  vw: ReturnType<typeof useVaultWallet>;
  privateBal: Record<RailSymbol, number | null>;
  price: (s: string) => number;
  initialTo?: string;
  onSent: (symbol: string, amount: number) => void;
}) {
  const toast = useToast();
  const [asset, setAsset] = useState<RailSymbol>("SOL");
  const [to, setTo] = useState(initialTo ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<{
    summary: TransferSummary;
    dest: string;
    a: RailAsset;
    units: bigint;
    amt: number;
  } | null>(null);

  const available = privateBal[asset] ?? 0;
  const usd = (parseFloat(amount) || 0) * price(asset);

  function onKey(k: string) {
    if (busy) return;
    if (k === "back") setAmount((a) => a.slice(0, -1));
    else if (k === ".") setAmount((a) => (a.includes(".") ? a : (a || "0") + "."));
    else setAmount((a) => (a === "0" ? k : a + k));
  }

  // Validate + resolve the recipient, then hand off to the full-screen confirm
  // flow. The actual send runs inside TransferFlow's onConfirm.
  async function review() {
    if (!vw.address || busy) return;
    const a = railFor(asset);
    if (!a) return;
    const units = parseAmount(amount, DECIMALS[asset]);
    if (units === null) return toast("error", "Enter an amount");
    if (parseFloat(amount) > available) return toast("error", `Only ${available} ${asset} available`);
    if (!to.trim()) return toast("error", "Enter a recipient");
    setBusy(true);
    try {
      const raw = to.trim();
      const dest = isSolName(raw) ? await resolveSolName(new Connection(UMBRA_RPC), raw) : raw;
      const short = dest.length > 16 ? `${dest.slice(0, 6)}…${dest.slice(-6)}` : dest;
      setFlow({
        summary: {
          mode: "private",
          symbol: asset,
          icon: coinCircle(asset, 64),
          amount,
          usd,
          fromLabel: "Your Vault",
          toLabel: isSolName(raw) ? raw : short,
          network: "Solana · devnet",
          fee: "~0.00001 SOL",
        },
        dest,
        a,
        units,
        amt: parseFloat(amount),
      });
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetShell open={open && !flow} onClose={onClose} gold>
        <h3 className="self-start text-base font-semibold">Send private</h3>

        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Address or name.blackvault.sol"
          className="mt-3 w-full truncate px-4 py-3.5 text-xs outline-none"
          style={{ ...glass(), borderRadius: "var(--r-card)" }}
        />

        <div className="mt-3 w-full p-5" style={{ ...glass(), borderRadius: "var(--r-card)" }}>
          <p className="text-center font-mono text-4xl font-semibold tabular-nums">
            {amount || "0"}
            <span className="ml-2 text-xl" style={{ color: "var(--text-dim)" }}>
              {asset}
            </span>
          </p>
          <p className="mt-1 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            ≈ ${usd.toFixed(2)} · Available: {Number(available.toFixed(6)).toString()} {asset}
          </p>
          <div className="mt-4 flex justify-center">
            <AssetSelect value={asset} onChange={setAsset} />
          </div>
        </div>

        <div className="mt-3 w-full">
          <NumPad onKey={onKey} decimal />
        </div>

        <Button onClick={review} disabled={busy} className="mt-1 h-12 w-full">
          {busy ? "…" : "Send"}
        </Button>
        <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
          Recipient stays hidden · fees paid in SOL
        </p>
      </SheetShell>

      {flow && (
        <TransferFlow
          open
          summary={flow.summary}
          onConfirm={async (log) => {
          if (!vw.address) throw new Error("Nothing to send");
            await getPrivateRail(vw).sendPrivate(flow.dest, flow.a, flow.units, log);
            recordActivity(vw.address, { ts: Date.now(), type: "private-send", amountSol: flow.amt });
            onSent(asset, flow.amt);
            return {};
          }}
          onClose={() => setFlow(null)}
          onDone={() => {
            setFlow(null);
            setAmount("");
            setTo("");
            onClose();
          }}
        />
      )}
    </>
  );
}

/* ---------- receive / request (QR) ---------- */

function QrSheet({
  open,
  onClose,
  title,
  hint,
  value,
  copyLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  value: string | null;
  copyLabel: string;
}) {
  const toast = useToast();
  return (
    <SheetShell open={open} onClose={onClose}>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-center text-xs" style={{ color: "var(--text-dim)" }}>
        {hint}
      </p>
      {value && (
        <div className="mt-5 rounded-2xl bg-white p-3">
          <QRCodeSVG value={value} size={196} level="M" />
        </div>
      )}
      <button
        onClick={async () => {
          if (!value) return;
          try {
            await navigator.clipboard.writeText(value);
            toast("success", "Copied");
          } catch {
            /* clipboard unavailable */
          }
        }}
        className="bv-press mt-5 w-full truncate rounded-lg px-3 py-3 text-center font-mono text-xs"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        title={value ?? undefined}
      >
        {copyLabel}
      </button>
    </SheetShell>
  );
}

function SolReceiveSheet({ open, onClose, address }: { open: boolean; onClose: () => void; address: string | null }) {
  return (
    <QrSheet
      open={open}
      onClose={onClose}
      title="Receive privately"
      hint="Share your address. Senders can pay you privately to it."
      value={address}
      copyLabel={address ?? "—"}
    />
  );
}

function SolRequestSheet({ open, onClose, address }: { open: boolean; onClose: () => void; address: string | null }) {
  const link =
    typeof window !== "undefined" && address ? buildPayLink(window.location.origin, { to: address }) : null;
  return (
    <QrSheet
      open={open}
      onClose={onClose}
      title="Request payment"
      hint="Share this link. It opens the app with your address prefilled."
      value={link}
      copyLabel={link ? "Copy payment link" : "—"}
    />
  );
}

/* ---------- shield / unshield ---------- */

function SolShieldSheet({
  open,
  onClose,
  vw,
  publicBal,
  privateBal,
  price,
  setPublicBal,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  vw: ReturnType<typeof useVaultWallet>;
  publicBal: Record<RailSymbol, number>;
  privateBal: Record<RailSymbol, number | null>;
  price: (s: string) => number;
  setPublicBal: (v: Record<RailSymbol, number>) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [asset, setAsset] = useState<RailSymbol>("SOL");
  const [toPrivate, setToPrivate] = useState(true);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // best-effort public balances when the sheet opens
  useEffect(() => {
    if (!open || !vw.address) return;
    let active = true;
    import("@blackvault/sdk").then(({ createConnection, getPortfolio }) =>
      getPortfolio(createConnection(), [vw.address!])
        .then((p) => {
          if (!active) return;
          const t = (s: RailSymbol) => p.tokens.find((x) => x.mint === railFor(s)?.mint)?.amount ?? 0;
          setPublicBal({ SOL: p.totalSol, USDT: t("USDT"), USDC: t("USDC") });
        })
        .catch(() => {})
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vw.address]);

  const fromBal = toPrivate ? publicBal[asset] : privateBal[asset] ?? 0;
  const usd = (parseFloat(amount) || 0) * price(asset);

  async function go() {
    if (!vw.address || busy) return;
    const a = railFor(asset);
    if (!a) return;
    const units = parseAmount(amount, DECIMALS[asset]);
    if (units === null) return toast("error", "Enter an amount");
    if (parseFloat(amount) > (fromBal ?? 0)) return toast("error", "Insufficient balance");
    setBusy(true);
    setStage(null);
    try {
      const rail = getPrivateRail(vw);
      if (toPrivate) {
        await rail.deposit(a, units, setStage);
        recordActivity(vw.address, { ts: Date.now(), type: "deposit", amountSol: parseFloat(amount) });
      } else {
        await rail.withdraw(a, units, setStage);
        recordActivity(vw.address, { ts: Date.now(), type: "withdraw", amountSol: parseFloat(amount) });
      }
      toast("success", `${toPrivate ? "Shielded" : "Unshielded"} ${amount} ${asset}`);
      setAmount("");
      onChanged();
      onClose();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  return (
    <SheetShell open={open} onClose={onClose} gold>
      <div className="flex w-full items-center justify-between">
        <h3 className="text-base font-semibold">{toPrivate ? "Shield to private" : "Unshield to public"}</h3>
        <button
          onClick={() => setToPrivate((v) => !v)}
          className="bv-press flex h-9 w-9 items-center justify-center"
          style={{ background: "var(--brand-gradient)", color: "var(--cta-text)", borderRadius: "var(--r-pill)" }}
          aria-label="Switch direction"
        >
          ⇅
        </button>
      </div>

      <div className="mt-3 w-full p-5" style={{ ...glass(), borderRadius: "var(--r-card)" }}>
        <div className="flex items-center justify-between">
          <span className="bv-label">{toPrivate ? "Public → Private" : "Private → Public"}</span>
          <button
            onClick={() => (fromBal ?? 0) > 0 && setAmount(String(fromBal))}
            className="text-xs"
            style={{ color: "var(--brand)" }}
          >
            MAX
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full bg-transparent font-mono text-3xl font-semibold outline-none"
          />
          <AssetSelect value={asset} onChange={setAsset} />
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
          ≈ ${usd.toFixed(2)} · balance {Number((fromBal ?? 0).toFixed(6)).toString()} {asset}
        </p>
      </div>

      <Button onClick={go} disabled={busy} className="mt-3 h-12 w-full">
        {busy ? stage ?? "Working…" : toPrivate ? "Shield" : "Unshield"}
      </Button>
    </SheetShell>
  );
}

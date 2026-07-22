"use client";

// Full Activity page (reference style): value chart with timeframe pills,
// transaction history (All / Private / Public), each row opens a detail
// bottom sheet with a Solscan link.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Connection, PublicKey } from "@solana/web3.js";
import { Drawer } from "vaul";
import { createConnection, getPortfolio } from "@blackvault/sdk";
import {
  readActivity,
  activityLabel,
  type ActivityEntry,
  type ActivityType,
} from "@/lib/activity";
import { useVaultWallet } from "@/lib/wallet";
import { UMBRA_RPC } from "@/lib/umbra";
import { useMarket } from "@/lib/market";
import { Card, Segmented, Skeleton } from "@/ui/primitives";

interface Row {
  ts: number;
  label: string;
  type?: ActivityType;
  amountSol?: number;
  shielded: boolean;
  sig?: string;
}

const TIMEFRAMES = [
  { id: "4h", label: "4H" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
];

function fmt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------- deterministic value chart ---------- */

function series(seed: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out.push(
      50 +
        18 * Math.sin(i * 0.5 + seed) +
        10 * Math.sin(i * 0.17 + seed * 2) +
        16 * x
    );
  }
  return out;
}

const TF_MS: Record<string, number> = {
  "4h": 4 * 3600e3,
  "1d": 86400e3,
  "1w": 7 * 86400e3,
  "1m": 30 * 86400e3,
  "1y": 365 * 86400e3,
  all: 365 * 86400e3,
};

const H = 168; // chart height in px

// Catmull-Rom → cubic bezier: turns the point list into a smooth curve (matches
// the soft look of the Your Assets sparklines) instead of straight segments.
function smoothPath(coords: [number, number][]): string {
  if (coords.length < 2) return "";
  let d = `M${coords[0][0]},${coords[0][1]}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function Chart({
  pts,
  color,
  usd,
  timeframe,
}: {
  pts: number[];
  color: string;
  usd: number | null;
  timeframe: string;
}) {
  const n = pts.length;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const normVb = (v: number) => 38 - ((v - min) / (max - min || 1)) * 34 - 2; // viewBox y
  const coords = pts.map((v, i) => [(i / (n - 1)) * 100, normVb(v)] as [number, number]);
  const dLine = smoothPath(coords);
  const dArea = dLine ? `${dLine} L100,40 L0,40 Z` : "";

  // active index defaults to the latest point
  const idx = hover ?? n - 1;
  const leftPct = (idx / (n - 1)) * 100;
  const topPx = (normVb(pts[idx]) / 40) * H;

  // map series point → $ value (scaled so the last point ≈ current portfolio)
  const valueAt = (i: number) =>
    usd != null ? usd * (pts[i] / pts[n - 1]) : pts[i] * 100;
  const dateAt = (i: number) => {
    const ratio = i / (n - 1);
    const t = Date.now() - (1 - ratio) * TF_MS[timeframe];
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  function onMove(e: React.PointerEvent) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setHover(Math.round(ratio * (n - 1)));
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full touch-none select-none"
      style={{ height: H }}
      onPointerDown={onMove}
      onPointerMove={(e) => e.buttons && onMove(e)}
    >
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="act-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={dArea} fill="url(#act-fill)" className="bv-chart-fill" />
        <path
          d={dLine}
          pathLength={1}
          className="bv-draw"
          fill="none"
          stroke={color}
          strokeWidth="0.9"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* crosshair + marker + value/date bubble */}
      <div
        className="pointer-events-none absolute top-0 bottom-0"
        style={{ left: `${leftPct}%`, width: 1, background: "rgba(255,255,255,0.15)" }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          left: `${leftPct}%`,
          top: topPx,
          width: 10,
          height: 10,
          marginLeft: -5,
          marginTop: -5,
          borderRadius: "var(--r-pill)",
          background: color,
          boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 25%, transparent)`,
        }}
      />
      <div
        className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 text-center"
        style={{
          left: `${Math.min(Math.max(leftPct, 16), 84)}%`,
          top: Math.max(topPx - 46, 0),
          background: "var(--surface-solid)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--r-control)",
          boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
        }}
      >
        <p className="font-mono text-sm font-semibold">
          ${valueAt(idx).toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-dim)" }}>
          {dateAt(idx)}
        </p>
      </div>
    </div>
  );
}

/* ---------- detail bottom sheet ---------- */

function DetailSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const solscan = row?.sig
    ? `https://solscan.io/tx/${row.sig}?cluster=devnet`
    : null;

  return (
    <Drawer.Root open={!!row} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background: "var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          {row && (
            <div className="p-6 pb-8">
              <div
                className="mx-auto mb-5 h-1 w-10"
                style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
              />
              <div className="flex flex-col items-center text-center">
                <span
                  className="flex h-12 w-12 items-center justify-center text-xl"
                  style={{
                    background: row.shielded ? "var(--brand-soft)" : "var(--surface-2)",
                    color: row.shielded ? "var(--brand)" : "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-pill)",
                  }}
                >
                  {row.shielded ? "◈" : "↗"}
                </span>
                <p className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>
                  {row.label}
                </p>
                <p className="mt-1 font-mono text-3xl font-semibold">
                  {row.amountSol != null ? `${row.amountSol} SOL` : "—"}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                  {fmt(row.ts)}
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 text-sm">
                <DetailRow k="Status" v={<span style={{ color: "var(--positive)" }}>Completed</span>} />
                <DetailRow
                  k="Type"
                  v={row.shielded ? "Private · amount hidden" : "Public · on-chain"}
                />
                <DetailRow k="Network" v="Solana · devnet" />
                {row.sig && (
                  <DetailRow
                    k="Onchain tx"
                    v={
                      <span className="font-mono">
                        {row.sig.slice(0, 6)}…{row.sig.slice(-6)}
                      </span>
                    }
                  />
                )}
                {row.shielded && (
                  <DetailRow k="Visibility" v="This device only" />
                )}
              </div>

              {solscan ? (
                <a
                  href={solscan}
                  target="_blank"
                  rel="noreferrer"
                  className="bv-press bv-btn-primary mt-6 flex h-12 w-full items-center justify-center text-sm"
                >
                  View on Solscan ↗
                </a>
              ) : (
                <p
                  className="mt-6 text-center text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  Private transfers are not visible on-chain.
                </p>
              )}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ---------- clock time-range dropdown ---------- */

const RANGES = [
  { id: "all", label: "All time" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
];

function ClockRange({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((o) => !o);
  }
  const active = RANGES.find((r) => r.id === value)?.label ?? "All time";
  const W = 132;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label="Time range"
        className="bv-press flex items-center gap-1.5 py-1.5 pl-2.5 pr-3 text-xs font-medium"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-pill)",
          color: value === "all" ? "var(--text-dim)" : "var(--brand)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 8v4.2l2.6 1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {value === "all" ? "" : active}
      </button>

      {mounted &&
        open &&
        rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
            <div
              className="bv-enter fixed z-[999] p-1"
              style={{
                top: rect.bottom + 6,
                left: Math.max(rect.right - W, 8),
                width: W,
                background: "var(--surface-solid)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-card)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              }}
            >
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                  className="bv-press flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm"
                  style={{ color: r.id === value ? "var(--brand)" : "var(--text)" }}
                >
                  {r.label}
                  {r.id === value && <span>✓</span>}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

function DetailRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ color: "var(--text-dim)" }}>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

/* ---------- main view ---------- */

export function ActivityView({ refreshKey }: { refreshKey?: number }) {
  const { isConnected, address } = useVaultWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState("all");
  const [timeframe, setTimeframe] = useState("1m");
  const [loading, setLoading] = useState(false);
  const [solHeld, setSolHeld] = useState<number | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const quotes = useMarket();
  const usd =
    solHeld === null ? null : solHeld * (quotes?.SOL?.price ?? 152.34);

  useEffect(() => {
    if (!isConnected || !address) return;
    let active = true;
    setLoading(true);

    getPortfolio(createConnection(), [address])
      .then((p) => active && setSolHeld(p.totalSol))
      .catch(() => {});

    (async () => {
      const local: Row[] = readActivity(address).map((e: ActivityEntry) => ({
        ts: e.ts,
        label: activityLabel(e.type),
        type: e.type,
        amountSol: e.amountSol,
        shielded: true,
      }));
      let publicRows: Row[] = [];
      try {
        const conn = new Connection(UMBRA_RPC, "confirmed");
        const sigs = await conn.getSignaturesForAddress(new PublicKey(address), {
          limit: 20,
        });
        publicRows = sigs.map((s) => ({
          ts: (s.blockTime ?? 0) * 1000,
          label: "Transaction",
          shielded: false,
          sig: s.signature,
        }));
      } catch {
        // public history unavailable
      }
      if (!active) return;
      setRows([...local, ...publicRows].sort((a, b) => b.ts - a.ts));
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [isConnected, address, refreshKey]);

  const RANGE_MS: Record<string, number> = {
    all: Infinity,
    "24h": 86400e3,
    "7d": 7 * 86400e3,
    "30d": 30 * 86400e3,
  };
  const now = Date.now();
  const visible = rows
    .filter((r) =>
      filter === "all" ? true : filter === "private" ? r.shielded : !r.shielded
    )
    .filter((r) => now - r.ts <= RANGE_MS[range]);
  const seed = TIMEFRAMES.findIndex((t) => t.id === timeframe) + 1;
  const pts = series(seed, 48);
  const up = pts[pts.length - 1] >= pts[0];
  const trendColor = up ? "var(--positive)" : "var(--negative)";
  const pct = ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100;

  const [usdInt, usdFrac] = (usd ?? 0)
    .toFixed(2)
    .split(".") as [string, string];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>

      {/* chart card */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="bv-label">Portfolio value</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              ${Number(usdInt).toLocaleString("en-US")}
              <span style={{ color: "var(--text-faint)" }}>.{usdFrac}</span>
            </p>
          </div>
          <span className="text-xs" style={{ color: trendColor }}>
            {up ? "↗" : "↘"} {up ? "+" : ""}
            {pct.toFixed(2)}%
          </span>
        </div>
        <div className="mt-3">
          <Chart pts={pts} color={trendColor} usd={usd} timeframe={timeframe} />
        </div>
        <div className="mt-3 flex justify-center">
          <Segmented options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
        </div>
      </Card>

      {/* history */}
      <h2 className="text-base font-semibold">Transaction history</h2>
      <div className="flex items-center justify-between gap-2">
        <Segmented
          options={[
            { id: "all", label: "All" },
            { id: "private", label: "Private" },
            { id: "public", label: "Public" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <ClockRange value={range} onChange={setRange} />
      </div>

      <div>
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            No transactions in this range.
          </p>
        ) : (
          <ul className="max-h-[360px] overflow-y-auto pr-1">
            {visible.map((r, i) => (
              <li
                key={`${r.ts}-${r.sig ?? i}`}
                style={{
                  borderBottom: i < visible.length - 1 ? "1px solid var(--border)" : undefined,
                }}
              >
                <button
                  onClick={() => setSelected(r)}
                  className="bv-press flex w-full items-center justify-between gap-3 py-3 text-left text-sm"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-sm"
                      style={{
                        background: r.shielded ? "var(--brand-soft)" : "var(--surface-2)",
                        color: r.shielded ? "var(--brand)" : "var(--text)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-pill)",
                      }}
                    >
                      {r.shielded ? "◈" : "↗"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.label}</span>
                      <span className="block text-xs" style={{ color: "var(--text-dim)" }}>
                        {r.shielded ? "Private · hidden" : "Public · on-chain"}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {r.amountSol != null && (
                      <span className="block font-mono text-sm">{r.amountSol} SOL</span>
                    )}
                    <span className="block text-xs" style={{ color: "var(--text-dim)" }}>
                      {fmt(r.ts)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DetailSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

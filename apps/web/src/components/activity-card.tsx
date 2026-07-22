"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  readActivity,
  activityLabel,
  type ActivityEntry,
} from "@/lib/activity";
import { useVaultWallet } from "@/lib/wallet";
import { UMBRA_RPC } from "@/lib/umbra";
import { Card, SectionLabel, Segmented, Skeleton } from "@/ui/primitives";

const RPC = UMBRA_RPC;

interface Row {
  ts: number;
  label: string;
  amountSol?: number;
  shielded: boolean;
  sig?: string;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityCard({ refreshKey }: { refreshKey?: number }) {
  const { isConnected, address } = useVaultWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setRows([]);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      const local: Row[] = readActivity(address).map((e: ActivityEntry) => ({
        ts: e.ts,
        label: activityLabel(e.type),
        amountSol: e.amountSol,
        shielded: true,
      }));

      let publicRows: Row[] = [];
      try {
        const connection = new Connection(RPC, "confirmed");
        const sigs = await connection.getSignaturesForAddress(
          new PublicKey(address),
          { limit: 8 }
        );
        publicRows = sigs.map((s) => ({
          ts: (s.blockTime ?? 0) * 1000,
          label: "Transaction",
          shielded: false,
          sig: s.signature,
        }));
      } catch {
        // public history unavailable — show local only
      }

      if (!active) return;
      setRows(
        [...local, ...publicRows].sort((a, b) => b.ts - a.ts).slice(0, 12)
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isConnected, address, refreshKey]);

  if (!isConnected || !address) return null;

  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "shielded" ? r.shielded : !r.shielded
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Activity · devnet</SectionLabel>
        <Segmented
          options={[
            { id: "all", label: "All" },
            { id: "shielded", label: "Shielded" },
            { id: "public", label: "Public" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      {loading ? (
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
          No activity yet.
        </p>
      ) : (
        <ul className="mt-3">
          {visible.map((r, i) => (
            <li
              key={`${r.ts}-${r.sig ?? i}`}
              className="flex items-center justify-between gap-3 py-2 text-sm"
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
                    {r.shielded ? "Shielded · this device only" : "Public · on-chain"}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                {r.amountSol != null && (
                  <span className="block font-mono text-sm">{r.amountSol} SOL</span>
                )}
                <span className="block text-xs" style={{ color: "var(--text-dim)" }}>
                  {r.sig ? (
                    <a
                      href={`https://explorer.solana.com/tx/${r.sig}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {fmt(r.ts)} ↗
                    </a>
                  ) : (
                    fmt(r.ts)
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

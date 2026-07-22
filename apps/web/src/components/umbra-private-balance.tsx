"use client";

import { useEffect, useState } from "react";
import { getPrivateRail } from "@/lib/umbra-rail";
import { privateTokens, railAsset, solAsset } from "@/lib/tokens";
import { useVaultWallet } from "@/lib/wallet";
import { Card, SectionLabel, Stat, TokenRow, Skeleton } from "@/ui/primitives";
import { UsdcIcon, UsdtIcon } from "@/ui/icons";

export function UmbraPrivateBalance({
  refreshKey,
  ready,
  onBalance,
}: {
  refreshKey?: number;
  ready?: boolean;
  onBalance?: (sol: number | null) => void;
}) {
  const vw = useVaultWallet();
  const [sol, setSol] = useState<number | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [tokenRows, setTokenRows] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const addr = vw.address;

  useEffect(() => {
    if (addr && localStorage.getItem(`bv_umbra_registered_${addr}`)) {
      setRegistered(true);
    }
  }, [addr]);

  useEffect(() => {
    if (!vw.isConnected || !vw.address || !(registered || ready)) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const rail = getPrivateRail(vw);
        const bal = await rail.getPrivateBalance(solAsset());
        if (!active) return;
        if (bal.status === "none") {
          setSol(0);
          setLabel("None yet — deposit first");
          onBalance?.(0);
        } else if (bal.status === "ready") {
          setSol(bal.amount);
          setLabel(null);
          onBalance?.(bal.amount);
        } else if (bal.status === "needs_conversion") {
          setSol(null);
          setLabel("Active (encrypted — conversion needed to display)");
          onBalance?.(null);
        } else {
          setSol(null);
          setLabel("Active (not initialized)");
          onBalance?.(null);
        }

        // Stable rows show only when a balance exists.
        const rows: string[] = [];
        for (const t of privateTokens()) {
          const asset = railAsset(t.symbol);
          if (!asset) continue;
          try {
            const bal = await rail.getPrivateBalance(asset);
            if (bal.status === "ready" && (bal.amount ?? 0) > 0) {
              rows.push(`${bal.amount} ${t.symbol}`);
            }
          } catch {
            // skip token row on read failure
          }
        }
        if (active) setTokenRows(rows);
      } catch {
        if (active) {
          setSol(null);
          setLabel("Failed to read");
          onBalance?.(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vw.isConnected, vw.address, registered, ready, refreshKey]);

  if (!vw.isConnected || !(registered || ready)) return null;

  return (
    <Card style={{ borderColor: "var(--brand-soft)" }}>
      <SectionLabel>
        <span style={{ color: "var(--brand)" }}>Private Balance · devnet</span>
      </SectionLabel>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-9 w-40" />
        ) : label ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            {label}
          </p>
        ) : (
          <Stat value={sol} suffix="SOL" />
        )}
      </div>
      {!loading && tokenRows.length > 0 && (
        <div className="mt-2 border-t pt-1" style={{ borderColor: "var(--border)" }}>
          {tokenRows.map((r) => {
            const [amount, symbol] = r.split(" ");
            return (
              <TokenRow
                key={r}
                icon={symbol === "USDC" ? <UsdcIcon size={22} /> : <UsdtIcon size={22} />}
                name={symbol}
                value={amount}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}

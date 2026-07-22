"use client";

import { useEffect, useState } from "react";
import { createConnection, getPortfolio, type Portfolio } from "@blackvault/sdk";
import { TOKENS } from "@/lib/tokens";
import { useVaultWallet } from "@/lib/wallet";
import { Card, SectionLabel, Stat, TokenRow, Skeleton } from "@/ui/primitives";
import { UsdcIcon, UsdtIcon } from "@/ui/icons";

export function VaultBalance({ refreshKey }: { refreshKey?: number }) {
  const { isConnected, address } = useVaultWallet();

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setPortfolio(null);
      return;
    }

    let active = true;
    setLoading(true);
    const connection = createConnection();

    getPortfolio(connection, [address])
      .then((p) => active && setPortfolio(p))
      .catch(() => active && setPortfolio(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [isConnected, address, refreshKey]);

  if (!isConnected || !address) return null;

  const heldTokens = portfolio
    ? TOKENS.filter((t) => t.mint)
        .map((t) => ({
          ...t,
          held: portfolio.tokens.find((pt) => pt.mint === t.mint),
        }))
        .filter((t) => t.held)
    : [];

  return (
    <Card>
      <SectionLabel>Vault Balance · devnet</SectionLabel>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-9 w-40" />
        ) : (
          <Stat value={portfolio ? portfolio.totalSol : null} suffix="SOL" />
        )}
      </div>
      {heldTokens.length > 0 && (
        <div className="mt-2 border-t pt-1" style={{ borderColor: "var(--border)" }}>
          {heldTokens.map((t) => (
            <TokenRow
              key={t.symbol}
              icon={t.symbol === "USDC" ? <UsdcIcon size={22} /> : <UsdtIcon size={22} />}
              name={t.symbol}
              value={String(t.held!.amount)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

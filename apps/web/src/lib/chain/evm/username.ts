"use client";

// Client helpers for the BlackVault Names subname claim (our own self-hosted
// service at /api/names — replaces NameStone). Claims may be paid: fetch the
// terms first; when priced, pay USDG to the revenue address and pass the tx.

export interface ClaimTerms {
  priceUsdg: number;
  parent: string;
  revenueAddr: string | null;
}

export async function claimTerms(): Promise<ClaimTerms> {
  try {
    const r = await fetch("/api/names/claim");
    if (!r.ok) return { priceUsdg: 0, parent: "", revenueAddr: null };
    return (await r.json()) as ClaimTerms;
  } catch {
    return { priceUsdg: 0, parent: "", revenueAddr: null };
  }
}

export async function lookupUsername(address: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/names/claim?address=${address}`);
    if (!r.ok) return null;
    const d = (await r.json()) as { name?: string | null };
    return d.name ?? null;
  } catch {
    return null;
  }
}

/** True if the label is already taken. */
export async function usernameTaken(name: string, parent: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/names/resolve?name=${encodeURIComponent(`${name}.${parent}`)}`);
    if (!r.ok) return false;
    const d = (await r.json()) as { address?: string | null };
    return !!d.address;
  } catch {
    return false;
  }
}

export async function claimUsername(
  name: string,
  address: string,
  txHash?: string
): Promise<string> {
  const r = await fetch("/api/names/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, address, txHash }),
  });
  const d = (await r.json().catch(() => ({}))) as { name?: string; error?: string };
  if (!r.ok) throw new Error(d.error || "Claim failed");
  return d.name ?? name;
}

"use client";

// Local log of private actions (sends/claims) per address. Stealth activity
// isn't readable from the chain the way public transfers are — the whole point
// is that it isn't linkable — so the wallet keeps its own record to show a feed.
// Local-only: clearing site data clears the history (funds are unaffected).

export interface PrivateLogEntry {
  id: string;
  kind: "send" | "claim";
  symbol: string;
  amount: number;
  ts: number;
}

const KEY = (address: string) => `bv_evm_private_log_${address}`;
const MAX = 50;

export function readPrivateLog(address: string): PrivateLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY(address));
    return raw ? (JSON.parse(raw) as PrivateLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendPrivateLog(
  address: string,
  entry: Omit<PrivateLogEntry, "id" | "ts">
): PrivateLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  const next: PrivateLogEntry[] = [
    { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() },
    ...readPrivateLog(address),
  ].slice(0, MAX);
  try {
    localStorage.setItem(KEY(address), JSON.stringify(next));
  } catch {
    /* quota / unavailable */
  }
  return next;
}

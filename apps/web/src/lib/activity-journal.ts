"use client";

// Semantic wallet-activity journal (per address, localStorage). On-chain logs
// only show raw transfers — this records what the user actually DID (bought a
// subname, paid a QR, created a payment request…) so Activity can tell the
// story. Rows carrying a tx hash are deduped against the on-chain feed.

export type JournalKind =
  | "send" // manual public send
  | "send-qr" // paid by scanning a QR
  | "send-request" // paid an incoming payment request link
  | "request-created" // created a payment request (no tx)
  | "name" // bought a subname
  | "name-change"; // changed subname (paid again)

export interface JournalEntry {
  id: string;
  ts: number;
  kind: JournalKind;
  title: string;
  symbol?: string;
  amount?: number;
  dir: "in" | "out" | "none";
  hash?: string;
  detail?: string;
}

const PREFIX = "bv_evm_journal_v1_";
const CAP = 200;

export function readJournal(address: string): JournalEntry[] {
  try {
    const raw = localStorage.getItem(PREFIX + address.toLowerCase());
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendJournal(
  address: string,
  entry: Omit<JournalEntry, "id" | "ts">
): void {
  try {
    const list = readJournal(address);
    list.unshift({ ...entry, id: crypto.randomUUID(), ts: Date.now() });
    localStorage.setItem(
      PREFIX + address.toLowerCase(),
      JSON.stringify(list.slice(0, CAP))
    );
  } catch {
    /* storage unavailable — journal is best-effort */
  }
}

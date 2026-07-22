"use client";

import { useEffect, useState } from "react";
import { getPrivateRail } from "@/lib/umbra-rail";
import type { RailNote } from "@/lib/rail";
import { useVaultWallet } from "@/lib/wallet";
import { recordActivity } from "@/lib/activity";

export function UmbraReceivePrivate({
  ready,
  onClaimed,
}: {
  ready?: boolean;
  onClaimed?: () => void;
}) {
  const vw = useVaultWallet();
  const [notes, setNotes] = useState<RailNote[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const addr = vw.address;

  useEffect(() => {
    if (addr && localStorage.getItem(`bv_umbra_registered_${addr}`)) {
      setRegistered(true);
    }
  }, [addr]);

  async function scan() {
    if (!vw.isConnected || busy) return;
    setBusy(true);
    setNotes([]); // drop stale results from the previous scan
    setStatus("Scanning for incoming private transfers… (indexer can lag)");
    try {
      const rail = getPrivateRail(vw);
      let found: RailNote[] = [];
      for (let i = 1; i <= 6; i++) {
        found = await rail.scanIncoming();
        if (found.length > 0) break;
        await new Promise((r) => setTimeout(r, 5000));
      }
      setNotes(found);
      setStatus(
        found.length
          ? `${found.length} private transfer(s) found. Click Claim.`
          : "No incoming transfers yet (try again shortly)."
      );
    } catch (e) {
      setStatus("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (!vw.isConnected || busy || notes.length === 0) return;
    setBusy(true);
    setStatus("Claiming (ZK + relayer)… this can take a few minutes");
    try {
      const { claimed, failed } = await getPrivateRail(vw).claim(notes, setStatus);
      if (claimed > 0 && vw.address) {
        recordActivity(vw.address, { ts: Date.now(), type: "private-receive" });
      }
      if (claimed > 0 && failed === 0) {
        setStatus(`✓ ${claimed} transfer(s) claimed into your Private Balance.`);
      } else if (claimed > 0) {
        setStatus(
          `✓ ${claimed} claimed. ${failed} older transfer(s) couldn't be claimed (already burnt on-chain) — they'll stop appearing once the indexer catches up.`
        );
      } else {
        setStatus(
          "No transfers could be claimed — they were already burnt on-chain (stale indexer entries). Nothing new was lost."
        );
      }
      setNotes([]);
      onClaimed?.();
    } catch (e) {
      setStatus("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (!vw.isConnected || !(registered || ready)) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Receive Privately · devnet
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={scan}
          disabled={busy}
          className="bv-press bv-btn-ghost px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "…" : "Check incoming"}
        </button>
        {notes.length > 0 && (
          <button
            onClick={claim}
            disabled={busy}
            className="bv-press bv-btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            Claim ({notes.length})
          </button>
        )}
      </div>
      {status && (
        <p className="mt-3 break-words text-sm leading-6 text-foreground/90">
          {status}
        </p>
      )}
    </div>
  );
}

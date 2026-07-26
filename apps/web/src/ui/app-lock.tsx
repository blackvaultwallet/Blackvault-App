"use client";

// Full-screen Private Vault gate (reference: banking unlock screens).
// Biometrics only — no passcode feature yet. Not enrolled → the Unlock action
// is unavailable; the primary button enables biometrics instead (enrolling
// verifies the user, so it also unlocks).

import { useEffect, useRef, useState } from "react";
import { disableLock, enrollLock, lockEnabled, verifyLock } from "@/lib/biometric-lock";

const FingerprintGlyph = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2" opacity="0.55" />
    <path d="M12 11v3M9.2 10.2a3.5 3.5 0 0 1 5.6 0M7.5 8.4a6 6 0 0 1 9 0M9.5 15.5c.4 1 1.2 1.8 2.5 1.8s2.1-.8 2.5-1.8" />
  </svg>
);

const ShieldGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3z" />
    <path d="M12 9v3" />
  </svg>
);

export function AppLock({
  onUnlock,
  onCancel,
  embedded = false,
}: {
  onUnlock: () => void;
  onCancel?: () => void;
  /** Render in-flow (inside the app layout, header/nav visible) instead of a
   *  full-screen overlay. */
  embedded?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);

  async function unlock() {
    setBusy(true);
    setFailed(false);
    const ok = await verifyLock();
    setBusy(false);
    if (ok) onUnlock();
    else setFailed(true);
  }

  async function enable() {
    setBusy(true);
    setFailed(false);
    try {
      await enrollLock();
      setEnabled(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  // Auto-prompt once when already enrolled (Safari may still need the button).
  useEffect(() => {
    const on = lockEnabled();
    setEnabled(on);
    if (on && !tried.current) {
      tried.current = true;
      void unlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={
        embedded
          ? "flex w-full flex-col items-center justify-center gap-4 px-2 py-6"
          : "fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8"
      }
      style={
        embedded
          ? undefined
          : { background: "var(--bg)", backgroundImage: "var(--bg-sheen)", backgroundRepeat: "no-repeat" }
      }
    >
      {/* vault artwork */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vault-unlock.png" alt="" className="h-60 w-60 object-contain select-none" draggable={false} />

      <div className="text-center">
        <h2 className="text-2xl font-semibold">
          Unlock your <span style={{ color: "var(--brand)" }}>Private Vault</span>
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: "var(--text-dim)" }}>
          {failed
            ? "Verification failed — try again."
            : "Confirm it's you to access your private assets."}
        </p>
      </div>

      {/* biometrics card */}
      <div
        className="flex w-full max-w-sm items-center gap-3.5 p-4"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
        }}
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center"
          style={{
            background: "rgba(216,180,94,0.10)",
            border: "1px solid rgba(216,180,94,0.35)",
            borderRadius: "var(--r-md)",
            color: "var(--brand)",
          }}
        >
          {FingerprintGlyph}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-semibold">Use biometrics</p>
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-dim)" }}>
            Unlock your vault using Face ID or Touch ID
          </p>
        </div>
        {/* toggle mirrors enrollment state */}
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Use biometrics"
          disabled={busy}
          onClick={() => {
            if (enabled) {
              disableLock();
              setEnabled(false);
            } else {
              void enable();
            }
          }}
          className="bv-press relative h-7 w-12 shrink-0"
          style={{
            background: enabled ? "var(--brand-gradient)" : "var(--surface-2)",
            border: enabled ? "none" : "1px solid var(--border-strong)",
            borderRadius: "var(--r-pill)",
          }}
        >
          <span
            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 transition-[left] duration-200"
            style={{
              left: enabled ? "calc(100% - 24px)" : "3px",
              background: enabled ? "#1a1508" : "var(--text-faint)",
              borderRadius: "var(--r-pill)",
            }}
          />
        </button>
      </div>

      {/* primary action — biometrics optional: not enrolled → enter directly;
          enrolled → verify first. The toggle is for opting into biometrics. */}
      <button
        onClick={enabled ? unlock : onUnlock}
        disabled={busy}
        className="bv-press h-12 w-full max-w-sm text-sm font-semibold disabled:opacity-50"
        style={{
          background: "var(--brand-gradient)",
          color: "var(--cta-text)",
          borderRadius: "var(--r-pill)",
        }}
      >
        {busy ? "Waiting for device…" : enabled ? "Unlock" : "Enable Private Vault"}
      </button>

      {onCancel && (
        <button onClick={onCancel} className="bv-press text-sm font-medium" style={{ color: "var(--text-dim)" }}>
          Cancel
        </button>
      )}

      {/* trust note */}
      <div className="flex w-full max-w-sm items-start gap-2 text-left">
        <span className="mt-0.5 shrink-0" style={{ color: "var(--brand)" }}>
          {ShieldGlyph}
        </span>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          <span style={{ color: "var(--brand)" }}>BlackVault</span> does not store your
          passcode or private keys. You are the only one who can access your vault.
        </p>
      </div>
    </div>
  );
}

"use client";

// Full-screen biometric gate shown on app open while the lock is enabled.
// Tries the authenticator immediately; the button retries (Safari and some
// browsers want a user gesture before WebAuthn).

import { useEffect, useRef, useState } from "react";
import { verifyLock } from "@/lib/biometric-lock";

const FaceGlyph = (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M9 9.5v1M15 9.5v1M9.5 14.5c1.2 1 3.8 1 5 0" />
  </svg>
);

export function AppLock({ onUnlock, onCancel }: { onUnlock: () => void; onCancel?: () => void }) {
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);

  async function attempt() {
    const ok = await verifyLock();
    if (ok) onUnlock();
    else setFailed(true);
  }

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-5 px-8"
      style={{ background: "var(--bg)", backgroundImage: "var(--bg-sheen)", backgroundRepeat: "no-repeat" }}
    >
      <span
        className="flex h-20 w-20 items-center justify-center"
        style={{
          background: "rgba(216,180,94,0.10)",
          border: "1px solid rgba(216,180,94,0.35)",
          borderRadius: "var(--r-pill)",
          color: "var(--brand)",
        }}
      >
        {FaceGlyph}
      </span>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Vault locked</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
          {failed ? "Verification failed — try again." : "Confirm it's you to open your vault."}
        </p>
      </div>
      <button
        onClick={attempt}
        className="bv-press h-12 w-full max-w-xs text-sm font-semibold"
        style={{
          background: "var(--brand-gradient)",
          color: "var(--cta-text)",
          borderRadius: "var(--r-pill)",
        }}
      >
        Unlock with Face ID
      </button>
      {onCancel && (
        <button
          onClick={onCancel}
          className="bv-press h-10 text-sm font-medium"
          style={{ color: "var(--text-dim)" }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

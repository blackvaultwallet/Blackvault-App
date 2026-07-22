"use client";

import { usePrivy, useMfaEnrollment } from "@privy-io/react-auth";
import { useVaultWallet } from "@/lib/wallet";

export function SecurityCard() {
  const { isConnected } = useVaultWallet();
  const { user } = usePrivy();
  const { showMfaEnrollmentModal } = useMfaEnrollment();

  if (!isConnected) return null;

  const methods = user?.mfaMethods ?? [];
  const enrolled = methods.length > 0;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">Security</p>
      <p className="mt-2 text-sm text-muted">
        {enrolled
          ? `2FA active: ${methods.join(", ")}. Wallet actions require a code.`
          : "Add a second factor (authenticator app or passkey) to protect wallet actions."}
      </p>
      <button
        onClick={showMfaEnrollmentModal}
        className={
          enrolled
            ? "mt-3 rounded-lg border border-white/10 px-4 py-2 text-sm text-muted transition hover:border-accent/40"
            : "mt-3 h-10 rounded-lg bg-accent px-5 text-sm font-medium text-black transition hover:opacity-90"
        }
      >
        {enrolled ? "Manage 2FA" : "Enable 2FA"}
      </button>
    </div>
  );
}

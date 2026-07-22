// Pure validation logic, kept free of browser SDK imports so it runs under vitest.

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const FEE_BUFFER_SOL = 0.01;

export type DepositValidation =
  | { ok: true; lamports: bigint }
  | { ok: false; reason: string };

export function validateDepositSol(
  amountSol: number,
  publicBalanceSol: number
): DepositValidation {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    return { ok: false, reason: "Invalid amount." };
  }
  const max = publicBalanceSol - FEE_BUFFER_SOL;
  if (amountSol > max) {
    return {
      ok: false,
      reason: `Maximum ${Math.max(0, max).toFixed(3)} SOL (keep ${FEE_BUFFER_SOL} for fees).`,
    };
  }
  const lamports = BigInt(Math.round(amountSol * LAMPORTS_PER_SOL));
  return { ok: true, lamports };
}

export function validateWithdrawSol(
  amountSol: number,
  privateBalanceSol: number
): DepositValidation {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    return { ok: false, reason: "Invalid amount." };
  }
  if (amountSol > privateBalanceSol) {
    return {
      ok: false,
      reason: `Maximum ${privateBalanceSol} SOL (private balance).`,
    };
  }
  const lamports = BigInt(Math.round(amountSol * LAMPORTS_PER_SOL));
  return { ok: true, lamports };
}

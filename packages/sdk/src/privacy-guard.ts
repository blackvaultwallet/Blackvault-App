export interface GuardResult {
  warnings: string[];
}

const ROUND_STEP = 0.1;
const CORRELATION_TOLERANCE = 0.05;
const MIN_MINUTES_AFTER_DEPOSIT = 10;

function isRound(amountSol: number): boolean {
  const ratio = amountSol / ROUND_STEP;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

export function guardDeposit({ amountSol }: { amountSol: number }): GuardResult {
  const warnings: string[] = [];
  if (!Number.isFinite(amountSol) || amountSol <= 0) return { warnings };

  if (!isRound(amountSol)) {
    warnings.push(
      "Odd amounts are easier to fingerprint on-chain — round amounts (0.1, 0.5, 1) blend in better."
    );
  }
  return { warnings };
}

export function guardWithdraw({
  amountSol,
  lastDepositSol,
  minutesSinceDeposit,
}: {
  amountSol: number;
  lastDepositSol?: number;
  minutesSinceDeposit?: number;
}): GuardResult {
  const warnings: string[] = [];
  if (!Number.isFinite(amountSol) || amountSol <= 0) return { warnings };

  if (!isRound(amountSol)) {
    warnings.push(
      "Odd amounts are easier to fingerprint on-chain — round amounts blend in better."
    );
  }

  if (lastDepositSol && lastDepositSol > 0) {
    const diff = Math.abs(amountSol - lastDepositSol) / lastDepositSol;
    if (diff <= CORRELATION_TOLERANCE) {
      warnings.push(
        "Amount matches your last deposit — observers can correlate the two. Withdraw a different amount or split it."
      );
    }
  }

  if (
    minutesSinceDeposit !== undefined &&
    minutesSinceDeposit >= 0 &&
    minutesSinceDeposit < MIN_MINUTES_AFTER_DEPOSIT
  ) {
    warnings.push(
      "Withdrawing this soon after a deposit links them in time — waiting longer breaks the correlation."
    );
  }

  return { warnings };
}

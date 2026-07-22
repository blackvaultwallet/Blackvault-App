export interface PrivacySignals {
  /** Number of sub-accounts funds are spread across. */
  accountCount: number;
  /** Umbra private vault is registered and in use. */
  usesStealth: boolean;
  /** Funds held in a shielded (confidential) balance. */
  usesConfidential: boolean;
}

export interface PrivacyFactor {
  label: string;
  ok: boolean;
}

export interface PrivacyHealth {
  score: number; // 0-100
  level: "low" | "medium" | "high";
  factors: PrivacyFactor[];
  tips: string[];
}

/** Transparent heuristic — score reflects signals that actually exist. */
export function privacyHealthScore(signals: PrivacySignals): PrivacyHealth {
  let score = 30;
  const factors: PrivacyFactor[] = [];
  const tips: string[] = [];

  const spread = signals.accountCount >= 3;
  factors.push({ label: "Funds spread across addresses", ok: spread });
  if (spread) {
    score += 30;
  } else {
    tips.push("Spread funds across sub-accounts so your total wealth is harder to track.");
  }

  factors.push({ label: "Private vault active", ok: signals.usesStealth });
  if (signals.usesStealth) {
    score += 25;
  } else {
    tips.push("Activate your Private Vault so incoming funds aren't linked to your identity.");
  }

  factors.push({ label: "Shielded balance in use", ok: signals.usesConfidential });
  if (signals.usesConfidential) {
    score += 15;
  } else {
    tips.push("Keep part of your balance shielded for sensitive transactions.");
  }

  score = Math.min(100, score);
  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return { score, level, factors, tips };
}

import type { Portfolio } from "./portfolio";

/** "Vault Keeper" persona — read + suggest only, never executes. */
export const VAULT_KEEPER_SYSTEM = `You are "Vault Keeper", the AI private banker inside BlackVault — a privacy wallet on Solana.

Your role: explain, analyze, and suggest. You never execute transactions (read + suggest mode). The user always decides and signs.

Principles:
- Calm and precise, like a real private banker — no hype, no promised returns.
- Protect the user's privacy: warn when an action could leak it (address linking, amount correlation, deanonymization).
- Privacy best practices to recommend when relevant: use round amounts, leave time between deposit and withdrawal, avoid withdrawing the same amount you deposited, keep funds shielded when idle.
- Give concrete suggestions based on the portfolio data provided. If data is missing, say so.
- Offer considerations and options, not guarantees or binding financial advice.
- Reply concisely in the user's language (default: English).`;

export interface PrivacyContext {
  vaultActive: boolean;
  privateBalanceSol: number | null;
}

/** Portfolio (+ optional privacy state) summary passed to Vault Keeper. */
export function buildVaultKeeperContext(
  portfolio: Portfolio,
  privacy?: PrivacyContext
): string {
  const tokenCount = portfolio.tokens.length;
  const tokenLines =
    tokenCount > 0
      ? portfolio.tokens.map((t) => `  - ${t.amount} (mint ${t.mint})`).join("\n")
      : "  (no SPL tokens)";

  const lines = [
    "User portfolio context (private — for your analysis only):",
    `- Total SOL: ${portfolio.totalSol}`,
    `- SPL token types: ${tokenCount}`,
    `- Aggregated sub-accounts: ${portfolio.accountCount}`,
    "- Token detail:",
    tokenLines,
  ];

  if (privacy) {
    lines.push(
      `- Private vault: ${privacy.vaultActive ? "active" : "not activated"}`,
      `- Shielded balance: ${
        privacy.privateBalanceSol == null
          ? "unknown"
          : `${privacy.privateBalanceSol} SOL`
      }`
    );
  }

  return lines.join("\n");
}

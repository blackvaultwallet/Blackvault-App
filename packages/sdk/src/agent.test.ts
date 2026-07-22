import { describe, it, expect } from "vitest";
import { buildVaultKeeperContext, VAULT_KEEPER_SYSTEM } from "./agent";
import type { Portfolio } from "./portfolio";

const portfolio: Portfolio = {
  totalSol: 3.5,
  tokens: [{ mint: "USDC", amount: 150, decimals: 6 }],
  accountCount: 2,
};

describe("buildVaultKeeperContext", () => {
  it("summarizes total SOL and tokens", () => {
    const ctx = buildVaultKeeperContext(portfolio);
    expect(ctx).toContain("3.5");
    expect(ctx).toContain("SOL");
    expect(ctx).toContain("USDC");
  });

  it("includes privacy state when provided", () => {
    const ctx = buildVaultKeeperContext(portfolio, {
      vaultActive: true,
      privateBalanceSol: 0.5,
    });
    expect(ctx).toContain("active");
    expect(ctx).toContain("0.5 SOL");
  });

  it("stays backward-compatible without privacy arg", () => {
    const ctx = buildVaultKeeperContext(portfolio);
    expect(ctx).not.toContain("Private vault");
  });
});

describe("VAULT_KEEPER_SYSTEM", () => {
  it("defines the read+suggest persona", () => {
    expect(VAULT_KEEPER_SYSTEM.toLowerCase()).toContain("vault keeper");
    expect(VAULT_KEEPER_SYSTEM.toLowerCase()).toContain("suggest");
  });
});

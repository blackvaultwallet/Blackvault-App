import { describe, it, expect } from "vitest";
import { aggregatePortfolio, type AccountSnapshot } from "./portfolio";

describe("aggregatePortfolio", () => {
  it("sums SOL across accounts and merges tokens per mint", () => {
    const accounts: AccountSnapshot[] = [
      { address: "A", sol: 1.5, tokens: [{ mint: "USDC", amount: 100, decimals: 6 }] },
      { address: "B", sol: 2.0, tokens: [{ mint: "USDC", amount: 50, decimals: 6 }] },
    ];

    const result = aggregatePortfolio(accounts);

    expect(result.totalSol).toBe(3.5);
    expect(result.accountCount).toBe(2);
    expect(result.tokens).toEqual([{ mint: "USDC", amount: 150, decimals: 6 }]);
  });

  it("returns an empty portfolio for empty input", () => {
    const result = aggregatePortfolio([]);
    expect(result.totalSol).toBe(0);
    expect(result.tokens).toEqual([]);
    expect(result.accountCount).toBe(0);
  });
});

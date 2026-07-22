import { describe, it, expect } from "vitest";
import { getPortfolio } from "./get-portfolio";
import type { Connection } from "@solana/web3.js";

describe("getPortfolio", () => {
  it("fetches and aggregates balances across addresses", async () => {
    const mock = {
      getBalance: async () => 1_000_000_000, // 1 SOL each
      getParsedTokenAccountsByOwner: async () => ({ value: [] }),
    } as unknown as Connection;

    const addresses = [
      "11111111111111111111111111111111",
      "So11111111111111111111111111111111111111112",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ];
    const portfolio = await getPortfolio(mock, addresses);

    expect(portfolio.totalSol).toBe(3);
    expect(portfolio.accountCount).toBe(3);
    expect(portfolio.tokens).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { fetchSolBalance, fetchTokenBalances } from "./balances";
import type { Connection } from "@solana/web3.js";

const ADDR = "11111111111111111111111111111111";

describe("fetchSolBalance", () => {
  it("converts lamports to SOL", async () => {
    const mock = {
      getBalance: async () => 2_500_000_000, // 2.5 SOL
    } as unknown as Connection;

    const sol = await fetchSolBalance(mock, ADDR);
    expect(sol).toBe(2.5);
  });
});

describe("fetchTokenBalances", () => {
  it("maps parsed token accounts to TokenBalance", async () => {
    const mock = {
      getParsedTokenAccountsByOwner: async () => ({
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint: "USDCmint",
                    tokenAmount: { uiAmount: 42, decimals: 6 },
                  },
                },
              },
            },
          },
        ],
      }),
    } as unknown as Connection;

    const tokens = await fetchTokenBalances(mock, ADDR);
    expect(tokens).toEqual([{ mint: "USDCmint", amount: 42, decimals: 6 }]);
  });
});

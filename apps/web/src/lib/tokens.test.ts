import { describe, it, expect } from "vitest";
import { parseAmount, fromBaseUnits, availableTokens, findToken } from "./tokens";

describe("parseAmount", () => {
  it("parses whole and fractional amounts", () => {
    expect(parseAmount("1.5", 6)).toBe(1_500_000n);
    expect(parseAmount("0.000001", 6)).toBe(1n);
    expect(parseAmount("2", 9)).toBe(2_000_000_000n);
  });

  it("rejects invalid input", () => {
    expect(parseAmount("abc", 6)).toBeNull();
    expect(parseAmount("-1", 6)).toBeNull();
    expect(parseAmount("", 6)).toBeNull();
    expect(parseAmount("0", 6)).toBeNull();
    expect(parseAmount("1.2345678", 6)).toBeNull(); // too many decimals
  });
});

describe("fromBaseUnits", () => {
  it("converts back", () => {
    expect(fromBaseUnits(1_500_000n, 6)).toBe(1.5);
  });
});

describe("registry", () => {
  it("both stables available with 6 decimals", () => {
    expect(availableTokens().map((t) => t.symbol)).toEqual(["USDC", "USDT"]);
    expect(findToken("USDT")?.decimals).toBe(6);
  });
});

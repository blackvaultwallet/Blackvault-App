import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pin mainnet so the allowlist under test is the real one (USDG configured),
// and so storage keys are chain-scoped the way they are in production.
vi.stubEnv("NEXT_PUBLIC_EVM_NETWORK", "mainnet");

const {
  MAX_CUSTOM_TOKENS,
  addCustomToken,
  readCustomTokens,
  removeCustomToken,
  tokensFor,
} = await import("./custom-tokens");
const { USABLE_EVM_TOKENS } = await import("./tokens");

const OWNER = "0x4d883c37064FEbB056C94047aC3efacdAaDd9Ad4";
const OTHER = "0xb093c6e2d2E25F82067F8538208B3EE94cE5Def6";

// One of the four fake "USDG" contracts sitting in a real wallet on RH Chain:
// same symbol, same name() as Paxos', different address and decimals.
const FAKE_USDG = {
  address: "0x1383b43AeD527485F191b60060f5b5471F71B1ca",
  symbol: "USDG",
  decimals: 18,
  custom: true,
} as const;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryStorage() });
});
afterEach(() => vi.unstubAllGlobals());

describe("custom token store", () => {
  it("round-trips a token and appends it after the allowlist", () => {
    addCustomToken(OWNER, { ...FAKE_USDG });
    expect(readCustomTokens(OWNER)).toHaveLength(1);

    const list = tokensFor(OWNER);
    expect(list.slice(0, USABLE_EVM_TOKENS.length)).toEqual(USABLE_EVM_TOKENS);
    expect(list.at(-1)?.address).toBe(FAKE_USDG.address);
  });

  it("keeps each wallet's tokens separate", () => {
    addCustomToken(OWNER, { ...FAKE_USDG });
    expect(readCustomTokens(OTHER)).toEqual([]);
    expect(tokensFor(OTHER)).toEqual(USABLE_EVM_TOKENS);
  });

  it("returns the bare allowlist when there is no wallet", () => {
    expect(tokensFor(null)).toEqual(USABLE_EVM_TOKENS);
    expect(tokensFor(undefined)).toEqual(USABLE_EVM_TOKENS);
  });

  it("ignores a second add of the same address, in any casing", () => {
    addCustomToken(OWNER, { ...FAKE_USDG });
    const after = addCustomToken(OWNER, {
      ...FAKE_USDG,
      address: FAKE_USDG.address.toLowerCase(),
      symbol: "SPOOF",
    });
    expect(after).toHaveLength(1);
    expect(after[0]!.symbol).toBe("USDG");
  });

  it("removes by address regardless of casing", () => {
    addCustomToken(OWNER, { ...FAKE_USDG });
    expect(removeCustomToken(OWNER, FAKE_USDG.address.toUpperCase())).toEqual([]);
  });

  it("refuses to grow past the cap", () => {
    for (let i = 0; i < MAX_CUSTOM_TOKENS; i++) {
      addCustomToken(OWNER, {
        ...FAKE_USDG,
        address: `0x${String(i).padStart(40, "0")}`,
      });
    }
    expect(() => addCustomToken(OWNER, { ...FAKE_USDG })).toThrow(/at most/);
  });

  it("survives corrupted storage instead of taking the wallet down", () => {
    window.localStorage.setItem(`bv_tokens_4663_${OWNER.toLowerCase()}`, "not json");
    expect(readCustomTokens(OWNER)).toEqual([]);

    window.localStorage.setItem(
      `bv_tokens_4663_${OWNER.toLowerCase()}`,
      JSON.stringify([{ address: "0x1" }, FAKE_USDG])
    );
    expect(readCustomTokens(OWNER)).toEqual([FAKE_USDG]);
  });

  it("never lets a custom token be found by symbol", async () => {
    const { findEvmToken } = await import("./tokens");
    addCustomToken(OWNER, { ...FAKE_USDG });
    // The name-claim payment resolves USDG this way; a spoof must not win.
    expect(findEvmToken("USDG")?.address).toBe(
      "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
    );
  });
});

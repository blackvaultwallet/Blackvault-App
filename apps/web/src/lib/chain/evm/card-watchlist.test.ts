import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenRef } from "@/lib/chain/types";

vi.stubEnv("NEXT_PUBLIC_EVM_NETWORK", "mainnet");
const { MAX_CARDS, addCard, hasCard, readCards, removeCard, tokenKey } = await import(
  "./card-watchlist"
);

const OWNER = "0x4d883c37064FEbB056C94047aC3efacdAaDd9Ad4";

const ETH: TokenRef = { symbol: "ETH", decimals: 18, native: true };
const VAULT: TokenRef = { symbol: "VAULT", decimals: 18, address: "0xF387b73C" };
const USDG: TokenRef = { symbol: "USDG", decimals: 6, address: "0x5fc5360D" };
const MEME: TokenRef = { symbol: "MEME", decimals: 18, address: "0xAbCdEf01" };
const ALL = [VAULT, ETH, USDG, MEME];

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => vi.stubGlobal("window", { localStorage: memoryStorage() }));
afterEach(() => vi.unstubAllGlobals());

describe("card watchlist", () => {
  it("keys the native coin by symbol and everything else by address", () => {
    expect(tokenKey(ETH)).toBe("ETH");
    expect(tokenKey(VAULT)).toBe("0xf387b73c");
  });

  it("starts a fresh wallet on VAULT and ETH", () => {
    expect(readCards(OWNER, ALL)).toEqual([tokenKey(VAULT), "ETH"]);
  });

  it("only defaults to tokens that exist on this network", () => {
    // On testnet there is no VAULT, so it must not be conjured into the deck.
    expect(readCards(OWNER, [ETH, USDG])).toEqual(["ETH"]);
  });

  it("remembers an empty deck instead of re-seeding it", () => {
    removeCard(OWNER, ALL, VAULT);
    removeCard(OWNER, ALL, ETH);
    expect(readCards(OWNER, ALL)).toEqual([]);
  });

  it("adds and removes, and reports membership", () => {
    removeCard(OWNER, ALL, VAULT);
    expect(hasCard(OWNER, ALL, MEME)).toBe(false);
    addCard(OWNER, ALL, MEME);
    expect(hasCard(OWNER, ALL, MEME)).toBe(true);
    removeCard(OWNER, ALL, MEME);
    expect(hasCard(OWNER, ALL, MEME)).toBe(false);
  });

  it("ignores adding one that's already pinned", () => {
    expect(addCard(OWNER, ALL, ETH)).toHaveLength(2);
  });

  it("refuses a fourth card", () => {
    addCard(OWNER, ALL, USDG); // now VAULT, ETH, USDG = 3
    expect(readCards(OWNER, ALL)).toHaveLength(MAX_CARDS);
    expect(() => addCard(OWNER, ALL, MEME)).toThrow(/Max 3 cards/);
  });

  it("frees a slot when one is removed", () => {
    addCard(OWNER, ALL, USDG);
    removeCard(OWNER, ALL, ETH);
    expect(() => addCard(OWNER, ALL, MEME)).not.toThrow();
    expect(readCards(OWNER, ALL)).toEqual([tokenKey(VAULT), tokenKey(USDG), tokenKey(MEME)]);
  });

  it("falls back to defaults on corrupted storage", () => {
    window.localStorage.setItem(`bv_cards_4663_${OWNER.toLowerCase()}`, "{oops");
    expect(readCards(OWNER, ALL)).toEqual([tokenKey(VAULT), "ETH"]);
  });
});

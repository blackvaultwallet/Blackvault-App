// Which tokens get their own card in the portfolio deck, per wallet, per chain.
//
// The deck used to derive itself from balances, which meant it changed shape
// under the user. This makes it a choice instead: you pick what sits up there,
// and the cap keeps the deck swipeable rather than endless.

import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import type { TokenRef } from "@/lib/chain/types";

/** Cards besides the portfolio-total card, which is always first. */
export const MAX_CARDS = 3;

/** Stable identity for a token: its address, or the symbol for the native coin. */
export function tokenKey(t: TokenRef): string {
  return t.address?.toLowerCase() ?? t.symbol;
}

// Our token and the coin that pays for gas — the two worth seeing by default.
// A wallet that has never touched the list gets these; an explicit empty list
// is remembered as empty (hence the null check rather than a length check).
const DEFAULT_KEYS = ["VAULT", "ETH"];

const storageKey = (owner: string) =>
  `bv_cards_${ACTIVE_EVM_CHAIN.id}_${owner.toLowerCase()}`;

function defaults(tokens: TokenRef[]): string[] {
  return tokens
    .filter((t) => DEFAULT_KEYS.includes(t.symbol))
    .map(tokenKey)
    .slice(0, MAX_CARDS);
}

/**
 * Keys currently pinned to the deck. `tokens` supplies the defaults for a
 * wallet with no saved list — pass the usable token set for the network.
 */
export function readCards(owner: string, tokens: TokenRef[]): string[] {
  if (typeof window === "undefined") return defaults(tokens);
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (raw === null) return defaults(tokens);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults(tokens);
    return parsed.filter((k): k is string => typeof k === "string").slice(0, MAX_CARDS);
  } catch {
    return defaults(tokens);
  }
}

function write(owner: string, keys: string[]): string[] {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(owner), JSON.stringify(keys));
  }
  return keys;
}

export function hasCard(owner: string, tokens: TokenRef[], token: TokenRef): boolean {
  return readCards(owner, tokens).includes(tokenKey(token));
}

/** Throws when the deck is full — the caller surfaces that to the user. */
export function addCard(owner: string, tokens: TokenRef[], token: TokenRef): string[] {
  const current = readCards(owner, tokens);
  const key = tokenKey(token);
  if (current.includes(key)) return current;
  if (current.length >= MAX_CARDS) {
    throw new Error(`Max ${MAX_CARDS} cards — remove one first`);
  }
  return write(owner, [...current, key]);
}

export function removeCard(owner: string, tokens: TokenRef[], token: TokenRef): string[] {
  const key = tokenKey(token);
  return write(
    owner,
    readCards(owner, tokens).filter((k) => k !== key)
  );
}

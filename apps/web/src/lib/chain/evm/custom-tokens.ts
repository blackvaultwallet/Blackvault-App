// User-added ERC-20s, stored per wallet, per chain.
//
// Robinhood Chain is full of tokens that copy a real one's symbol AND its
// name() byte for byte — a single wallet here already holds four fake "USDG"
// contracts alongside the real one, all airdropped. So the app never lists a
// token on its own: EVM_TOKENS stays a short curated allowlist, and anything
// else has to be added deliberately by the user, by address.
//
// Two rules that follow from that, and matter more than they look:
//   1. Custom tokens are address-keyed only. They are deliberately kept out of
//      findEvmToken(), which resolves by SYMBOL and is what the name-claim
//      payment uses — a fake "USDG" must never be able to shadow the real one.
//   2. They carry `custom: true` so the UI can mark them as unverified. We are
//      not vouching for them; the user is.

import { createPublicClient, erc20Abi, getAddress, http } from "viem";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { USABLE_EVM_TOKENS } from "@/lib/chain/evm/tokens";
import type { TokenRef } from "@/lib/chain/types";

export interface CustomToken extends TokenRef {
  address: string;
  custom: true;
  /** Contract's name(). Optional — plenty of ERC-20s omit it. */
  name?: string;
}

// getBalances reads balanceOf per token in sequence against a rate-limited
// RPC, so an unbounded list would turn into 429s and a stalled home screen.
export const MAX_CUSTOM_TOKENS = 20;

// Own client rather than the adapter's: importing it back would make
// adapter -> custom-tokens -> adapter a cycle.
const client = createPublicClient({ chain: ACTIVE_EVM_CHAIN, transport: http() });

const storageKey = (owner: string) =>
  `bv_tokens_${ACTIVE_EVM_CHAIN.id}_${owner.toLowerCase()}`;

const sameAddress = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Addresses the app already ships — a user can't re-add one of these. */
function isAllowlisted(address: string): boolean {
  return USABLE_EVM_TOKENS.some((t) => sameAddress(t.address, address));
}

export function readCustomTokens(owner: string): CustomToken[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped rather than thrown: a corrupted entry must
    // not take the whole wallet's token list down with it.
    return parsed.filter(
      (t): t is CustomToken =>
        !!t &&
        typeof (t as CustomToken).address === "string" &&
        typeof (t as CustomToken).symbol === "string" &&
        Number.isInteger((t as CustomToken).decimals)
    );
  } catch {
    return [];
  }
}

function write(owner: string, tokens: CustomToken[]): CustomToken[] {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(owner), JSON.stringify(tokens));
  }
  return tokens;
}

export function addCustomToken(owner: string, token: CustomToken): CustomToken[] {
  const existing = readCustomTokens(owner);
  if (existing.some((t) => sameAddress(t.address, token.address))) return existing;
  if (existing.length >= MAX_CUSTOM_TOKENS) {
    throw new Error(`You can add at most ${MAX_CUSTOM_TOKENS} tokens`);
  }
  return write(owner, [...existing, token]);
}

export function removeCustomToken(owner: string, address: string): CustomToken[] {
  return write(
    owner,
    readCustomTokens(owner).filter((t) => !sameAddress(t.address, address))
  );
}

/** Curated allowlist plus this wallet's own additions. */
export function tokensFor(owner?: string | null): TokenRef[] {
  if (!owner) return USABLE_EVM_TOKENS;
  return [...USABLE_EVM_TOKENS, ...readCustomTokens(owner)];
}

/**
 * Reads a token's identity straight from its contract. Deliberately does NOT
 * try to judge whether the token is legitimate — it can't, and pretending
 * otherwise would be worse than saying nothing.
 */
export async function fetchTokenMeta(input: string): Promise<CustomToken> {
  let address: string;
  try {
    address = getAddress(input.trim());
  } catch {
    throw new Error("That doesn't look like a contract address");
  }
  if (isAllowlisted(address)) throw new Error("This token is already built in");

  const code = await client.getCode({ address: address as `0x${string}` });
  if (!code || code === "0x") throw new Error("No contract at this address");

  const read = { address: address as `0x${string}`, abi: erc20Abi } as const;
  let symbol: string;
  let decimals: number;
  try {
    [symbol, decimals] = await Promise.all([
      client.readContract({ ...read, functionName: "symbol" }),
      client.readContract({ ...read, functionName: "decimals" }),
    ]);
  } catch {
    throw new Error("This contract isn't an ERC-20 token");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("This token reports an invalid number of decimals");
  }

  // name() is optional in practice, so its absence must not fail the lookup.
  const name = await client
    .readContract({ ...read, functionName: "name" })
    .catch(() => undefined);

  return {
    address,
    symbol: symbol.slice(0, 12),
    decimals,
    custom: true,
    ...(name ? { name: name.slice(0, 40) } : {}),
  };
}

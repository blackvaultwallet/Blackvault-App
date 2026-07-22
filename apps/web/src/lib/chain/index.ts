// Chain selector. NEXT_PUBLIC_CHAIN picks the active adapter; Solana stays
// compiled but is the fallback until the EVM path is wired into the UI.

import type { WalletClient } from "viem";
import { getEvmAdapter } from "@/lib/chain/evm/adapter";
import type { ChainAdapter } from "@/lib/chain/types";

export const ACTIVE_CHAIN =
  (process.env.NEXT_PUBLIC_CHAIN as "robinhood" | "solana") ?? "solana";

export function isEvm(): boolean {
  return ACTIVE_CHAIN === "robinhood";
}

// EVM adapter needs a wallet client for writes; reads work without one.
export function getEvmChainAdapter(wallet?: WalletClient): ChainAdapter {
  return getEvmAdapter(wallet);
}

export type { ChainAdapter } from "@/lib/chain/types";

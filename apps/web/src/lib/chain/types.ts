// Chain-agnostic contract. UI and features depend on this, never on a chain
// SDK directly, so Solana ↔ EVM swaps behind NEXT_PUBLIC_CHAIN.

export type Stage = (message: string) => void;

export interface TokenRef {
  symbol: string;
  /** Contract address (EVM) or mint (Solana); undefined = native coin. */
  address?: string;
  decimals: number;
  native?: boolean;
}

export interface TokenBalance {
  token: TokenRef;
  /** Human amount (e.g. 3.6), already scaled by decimals. */
  amount: number;
  /** Base-unit amount (wei / lamports / token units). */
  raw: bigint;
}

export interface ChainAdapter {
  readonly chain: "evm" | "solana";
  /** Native + known token balances for an address. */
  getBalances(address: string): Promise<TokenBalance[]>;
  /** Send a token (or native coin) to a destination; returns tx id/hash. */
  send(token: TokenRef, to: string, amount: bigint, onStage?: Stage): Promise<string>;
  explorerTxUrl(id: string): string;
  explorerAddressUrl(address: string): string;
  /** Optional name resolution (ENS / .sol). */
  resolveName?(name: string): Promise<string>;
}

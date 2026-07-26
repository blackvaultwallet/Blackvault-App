// Shared token/stage types for the EVM adapter and UI.

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


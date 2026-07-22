// Protocol-neutral contract for the privacy layer. Components depend on this,
// not on any concrete protocol — swapping/adding rails must not touch UI.

export interface RailBalance {
  /** Amount in UI units (SOL, USDC, …), null when not readable yet. */
  amount: number | null;
  status: "ready" | "needs_conversion" | "none" | "uninitialized";
}

export interface RailNote {
  id: string;
  raw: unknown;
}

export type RailStage = (message: string) => void;

/** Asset moving through the rail. SOL = native (rail wraps as needed). */
export interface RailAsset {
  symbol: string; // "SOL" | "USDC" | "USDT"
  mint: string; // rail-side mint (wSOL / privateMint)
  decimals: number;
  isNative: boolean;
}

export interface PrivateRail {
  readonly name: string;
  register(onStage?: RailStage): Promise<void>;
  deposit(asset: RailAsset, units: bigint, onStage?: RailStage): Promise<void>;
  withdraw(asset: RailAsset, units: bigint, onStage?: RailStage): Promise<void>;
  sendPrivate(
    dest: string,
    asset: RailAsset,
    units: bigint,
    onStage?: RailStage
  ): Promise<void>;
  scanIncoming(): Promise<RailNote[]>;
  /** Claims notes one by one; a poisoned note must not block the rest. */
  claim(notes: RailNote[], onStage?: RailStage): Promise<{ claimed: number; failed: number }>;
  getPrivateBalance(asset: RailAsset): Promise<RailBalance>;
}

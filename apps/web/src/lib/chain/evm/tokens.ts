import type { TokenRef } from "@/lib/chain/types";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";

export const ETH: TokenRef = { symbol: "ETH", decimals: 18, native: true };

// Robinhood testnet ERC-20s, verified on-chain 2026-07-15 (Alchemy metadata +
// totalSupply). USDG has several look-alike deployments; we use "Test Global
// Dollar" 0x732e…176ee because on testnet it's the most-used one AND has an open
// mint(), so the dev faucet can hand you some. The exact-name "Global Dollar"
// proxy 0x7e95…802f is DEX-traded but not mintable. Mainnet USDG differs — fill
// these when we flip NEXT_PUBLIC_CHAIN.
const TESTNET_ADDR = {
  USDG: "0x732e879f6b873d40383c979b091fe6c3995176ee",
  USDC: "0xbf4479c07dc6fdc6daa764a0cca06969e894275f",
  USDT: "0xd7153050549f4c6d0a52ab0d1a9a2129f0d1bbcb",
};

// Mainnet canonical deployments, verified on-chain 2026-07-22 (symbol/decimals
// via eth_call, Paxos issuance, 28k+ holders). USDC/USDT have NO canonical
// mainnet deployment on RH (the bridge converts USDC to USDG) — only
// look-alikes with tiny holder counts, so they stay unset and filtered out.
const MAINNET_ADDR: Partial<Record<"USDG" | "USDC" | "USDT", string>> = {
  USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
};

const onTestnet = ACTIVE_EVM_CHAIN.testnet ?? false;
// trim(): dashboard-pasted env values can carry stray newlines.
const addr = (env: string | undefined, sym: "USDG" | "USDC" | "USDT") =>
  env?.trim() ?? (onTestnet ? TESTNET_ADDR[sym] : MAINNET_ADDR[sym]);

export const EVM_TOKENS: TokenRef[] = [
  ETH,
  { symbol: "USDG", decimals: 6, address: addr(process.env.NEXT_PUBLIC_USDG_ADDR, "USDG") },
  { symbol: "USDC", decimals: 18, address: addr(process.env.NEXT_PUBLIC_USDC_ADDR, "USDC") },
  { symbol: "USDT", decimals: 6, address: addr(process.env.NEXT_PUBLIC_USDT_ADDR, "USDT") },
];

// Tokens we can actually transact: the native coin, or an ERC-20 whose address
// is configured (env override or a testnet default above).
export const USABLE_EVM_TOKENS: TokenRef[] = EVM_TOKENS.filter(
  (t) => t.native || !!t.address
);

export function findEvmToken(symbol: string): TokenRef | undefined {
  return EVM_TOKENS.find((t) => t.symbol === symbol);
}

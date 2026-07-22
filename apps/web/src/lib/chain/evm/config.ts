// Robinhood Chain (Arbitrum Orbit L2) config. Testnet-first for the build.

import { defineChain } from "viem";

// Real provider endpoints — the server-side truth the RPC proxy forwards to.
// `EVM_RPC_URL` is server-only (kept out of the client bundle); it falls back to
// the public var, then a sane default.
// trim(): dashboard-pasted env values can carry stray whitespace/newlines.
const TESTNET_TARGET = (
  process.env.EVM_RPC_URL ??
  process.env.NEXT_PUBLIC_EVM_RPC ??
  "https://rpc.testnet.chain.robinhood.com"
).trim();
const MAINNET_TARGET = (
  process.env.EVM_MAINNET_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"
).trim();

// In the browser, route RPC through our same-origin proxy (/api/rpc/evm) so the
// provider sees the server's IP, not the user's. On the server (SSR + the proxy
// itself) hit the provider directly.
function rpc(realUrl: string): string {
  if (typeof window !== "undefined") return `${window.location.origin}/api/rpc/evm`;
  return realUrl;
}

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc(TESTNET_TARGET)] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc(MAINNET_TARGET)] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

const isMainnet = process.env.NEXT_PUBLIC_EVM_NETWORK === "mainnet";

// Build targets testnet until P4 promotes to mainnet.
export const ACTIVE_EVM_CHAIN = isMainnet ? robinhoodMainnet : robinhoodTestnet;

// The real endpoint the proxy route forwards to for the active network.
export const ACTIVE_EVM_RPC_TARGET = isMainnet ? MAINNET_TARGET : TESTNET_TARGET;

// Optional dedicated endpoint for eth_getLogs. Mainnet pairs a full-featured
// provider (Alchemy — 10-block getLogs cap on free tier) with Blockscout's
// eth-rpc, which allows 10k-block ranges for free; the proxy routes getLogs
// there so stealth scanning keeps its wide window. Unset → same as main target.
export const ACTIVE_EVM_LOGS_TARGET = (
  process.env.EVM_LOGS_RPC_URL ?? ACTIVE_EVM_RPC_TARGET
).trim();

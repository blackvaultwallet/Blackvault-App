"use client";

// ENS name resolution. ENS lives on Ethereum mainnet, so we resolve against a
// mainnet RPC — viem handles CCIP-Read, so offchain subnames (e.g. our
// `name.blackvault.eth` issued via NameStone) resolve the same as any `.eth`.
// EVM addresses are chain-agnostic, so the resolved 0x works on Robinhood Chain.

import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// In the browser, resolve via our same-origin proxy so the ENS provider sees
// the server IP, not the user's IP + the names they look up. On the server, hit
// the provider directly.
function ensRpc(): string {
  if (typeof window !== "undefined") return `${window.location.origin}/api/rpc/ens`;
  return process.env.ENS_RPC_URL ?? process.env.NEXT_PUBLIC_ENS_RPC ?? "https://cloudflare-eth.com";
}
const ensClient = createPublicClient({ chain: mainnet, transport: http(ensRpc()) });

/** True for anything that looks like an ENS name (has a dot; not a 0x address). */
export function isEnsName(s: string): boolean {
  const v = s.trim();
  return !v.startsWith("0x") && v.includes(".") && v.length > 2;
}

const NAMES_PARENT =
  process.env.NEXT_PUBLIC_NAMES_PARENT ?? process.env.NEXT_PUBLIC_ENS_PARENT ?? "blackvaultwallet.eth";

/** Resolve an ENS name to an address, or null if it doesn't resolve. */
export async function resolveEnsName(name: string): Promise<Address | null> {
  const n = name.trim();
  // Our own subnames resolve in-app immediately (before the mainnet CCIP-Read
  // gateway is live). Once deployed, the same name also resolves via ENS below.
  if (n.toLowerCase().endsWith("." + NAMES_PARENT.toLowerCase())) {
    try {
      const r = await fetch(`/api/names/resolve?name=${encodeURIComponent(n)}`);
      const d = (await r.json()) as { address?: string | null };
      if (d.address) return d.address as Address;
    } catch {
      /* fall through to ENS */
    }
  }
  try {
    return await ensClient.getEnsAddress({ name: normalize(n) });
  } catch {
    return null;
  }
}

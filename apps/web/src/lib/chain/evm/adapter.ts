// EVM ChainAdapter over viem. Reads via a public client; writes via a wallet
// client passed in from the Privy-backed signer (lib/chain/evm/wallet.ts).

import {
  createPublicClient,
  http,
  erc20Abi,
  parseAbi,
  getAddress,
  type WalletClient,
  type Address,
} from "viem";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { EVM_TOKENS } from "@/lib/chain/evm/tokens";
import type { ChainAdapter, Stage, TokenBalance, TokenRef } from "@/lib/chain/types";

const publicClient = createPublicClient({
  chain: ACTIVE_EVM_CHAIN,
  transport: http(),
});

function toHuman(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

// RH testnet RPC is occasionally flaky — retry reads a couple times.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

export class EvmAdapter implements ChainAdapter {
  readonly chain = "evm" as const;

  constructor(private wallet?: WalletClient) {}

  async getBalances(address: string): Promise<TokenBalance[]> {
    const owner = getAddress(address);
    const out: TokenBalance[] = [];

    // Native balance: retried, and errors propagate (a flaky read must not
    // silently show 0).
    const nativeToken = EVM_TOKENS.find((t) => t.native)!;
    const nativeRaw = await withRetry(() =>
      publicClient.getBalance({ address: owner })
    );
    out.push({
      token: nativeToken,
      raw: nativeRaw,
      amount: toHuman(nativeRaw, nativeToken.decimals),
    });

    // ERC-20s: skip individually if the token isn't deployed on this network.
    for (const token of EVM_TOKENS) {
      if (token.native || !token.address) continue;
      try {
        const raw = await publicClient.readContract({
          address: getAddress(token.address),
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        });
        out.push({ token, raw, amount: toHuman(raw, token.decimals) });
      } catch {
        // token unavailable — skip
      }
    }
    return out;
  }

  async send(
    token: TokenRef,
    to: string,
    amount: bigint,
    onStage?: Stage
  ): Promise<string> {
    if (!this.wallet?.account) throw new Error("Wallet not connected");
    const account = this.wallet.account;
    const dest = getAddress(to) as Address;

    onStage?.("Submitting transaction…");
    if (token.native) {
      return this.wallet.sendTransaction({
        account,
        chain: ACTIVE_EVM_CHAIN,
        to: dest,
        value: amount,
      });
    }
    if (!token.address) throw new Error("Token address missing");
    return this.wallet.writeContract({
      account,
      chain: ACTIVE_EVM_CHAIN,
      address: getAddress(token.address),
      abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
      functionName: "transfer",
      args: [dest, amount],
    });
  }

  explorerTxUrl(hash: string): string {
    return `${ACTIVE_EVM_CHAIN.blockExplorers!.default.url}/tx/${hash}`;
  }
  explorerAddressUrl(address: string): string {
    return `${ACTIVE_EVM_CHAIN.blockExplorers!.default.url}/address/${address}`;
  }
}

export function getEvmAdapter(wallet?: WalletClient): EvmAdapter {
  return new EvmAdapter(wallet);
}

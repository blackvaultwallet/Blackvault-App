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
import { ETH } from "@/lib/chain/evm/tokens";
import { tokensFor } from "@/lib/chain/evm/custom-tokens";
import { withRetry } from "@/lib/chain/evm/async-util";
import type { Stage, TokenBalance, TokenRef } from "@/lib/chain/types";

const publicClient = createPublicClient({
  chain: ACTIVE_EVM_CHAIN,
  transport: http(),
});

function toHuman(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

export class EvmAdapter {
  constructor(private wallet?: WalletClient) {}

  async getBalances(address: string): Promise<TokenBalance[]> {
    const owner = getAddress(address);
    const out: TokenBalance[] = [];

    // Native balance: retried, and errors propagate (a flaky read must not
    // silently show 0).
    const nativeRaw = await withRetry(() =>
      publicClient.getBalance({ address: owner })
    );
    out.push({
      token: ETH,
      raw: nativeRaw,
      amount: toHuman(nativeRaw, ETH.decimals),
    });

    // Curated allowlist + whatever this wallet added by hand. Skip individually
    // if the token isn't deployed on this network.
    for (const token of tokensFor(address)) {
      if (token.native || !token.address) continue;
      try {
        // Retried: the mainnet Blockscout endpoint drops calls intermittently,
        // and without this a held token just vanishes from the list. Kept short
        // so a token that genuinely isn't deployed still fails quickly.
        const raw = await withRetry(
          () =>
            publicClient.readContract({
              address: getAddress(token.address!),
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [owner],
            }),
          3
        );
        out.push({ token, raw, amount: toHuman(raw, token.decimals) });
      } catch {
        // token unavailable on this network — skip
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

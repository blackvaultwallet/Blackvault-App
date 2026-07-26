"use client";

// Account abstraction (P2): ERC-4337 smart account owned by the Privy EOA, with
// a Pimlico paymaster sponsoring gas. Gas payer = paymaster, not the user.
//
// NOTE: we first tried EIP-7702 (same address as the EOA) but Privy embedded
// wallets can't sign the 7702 authorization yet. A standard smart account works
// (Privy only signs userOp hashes) — it just has its own address.

import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint08Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";

const KEY = process.env.NEXT_PUBLIC_PIMLICO_KEY ?? "";
const PIMLICO_URL = `https://api.pimlico.io/v2/${ACTIVE_EVM_CHAIN.id}/rpc?apikey=${KEY}`;

const publicClient = createPublicClient({ chain: ACTIVE_EVM_CHAIN, transport: http() });

export function aaConfigured(): boolean {
  return KEY.length > 0;
}

/**
 * Sweep an ERC-20 out of a stealth address with sponsored gas (EIP-7702): the
 * stealth EOA — whose raw key we hold — delegates to a smart account for one
 * userOp, and Pimlico's paymaster pays the gas. No ETH needed at the stealth
 * address or the recipient's wallet, so a stablecoin-only user can still claim.
 */
export async function sweepStealthTokenGasless(
  stealthPrivKey: Hex,
  token: Address,
  to: string,
  onStage?: (m: string) => void
): Promise<string> {
  if (!aaConfigured()) throw new Error("Pimlico key not configured");
  onStage?.("Preparing sponsored claim…");
  const owner = privateKeyToAccount(stealthPrivKey);
  const pimlico = createPimlicoClient({
    transport: http(PIMLICO_URL),
    entryPoint: { address: entryPoint08Address, version: "0.8" },
  });
  const account = await to7702SimpleSmartAccount({
    client: publicClient,
    owner,
    entryPoint: { address: entryPoint08Address, version: "0.8" },
  });
  // A 7702 account lives at the EOA's own address — i.e. the stealth address.
  const bal = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (bal === 0n) throw new Error("No token balance to sweep");

  const sc = createSmartAccountClient({
    account,
    chain: ACTIVE_EVM_CHAIN,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: pimlico,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast,
    },
  });
  onStage?.("Claiming (gas sponsored)…");
  return sc.sendTransaction({
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [getAddress(to), bal],
    }),
  });
}

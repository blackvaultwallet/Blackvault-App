// Funding a Robinhood Chain wallet from another chain, via Relay.
//
// Named "funding" not "deposit" on purpose: PrivateRail.deposit already means
// shielding an amount into a privacy pool (lib/rail.ts), which is a different
// thing entirely.
//
// Why not the canonical Orbit bridge: RH Chain's L1 bridge lives on Ethereum and
// a hop costs L1 gas plus ~10-15 minutes. Relay fills the same route in ~3s for
// a few cents, and it's a REST API — no contracts, no SDK. Verified against the
// live API 2026-07-30 (Base/Ethereum/Arbitrum -> 4663 all quote fine).
//
// Privacy note: the relayer sees origin address -> destination address. Funds
// land in the user's PUBLIC wallet, so this is no worse than the existing model
// (stealth only starts once funds are in) — but it is not a private deposit.

import {
  createPublicClient,
  custom,
  getAddress,
  type Address,
  type Chain,
  type Hex,
  type WalletClient,
} from "viem";
import { arbitrum, base, mainnet } from "viem/chains";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { findEvmToken } from "@/lib/chain/evm/tokens";
import type { Stage } from "@/lib/chain/types";

const RELAY_API = "https://api.relay.link";
/** Relay's sentinel for a chain's native coin. */
const NATIVE: Address = "0x0000000000000000000000000000000000000000";

export interface FundingOrigin {
  chain: Chain;
  /** Canonical USDC — the asset on-ramps typically deliver. */
  usdc: Address;
}

// Base first: it's the cheapest origin to sign on (~$0.001 gas vs dollars on
// mainnet), so it's the one to point the Privy funding flow at.
export const FUNDING_ORIGINS: FundingOrigin[] = [
  { chain: base, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { chain: mainnet, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { chain: arbitrum, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
];

/** What the user pays with on the origin chain. */
export type FundingAsset = "ETH" | "USDC";

/**
 * What lands on Robinhood Chain. ETH is the default because it doubles as gas:
 * a wallet that receives only USDG has a balance it cannot move, and there's no
 * in-app swap to get out of that. Picking USDG turns on Relay's gas top-up so
 * some ETH arrives too — see `gasTopupUsd`, it isn't free.
 */
export type FundingDestination = "ETH" | "USDG";

// Relay routes to Robinhood mainnet (4663) but not the testnet (46630) —
// confirmed against /chains. UI should hide the funding entry point when false
// rather than let the user hit an opaque Relay 400.
export const FUNDING_SUPPORTED = !(ACTIVE_EVM_CHAIN.testnet ?? false);

interface RelayTx {
  to: Address;
  data: Hex;
  value: string;
  chainId: number;
}

interface RelayStep {
  id: string;
  description?: string;
  items?: { data: RelayTx; check?: { endpoint: string } }[];
}

export interface FundingQuote {
  /** Amount arriving, already scaled (e.g. "0.0131"). */
  outFormatted: string;
  outSymbol: string;
  outUsd: string;
  inUsd: string;
  feeUsd: string;
  /**
   * USD of destination ETH bundled in as gas, when funding a token. Relay sets
   * the size (~$2), which is generous for an L2 — on a small transfer it's a
   * real slice of the value, so show it.
   */
  gasTopupUsd?: string;
  etaSeconds: number;
  /** How many wallet signatures this will ask for (approve + deposit = 2). */
  txCount: number;
  steps: RelayStep[];
  /** Relay path to poll once the last tx is in, e.g. "/intents/status?...". */
  statusPath?: string;
}

async function relay<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${RELAY_API}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // Relay puts the useful part in the body; the status alone says nothing.
    throw new Error(`Relay ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function destinationCurrency(dest: FundingDestination): Address {
  if (dest === "ETH") return NATIVE;
  const usdg = findEvmToken("USDG")?.address;
  if (!usdg) throw new Error("USDG is not configured on this network");
  return getAddress(usdg);
}

/**
 * Where a payout lands. Deliberately loose about the address: Relay routes to
 * Solana too, and a Solana address is base58, not a checksummed 0x string.
 */
export interface PayoutTarget {
  chainId: number;
  /** Token address, Solana mint, or the native sentinel. */
  currency: string;
  recipient: string;
}

/** One Relay quote. Both public helpers below are thin wrappers over this. */
async function quote(params: {
  user: string;
  recipient: string;
  originChainId: number;
  originCurrency: string;
  destinationChainId: number;
  destinationCurrency: string;
  amount: bigint;
  topupGas: boolean;
}): Promise<FundingQuote> {
  if (!FUNDING_SUPPORTED) {
    throw new Error("Funding needs mainnet — Relay does not route to Robinhood testnet");
  }
  const q = await relay<{
    steps: RelayStep[];
    fees: { relayer?: { amountUsd?: string } };
    details: {
      currencyIn: { amountUsd: string };
      currencyOut: {
        amountFormatted: string;
        amountUsd: string;
        currency: { symbol: string };
      };
      currencyGasTopup?: { amountUsd: string };
      timeEstimate: number;
    };
  }>("/quote", {
    ...params,
    amount: params.amount.toString(),
    tradeType: "EXACT_INPUT",
  });

  const steps = q.steps ?? [];
  return {
    outFormatted: q.details.currencyOut.amountFormatted,
    outSymbol: q.details.currencyOut.currency.symbol,
    outUsd: q.details.currencyOut.amountUsd,
    inUsd: q.details.currencyIn.amountUsd,
    feeUsd: q.fees.relayer?.amountUsd ?? "0",
    gasTopupUsd: q.details.currencyGasTopup?.amountUsd,
    etaSeconds: q.details.timeEstimate,
    txCount: steps.reduce((n, s) => n + (s.items?.length ?? 0), 0),
    steps,
    statusPath: steps.flatMap((s) => s.items ?? []).at(-1)?.check?.endpoint,
  };
}

/** Money in: another chain → this wallet on Robinhood Chain. */
export async function getFundingQuote(opts: {
  user: string;
  origin: FundingOrigin;
  asset: FundingAsset;
  /** Base units of the origin asset (wei for ETH, 6-dec for USDC). */
  amount: bigint;
  /** Defaults to ETH — see FundingDestination. */
  destination?: FundingDestination;
}): Promise<FundingQuote> {
  const user = getAddress(opts.user);
  const destination = opts.destination ?? "ETH";
  return quote({
    user,
    recipient: user,
    originChainId: opts.origin.chain.id,
    originCurrency: opts.asset === "ETH" ? NATIVE : opts.origin.usdc,
    destinationChainId: ACTIVE_EVM_CHAIN.id,
    destinationCurrency: destinationCurrency(destination),
    amount: opts.amount,
    // A token-only fill leaves a fresh wallet with no gas; ETH needs no topup.
    topupGas: destination !== "ETH",
  });
}

/**
 * Money out: this wallet on Robinhood Chain → an address anywhere Relay reaches.
 * Card providers hand you a deposit address on their own rail (Kripicard's is
 * USDT on Solana), so the recipient here is theirs, not the user's — and no gas
 * top-up, because nobody is going to transact from it.
 */
export async function getPayoutQuote(opts: {
  user: string;
  /** What's being spent on Robinhood Chain. */
  from: FundingDestination;
  amount: bigint;
  to: PayoutTarget;
}): Promise<FundingQuote> {
  return quote({
    user: getAddress(opts.user),
    recipient: opts.to.recipient,
    originChainId: ACTIVE_EVM_CHAIN.id,
    originCurrency: destinationCurrency(opts.from),
    destinationChainId: opts.to.chainId,
    destinationCurrency: opts.to.currency,
    amount: opts.amount,
    topupGas: false,
  });
}

/** Terminal states from Relay's /intents/status. */
const DONE = new Set(["success", "failure", "refund"]);

async function waitForFill(path: string, onStage?: Stage): Promise<string> {
  // Relay quotes ~3s; poll for two minutes before giving up. A timeout here
  // means "we stopped watching", not "the funds are lost" — the intent is
  // already on-chain, so say so rather than implying failure.
  for (let i = 0; i < 60; i++) {
    const { status } = await relay<{ status: string }>(path);
    if (DONE.has(status)) return status;
    if (i === 0) onStage?.("Waiting for the fill on Robinhood Chain…");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("This is taking longer than expected — check back shortly");
}

/**
 * Runs every tx in the quote on `origin`, then waits for the fill. Switches the
 * wallet to that chain and always switches back. `origin` is a funding origin
 * for money in, and Robinhood Chain itself for a payout.
 */
export async function executeFunding(
  quote: FundingQuote,
  origin: Chain,
  wallet: WalletClient,
  onStage?: Stage
): Promise<string> {
  const account = wallet.account;
  if (!account) throw new Error("Wallet not connected");

  // Reads go through the wallet's own provider, so no extra RPC host learns
  // the user's IP (the whole point of the /api/rpc proxy).
  const reader = createPublicClient({
    chain: origin,
    transport: custom({ request: wallet.request }),
  });

  onStage?.(`Switching to ${origin.name}…`);
  await wallet.switchChain({ id: origin.id });

  try {
    const items = quote.steps.flatMap((s) =>
      (s.items ?? []).map((item) => ({ step: s, item }))
    );
    for (const { step, item } of items) {
      onStage?.(step.description ?? `Signing ${step.id}…`);
      const hash = await wallet.sendTransaction({
        account,
        chain: origin,
        to: item.data.to,
        data: item.data.data,
        value: BigInt(item.data.value ?? "0"),
      });
      // The approve step carries no `check`, so the deposit that follows would
      // revert if we didn't wait for the allowance to land.
      await reader.waitForTransactionReceipt({ hash });
    }
  } finally {
    await wallet.switchChain({ id: ACTIVE_EVM_CHAIN.id }).catch(() => {});
  }

  if (!quote.statusPath) return "success";
  return waitForFill(quote.statusPath, onStage);
}

"use client";

// Stealth-address privacy (ERC-5564) on Robinhood Chain. Hides WHO receives:
// each payment goes to a fresh one-time address only the recipient can spend.
// Keys are derived deterministically from a Privy signature (orphan-safe).
//
// The canonical ERC-5564 announcer isn't deployed on Robinhood Chain, so we
// deploy our own (SDK-provided bytecode) once and store its address in env.

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  erc20Abi,
  getAddress,
  parseEventLogs,
  type WalletClient,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  generateKeysFromSignature,
  generateStealthMetaAddressFromSignature,
  generateStealthAddress,
  checkStealthAddress,
  computeStealthKey,
  VALID_SCHEME_ID,
  ERC5564AnnouncerAbi,
  ERC5564_BYTECODE,
} from "@scopelift/stealth-address-sdk";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { withRetry } from "@/lib/chain/evm/async-util";
import { decryptNote, encryptNote } from "@/lib/chain/evm/note-crypto";

const SCHEME = VALID_SCHEME_ID.SCHEME_ID_1;

/**
 * Announcement metadata: the view tag, plus an encrypted note when the sender
 * wrote one. A note must never cost someone their payment, so an encryption
 * failure degrades to a plain view tag instead of throwing.
 */
async function buildMetadata(
  viewTag: Hex,
  recipientUri: string,
  note?: string
): Promise<Hex> {
  if (!note) return viewTag;
  try {
    const suffix = await encryptNote(note, recipientUri);
    return `${viewTag}${suffix.slice(2)}` as Hex;
  } catch {
    return viewTag;
  }
}

// Fixed message → deterministic keys (must never change, or funds orphan).
const KEY_MESSAGE =
  "BlackVault stealth keys · do not sign this on untrusted sites";

const publicClient = createPublicClient({ chain: ACTIVE_EVM_CHAIN, transport: http() });

// viem's waitForTransactionReceipt resolves even on a reverted tx, which would
// let a failed send look successful — so confirm status explicitly.
async function confirm(hash: Hex, what: string): Promise<void> {
  // Retry the receipt fetch: a transient RPC hiccup must not report a landed tx
  // as failed. Only a genuine reverted status throws.
  const receipt = await withRetry(() => publicClient.waitForTransactionReceipt({ hash }));
  if (receipt.status !== "success") throw new Error(`${what} reverted on-chain`);
}

/** Spendable private key for a matched stealth address (for sweeping). */
export function computeStealthPrivKey(match: StealthMatch, keys: StealthKeys): Hex {
  return computeStealthKey({
    ephemeralPublicKey: match.ephemeralPubKey,
    schemeId: SCHEME,
    spendingPrivateKey: keys.spendingPrivateKey,
    viewingPrivateKey: keys.viewingPrivateKey,
  }) as Hex;
}

// trim(): env values pasted into deploy dashboards can carry stray newlines,
// which make the address invalid and fail every getLogs.
export const ANNOUNCER_ADDRESS = (process.env.NEXT_PUBLIC_ANNOUNCER_ADDR ?? "").trim() as
  | Address
  | "";

export interface StealthKeys {
  spendingPublicKey: Hex;
  spendingPrivateKey: Hex;
  viewingPublicKey: Hex;
  viewingPrivateKey: Hex;
}
export interface StealthIdentity {
  keys: StealthKeys;
  metaAddress: Hex; // raw meta-address
  uri: string; // st:eth:<metaAddress>
}
export interface StealthMatch {
  stealthAddress: Address;
  ephemeralPubKey: Hex;
  /** Message the sender attached, decrypted with our viewing key. */
  note?: string;
}

/** Derive the user's stealth identity from a Privy wallet signature. */
export async function deriveStealthIdentity(
  wallet: WalletClient,
  address: string
): Promise<StealthIdentity> {
  const signature = (await wallet.signMessage({
    account: getAddress(address),
    message: KEY_MESSAGE,
  })) as Hex;
  const keys = generateKeysFromSignature(signature) as StealthKeys;
  const metaAddress = generateStealthMetaAddressFromSignature(signature) as Hex;
  return { keys, metaAddress, uri: `st:eth:${metaAddress}` };
}

/** Deploy our own ERC-5564 announcer (one-time). Returns its address. */
export async function deployAnnouncer(wallet: WalletClient): Promise<Address> {
  if (!wallet.account) throw new Error("Wallet not connected");
  const hash = await wallet.deployContract({
    account: wallet.account,
    chain: ACTIVE_EVM_CHAIN,
    abi: ERC5564AnnouncerAbi,
    bytecode: ERC5564_BYTECODE as Hex,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("No contract address in receipt");
  return receipt.contractAddress;
}

/**
 * Send a stealth payment: compute a one-time address for the recipient's
 * meta-address, transfer native ETH there, then announce it on-chain so the
 * recipient can discover it. (ERC-20 stealth follows the same shape.)
 */
export async function sendStealthEth(
  wallet: WalletClient,
  recipientUri: string,
  amount: bigint,
  announcer: Address,
  onStage?: (m: string) => void,
  note?: string
): Promise<{ transferTx: string; announceTx: string; stealthAddress: Address }> {
  if (!wallet.account) throw new Error("Wallet not connected");
  onStage?.("Computing one-time address…");
  const { stealthAddress, ephemeralPublicKey, viewTag } = generateStealthAddress({
    stealthMetaAddressURI: recipientUri,
    schemeId: SCHEME,
  });

  // Announce FIRST, then move funds. The announce carries the ephemeral key the
  // recipient needs to derive (and spend) the stealth address, so if it fails we
  // must not have already sent funds there — they'd be unrecoverable.
  onStage?.("Announcing on-chain…");
  // First byte = view tag (ERC-5564 convention); an encrypted note may follow.
  const metadata = await buildMetadata(viewTag as Hex, recipientUri, note);
  const announceTx = await wallet.writeContract({
    account: wallet.account,
    chain: ACTIVE_EVM_CHAIN,
    address: announcer,
    abi: ERC5564AnnouncerAbi,
    functionName: "announce",
    args: [BigInt(SCHEME), stealthAddress, ephemeralPublicKey, metadata],
  });
  await confirm(announceTx, "Announce");

  onStage?.("Transferring to stealth address…");
  const transferTx = await wallet.sendTransaction({
    account: wallet.account,
    chain: ACTIVE_EVM_CHAIN,
    to: stealthAddress as Address,
    value: amount,
  });
  await confirm(transferTx, "Transfer");

  return { transferTx, announceTx, stealthAddress: stealthAddress as Address };
}

// getLogs block-range cap is RPC-specific: thirdweb allows 1000, Alchemy free
// tier only 10. Set NEXT_PUBLIC_EVM_LOG_RANGE to match the provider. The chain
// grows ~170 blocks/min, so callers still scan forward from a checkpoint.
const MAX_LOG_RANGE = BigInt(process.env.NEXT_PUBLIC_EVM_LOG_RANGE ?? "900");
// Fallback window when no checkpoint is given (e.g. the dev smoke page).
const DEFAULT_LOOKBACK = 2000n;

export async function currentBlock(): Promise<bigint> {
  return publicClient.getBlockNumber();
}

/** Announce logs over [fromBlock, toBlock], split into RPC-sized windows and
 *  fetched in parallel (bounded + retried) so a wide range stays fast/robust. */
async function getAnnounceLogs(announcer: Address, fromBlock: bigint, toBlock: bigint) {
  const ranges: [bigint, bigint][] = [];
  let start = fromBlock < 0n ? 0n : fromBlock;
  while (start <= toBlock) {
    const end = start + MAX_LOG_RANGE - 1n;
    const to = end < toBlock ? end : toBlock;
    ranges.push([start, to]);
    start = to + 1n;
  }
  // Sequential + paced: free-tier RPC rate-limits getLogs bursts hard, so we
  // trade speed for staying under the per-second ceiling. 250ms keeps us near
  // ~4 req/s — under Blockscout's tolerance even with two vaults scanning.
  const logs: Awaited<ReturnType<typeof publicClient.getLogs>> = [];
  for (const [s, e] of ranges) {
    logs.push(...(await withRetry(() => publicClient.getLogs({ address: announcer, fromBlock: s, toBlock: e }))));
    await new Promise((r) => setTimeout(r, 250));
  }
  return logs;
}

/** Parse Announce logs and keep the ones addressed to these keys (unfiltered by balance). */
async function matchesForKeys(
  logs: Awaited<ReturnType<typeof publicClient.getLogs>>,
  keys: StealthKeys
): Promise<StealthMatch[]> {
  const parsed = parseEventLogs({ abi: ERC5564AnnouncerAbi, logs });
  const matches: StealthMatch[] = [];
  for (const log of parsed) {
    const a = log.args as {
      stealthAddress: Address;
      ephemeralPubKey: Hex;
      metadata: Hex;
    };
    if (!a.stealthAddress || !a.ephemeralPubKey) continue;
    const viewTag = ("0x" + a.metadata.slice(2, 4)) as Hex;
    const mine = checkStealthAddress({
      ephemeralPublicKey: a.ephemeralPubKey,
      schemeId: SCHEME,
      spendingPublicKey: keys.spendingPublicKey,
      userStealthAddress: a.stealthAddress,
      viewingPrivateKey: keys.viewingPrivateKey,
      viewTag,
    });
    if (!mine) continue;
    // Only decrypt for announcements addressed to us — the viewing key that
    // matched is the same one that opens the note.
    matches.push({
      stealthAddress: a.stealthAddress,
      ephemeralPubKey: a.ephemeralPubKey,
      note: await decryptNote(a.metadata, keys.viewingPrivateKey),
    });
  }
  return matches;
}

/** Matches for these keys in [fromBlock, toBlock] — raw, callers filter by balance. */
export async function scanStealthRange(
  keys: StealthKeys,
  announcer: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<StealthMatch[]> {
  return matchesForKeys(await getAnnounceLogs(announcer, fromBlock, toBlock), keys);
}

/** Scan a recent window and return still-funded matches. Dev/one-shot use. */
export async function scanStealth(
  keys: StealthKeys,
  announcer: Address,
  fromBlock?: bigint
): Promise<StealthMatch[]> {
  const latest = await currentBlock();
  const from = fromBlock ?? (latest > DEFAULT_LOOKBACK ? latest - DEFAULT_LOOKBACK : 0n);
  const matches = await scanStealthRange(keys, announcer, from, latest);
  const funded: StealthMatch[] = [];
  for (const m of matches) {
    if ((await publicClient.getBalance({ address: m.stealthAddress })) > 0n) funded.push(m);
  }
  return funded;
}

/** Sweep native ETH from a stealth address to a destination. */
export async function sweepStealthEth(
  match: StealthMatch,
  keys: StealthKeys,
  to: string,
  onStage?: (m: string) => void
): Promise<string> {
  onStage?.("Deriving stealth key…");
  const stealthPriv = computeStealthKey({
    ephemeralPublicKey: match.ephemeralPubKey,
    schemeId: SCHEME,
    spendingPrivateKey: keys.spendingPrivateKey,
    viewingPrivateKey: keys.viewingPrivateKey,
  }) as Hex;
  const account = privateKeyToAccount(stealthPriv);

  const bal = await publicClient.getBalance({ address: match.stealthAddress });
  // Reserve exactly gasLimit * gasPrice and send the rest, so max spend equals
  // the balance (leftover gas returns as dust). GAS_LIMIT covers a plain
  // transfer on this Orbit L2 (~26k units) with headroom.
  const GAS_LIMIT = 60000n;
  const gasPrice = await publicClient.getGasPrice();
  const fee = GAS_LIMIT * gasPrice;
  if (bal <= fee) throw new Error("Stealth balance too low to sweep (needs gas)");

  const stealthWallet = createWalletClient({
    account,
    chain: ACTIVE_EVM_CHAIN,
    transport: custom({
      request: ({ method, params }) =>
        publicClient.request({ method, params } as never),
    }),
  });

  onStage?.("Sweeping…");
  // Explicit legacy gas params: the local-account client would otherwise have to
  // estimate EIP-1559 fees itself, which is flaky on Orbit chains.
  const hash = await stealthWallet.sendTransaction({
    account,
    chain: ACTIVE_EVM_CHAIN,
    to: getAddress(to),
    value: bal - fee,
    gas: GAS_LIMIT,
    gasPrice,
  });
  // Wait so callers that re-read balances right after see the settled state.
  await confirm(hash, "Sweep");
  return hash;
}

/* ---------- ERC-20 stealth (same scheme, token instead of ETH) ---------- */

// ERC-20 transfer on this Orbit L2 with headroom (plain transfer ~26k; token
// transfer more). Used both to size the sweep gas and the just-in-time top-up.
const ERC20_GAS_LIMIT = 120000n;

/** Token balance held at a stealth address. */
export async function tokenBalanceAt(token: Address, owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

/**
 * Send an ERC-20 privately: transfer the token to a one-time stealth address
 * and announce it. No ETH is attached — the recipient funds the tiny sweep gas
 * from their own wallet at claim time (see sweepStealthToken).
 */
export async function sendStealthToken(
  wallet: WalletClient,
  recipientUri: string,
  token: Address,
  amount: bigint,
  announcer: Address,
  onStage?: (m: string) => void,
  note?: string
): Promise<{ transferTx: string; announceTx: string; stealthAddress: Address }> {
  if (!wallet.account) throw new Error("Wallet not connected");
  onStage?.("Computing one-time address…");
  const { stealthAddress, ephemeralPublicKey, viewTag } = generateStealthAddress({
    stealthMetaAddressURI: recipientUri,
    schemeId: SCHEME,
  });

  // Announce FIRST, then move the token — a failed announce after a completed
  // transfer would strand funds at an address whose key can't be re-derived.
  onStage?.("Announcing on-chain…");
  const metadata = await buildMetadata(viewTag as Hex, recipientUri, note);
  const announceTx = await wallet.writeContract({
    account: wallet.account,
    chain: ACTIVE_EVM_CHAIN,
    address: announcer,
    abi: ERC5564AnnouncerAbi,
    functionName: "announce",
    args: [BigInt(SCHEME), stealthAddress, ephemeralPublicKey, metadata],
  });
  await confirm(announceTx, "Announce");

  onStage?.("Transferring token to stealth address…");
  const transferTx = await wallet.writeContract({
    account: wallet.account,
    chain: ACTIVE_EVM_CHAIN,
    address: token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [stealthAddress as Address, amount],
  });
  await confirm(transferTx, "Transfer");

  return { transferTx, announceTx, stealthAddress: stealthAddress as Address };
}

/**
 * Sweep an ERC-20 from a stealth address. The stealth EOA can't pay gas from
 * token balance, so if it lacks ETH we top it up just enough from the user's
 * public wallet, then transfer the full token balance out. (Claiming to your
 * own wallet already links stealth↔you, so this top-up leaks nothing extra.)
 */
export async function sweepStealthToken(
  publicWallet: WalletClient,
  match: StealthMatch,
  keys: StealthKeys,
  token: Address,
  to: string,
  onStage?: (m: string) => void
): Promise<string> {
  onStage?.("Deriving stealth key…");
  const stealthPriv = computeStealthKey({
    ephemeralPublicKey: match.ephemeralPubKey,
    schemeId: SCHEME,
    spendingPrivateKey: keys.spendingPrivateKey,
    viewingPrivateKey: keys.viewingPrivateKey,
  }) as Hex;
  const account = privateKeyToAccount(stealthPriv);

  const tokenBal = await tokenBalanceAt(token, match.stealthAddress);
  if (tokenBal === 0n) throw new Error("No token balance to sweep");

  const gasPrice = await publicClient.getGasPrice();
  const fee = ERC20_GAS_LIMIT * gasPrice;
  const ethBal = await publicClient.getBalance({ address: match.stealthAddress });
  if (ethBal < fee) {
    if (!publicWallet.account) throw new Error("Wallet not connected");
    onStage?.("Funding gas from your wallet…");
    const fundTx = await publicWallet.sendTransaction({
      account: publicWallet.account,
      chain: ACTIVE_EVM_CHAIN,
      to: match.stealthAddress,
      value: fee - ethBal,
    });
    await confirm(fundTx, "Gas funding");
  }

  onStage?.("Sweeping token…");
  const stealthWallet = createWalletClient({
    account,
    chain: ACTIVE_EVM_CHAIN,
    transport: custom({
      request: ({ method, params }) =>
        publicClient.request({ method, params } as never),
    }),
  });
  const hash = await stealthWallet.writeContract({
    account,
    chain: ACTIVE_EVM_CHAIN,
    address: token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [getAddress(to), tokenBal],
    gas: ERC20_GAS_LIMIT,
    gasPrice,
  });
  await confirm(hash, "Sweep");
  return hash;
}

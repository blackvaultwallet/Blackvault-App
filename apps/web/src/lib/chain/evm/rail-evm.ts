"use client";

// PrivateRail over ERC-5564 stealth addresses (Robinhood/EVM). WHO-privacy:
// receive at one-time addresses, send to a recipient meta-address. Multi-asset:
// ETH and configured ERC-20s (USDG/…). v1 hides WHO + metadata (not amounts) →
// deposit/withdraw (amount shielding) are not applicable and throw.

import { createPublicClient, http, formatUnits, type WalletClient } from "viem";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import { USABLE_EVM_TOKENS, findEvmToken } from "@/lib/chain/evm/tokens";
import { withRetry, mapLimit } from "@/lib/chain/evm/async-util";
import {
  deriveStealthIdentity,
  sendStealthEth,
  sendStealthToken,
  scanStealthRange,
  sweepStealthEth,
  sweepStealthToken,
  computeStealthPrivKey,
  tokenBalanceAt,
  currentBlock,
  ANNOUNCER_ADDRESS,
  type StealthIdentity,
  type StealthMatch,
} from "@/lib/chain/evm/stealth";
import { aaConfigured, sweepStealthTokenGasless } from "@/lib/chain/evm/aa";
import type { TokenRef } from "@/lib/chain/types";
import type {
  PrivateRail,
  RailAsset,
  RailBalance,
  RailNote,
  RailStage,
} from "@/lib/rail";

const publicClient = createPublicClient({ chain: ACTIVE_EVM_CHAIN, transport: http() });

// Assets we scan/send privately: native ETH + configured ERC-20s.
const PRIVATE_ASSETS: TokenRef[] = USABLE_EVM_TOKENS;

// Sponsored 7702 claim is opt-in (NEXT_PUBLIC_EVM_GASLESS=1) until the 7702
// authorization signer/sender mismatch is resolved; JIT gas funding is default.
const GASLESS_ENABLED = process.env.NEXT_PUBLIC_EVM_GASLESS === "1";

// Below this, a stealth address's ETH is treated as leftover gas dust, not a
// receivable note. This MUST stay above the just-in-time gas we fund into a
// stealth address to sweep an ERC-20 (ERC20_GAS_LIMIT × gasPrice ≈ 0.00001 ETH
// on this Orbit L2, with headroom for gas spikes) — otherwise the recipient's
// OWN gas funding gets misread as an incoming ETH payment. Real ETH sends are
// far above this floor.
const NATIVE_DUST_WEI = 300_000_000_000_000n; // 0.0003 ETH

function requireAnnouncer(): `0x${string}` {
  if (!ANNOUNCER_ADDRESS) throw new Error("Announcer not configured");
  return ANNOUNCER_ADDRESS as `0x${string}`;
}

// A claimable payment: one asset at one stealth address.
interface FundedNote {
  match: StealthMatch;
  token: TokenRef;
  amount: bigint;
}

// Small buffer so a payment landing right around enable-time isn't missed.
const CHECKPOINT_BUFFER = 5n;

// Every sync scans the recent window (so a fresh payment shows within one scan)
// and, separately, walks any older gap forward a batch at a time (so nothing is
// missed when the app was closed). Both stay small for the free-tier rate limit.
// Sized to one getLogs call on a wide-range RPC (thirdweb, 1000 cap). ~5 min of
// coverage per scan; drop these if you switch to a 10-block-capped RPC.
const RECENT_WINDOW = 900n;
const BACKFILL_BATCH = 900n;

// Persist scan progress per address so a reload doesn't re-scan from scratch.
// The stealth identity (private keys) is NEVER stored — it re-derives on demand
// from one wallet signature per session, so nothing sensitive sits at rest.
// Only public data is persisted: block cursors, matched (public) addresses,
// and the claimed set. v1 stored the private keys in plaintext; load() purges it.
const PERSIST_PREFIX = "bv_evm_stealth_v2_";
const LEGACY_PREFIX = "bv_evm_stealth_v1_";

interface Persisted {
  scannedThrough: string | null;
  backfillCursor: string | null;
  known: StealthMatch[];
  claimed: string[];
}

class EvmStealthRail implements PrivateRail {
  readonly name = "stealth-evm";
  private identity: StealthIdentity | null = null;

  // Scan state: `scannedThrough` is the recent-coverage tip (advances to latest
  // each sync); `backfillCursor` walks any older gap up toward the recent window.
  // Matches persist across scans until claimed. Mirrored to localStorage so
  // reloads resume where they left off (mainnet still wants a real indexer).
  private scannedThrough: bigint | null = null;
  private backfillCursor: bigint | null = null;
  private known = new Map<string, StealthMatch>();
  // Claimed keyed by `${stealthAddress}:${symbol}` — a swept address keeps gas
  // dust and may still hold other assets, so we track per (address, asset).
  private claimed = new Set<string>();
  private syncing: Promise<FundedNote[]> | null = null;
  // Per-asset private totals (symbol → raw units), refreshed each sync.
  private totals = new Map<string, bigint>();

  constructor(
    private wallet: WalletClient,
    private address: string
  ) {
    this.load();
  }

  /** Meta-address to share so others can pay you privately. */
  get metaAddressUri(): string | null {
    return this.identity?.uri ?? null;
  }

  /** Assets the UI can offer for private send / show private balances for. */
  get privateAssets(): TokenRef[] {
    return PRIVATE_ASSETS;
  }

  private load(): void {
    if (typeof localStorage === "undefined") return;
    // Purge the legacy blob that held stealth private keys in plaintext.
    try {
      localStorage.removeItem(LEGACY_PREFIX + this.address);
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(PERSIST_PREFIX + this.address);
      if (!raw) return;
      const p = JSON.parse(raw) as Persisted;
      this.scannedThrough = p.scannedThrough ? BigInt(p.scannedThrough) : null;
      this.backfillCursor = p.backfillCursor ? BigInt(p.backfillCursor) : null;
      for (const m of p.known) this.known.set(m.stealthAddress, m);
      for (const a of p.claimed ?? []) this.claimed.add(a);
    } catch {
      /* corrupt cache — start fresh */
    }
  }

  private save(): void {
    if (typeof localStorage === "undefined" || !this.identity) return;
    try {
      const p: Persisted = {
        scannedThrough: this.scannedThrough?.toString() ?? null,
        backfillCursor: this.backfillCursor?.toString() ?? null,
        known: [...this.known.values()],
        claimed: [...this.claimed],
      };
      localStorage.setItem(PERSIST_PREFIX + this.address, JSON.stringify(p));
    } catch {
      /* quota / unavailable */
    }
  }

  private async ensureIdentity(onStage?: RailStage): Promise<StealthIdentity> {
    if (this.identity) return this.identity;
    onStage?.("Sign to derive your private keys…");
    this.identity = await deriveStealthIdentity(this.wallet, this.address);
    // First-ever enable: start scanning from now (payments before you shared
    // your address can't exist). On a later session `scannedThrough` was restored
    // from persistence, so keep it and resume where the last scan left off.
    if (this.scannedThrough === null) {
      const latest = await currentBlock();
      this.scannedThrough = latest > CHECKPOINT_BUFFER ? latest - CHECKPOINT_BUFFER : 0n;
    }
    this.save();
    return this.identity;
  }

  // Fold matches in a block range into `known`.
  private async scanInto(id: StealthIdentity, from: bigint, to: bigint): Promise<void> {
    if (to < from) return;
    const fresh = await scanStealthRange(id.keys, requireAnnouncer(), from, to);
    for (const m of fresh) this.known.set(m.stealthAddress, m);
  }

  // Scan the recent window (fresh payments show fast) plus one backfill batch of
  // any older gap, then read every asset's balance at each address into notes +
  // totals. Concurrent callers share one in-flight run.
  private async sync(): Promise<FundedNote[]> {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      const id = await this.ensureIdentity();
      const latest = await currentBlock();
      const recentFrom = latest > RECENT_WINDOW ? latest - RECENT_WINDOW : 0n;
      const tip = this.scannedThrough ?? recentFrom;

      // Recent coverage: always include the last RECENT_WINDOW blocks.
      await this.scanInto(id, tip > recentFrom ? tip : recentFrom, latest);
      // If the tip was below the recent window, that gap needs backfilling.
      if (tip < recentFrom && this.backfillCursor === null) this.backfillCursor = tip;
      this.scannedThrough = latest + 1n;

      // Backfill one batch of the older gap, walking up toward the recent window.
      if (this.backfillCursor !== null && this.backfillCursor < recentFrom) {
        const bEnd =
          this.backfillCursor + BACKFILL_BATCH < recentFrom
            ? this.backfillCursor + BACKFILL_BATCH
            : recentFrom;
        await this.scanInto(id, this.backfillCursor, bEnd - 1n);
        this.backfillCursor = bEnd >= recentFrom ? null : bEnd;
      }
      this.save();

      // Every (address, asset) balance to read, minus already-claimed ones.
      const pending: { m: StealthMatch; token: TokenRef }[] = [];
      for (const m of this.known.values()) {
        // If we already claimed a TOKEN at this address, we JIT-funded gas into
        // it — any ETH left there is our own change, not an incoming payment.
        const claimedTokenHere = PRIVATE_ASSETS.some(
          (t) => !t.native && this.claimed.has(`${m.stealthAddress}:${t.symbol}`)
        );
        for (const token of PRIVATE_ASSETS) {
          if (this.claimed.has(`${m.stealthAddress}:${token.symbol}`)) continue;
          if (token.native && claimedTokenHere) continue; // gas change, not a note
          if (!token.native && !token.address) continue;
          pending.push({ m, token });
        }
      }

      // Read them in parallel (bounded low to respect free-tier rate limits); a
      // flaky read resolves to null, not a whole-scan failure.
      const read = await mapLimit(pending, 3, async ({ m, token }): Promise<FundedNote | null> => {
        try {
          const bal = token.native
            ? await withRetry(() => publicClient.getBalance({ address: m.stealthAddress }))
            : await withRetry(() => tokenBalanceAt(token.address as `0x${string}`, m.stealthAddress));
          if (token.native ? bal <= NATIVE_DUST_WEI : bal === 0n) return null;
          return { match: m, token, amount: bal };
        } catch {
          return null;
        }
      });

      const notes = read.filter((n): n is FundedNote => n !== null);
      const totals = new Map<string, bigint>();
      for (const n of notes) {
        totals.set(n.token.symbol, (totals.get(n.token.symbol) ?? 0n) + n.amount);
      }
      this.totals = totals;
      return notes;
    })();
    try {
      return await this.syncing;
    } finally {
      this.syncing = null;
    }
  }

  async register(onStage?: RailStage): Promise<void> {
    await this.ensureIdentity(onStage);
    // Sharing the meta-address is the "registration"; no on-chain step needed.
  }

  async deposit(): Promise<void> {
    throw new Error("Amount shielding isn't available on this chain yet");
  }
  async withdraw(): Promise<void> {
    throw new Error("Amount shielding isn't available on this chain yet");
  }

  async sendPrivate(
    dest: string,
    asset: RailAsset,
    units: bigint,
    onStage?: RailStage
  ): Promise<void> {
    const uri = dest.trim();
    if (!uri.startsWith("st:")) {
      throw new Error("Recipient must be a stealth meta-address (st:eth:…)");
    }
    const token = findEvmToken(asset.symbol);
    if (!token) throw new Error(`Unknown asset ${asset.symbol}`);
    if (token.native) {
      await sendStealthEth(this.wallet, uri, units, requireAnnouncer(), onStage);
    } else {
      if (!token.address) throw new Error(`${token.symbol} not configured on this chain`);
      await sendStealthToken(
        this.wallet,
        uri,
        token.address as `0x${string}`,
        units,
        requireAnnouncer(),
        onStage
      );
    }
  }

  async scanIncoming(): Promise<RailNote[]> {
    const notes = await this.sync();
    return notes.map((n) => ({
      id: `${n.match.stealthAddress}:${n.token.symbol}`,
      raw: n,
    }));
  }

  async claim(
    notes: RailNote[],
    onStage?: RailStage
  ): Promise<{ claimed: number; failed: number }> {
    const id = await this.ensureIdentity(onStage);
    let claimed = 0;
    let failed = 0;
    for (let i = 0; i < notes.length; i++) {
      onStage?.(`Claiming ${i + 1}/${notes.length}…`);
      const n = notes[i].raw as FundedNote;
      try {
        if (n.token.native) {
          await sweepStealthEth(n.match, id.keys, this.address, onStage);
        } else {
          const token = n.token.address as `0x${string}`;
          // Sponsored (7702) claim needs no ETH anywhere, but the permissionless
          // 7702 authorization currently recovers a signer != sender on this
          // chain, so it's parked behind a flag. Default path = JIT gas funding.
          let swept = false;
          if (GASLESS_ENABLED && aaConfigured()) {
            try {
              const priv = computeStealthPrivKey(n.match, id.keys);
              await sweepStealthTokenGasless(priv, token, this.address, onStage);
              swept = true;
            } catch (gaslessErr) {
              console.warn("[stealth] gasless claim failed, using JIT gas:", gaslessErr);
              onStage?.("Sponsored claim unavailable — using your gas…");
            }
          }
          if (!swept) {
            await sweepStealthToken(this.wallet, n.match, id.keys, token, this.address, onStage);
          }
        }
        this.claimed.add(`${n.match.stealthAddress}:${n.token.symbol}`);
        claimed++;
      } catch {
        failed++;
      }
    }
    this.save();
    return { claimed, failed };
  }

  async getPrivateBalance(asset: RailAsset): Promise<RailBalance> {
    if (!this.identity) return { amount: null, status: "uninitialized" };
    await this.sync();
    const dec = findEvmToken(asset.symbol)?.decimals ?? 18;
    const raw = this.totals.get(asset.symbol) ?? 0n;
    return { amount: Number(formatUnits(raw, dec)), status: "ready" };
  }

  /** Per-asset private balances that are non-zero (for the private-balance UI). */
  async getAllBalances(): Promise<{ token: TokenRef; amount: number }[]> {
    await this.sync();
    const out: { token: TokenRef; amount: number }[] = [];
    for (const token of PRIVATE_ASSETS) {
      const raw = this.totals.get(token.symbol) ?? 0n;
      if (raw > 0n) out.push({ token, amount: Number(formatUnits(raw, token.decimals)) });
    }
    return out;
  }
}

// One rail per address, like the Umbra rail.
const railCache = new Map<string, EvmStealthRail>();

export function getEvmRail(wallet: WalletClient, address: string): EvmStealthRail {
  const cached = railCache.get(address);
  if (cached) return cached;
  const rail = new EvmStealthRail(wallet, address);
  railCache.set(address, rail);
  return rail;
}

// Umbra implementation of PrivateRail. All protocol-specific mechanics live
// here (wSOL wrapping, ZK provers, relayer wiring); components stay neutral.

import {
  createSolanaRpc,
  pipe,
  address,
  lamports as toLamports,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  type Address,
  type Instruction,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getSyncNativeInstruction,
  getCloseAccountInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getUmbraRelayer } from "@umbra-privacy/sdk";
import { getUserRegistrationFunction } from "@umbra-privacy/sdk/registration";
import {
  getATAIntoETADirectDepositorFunction,
  getETAIntoReceiverBurnableStealthPoolNoteCreatorFunction,
} from "@umbra-privacy/sdk/deposit";
import { getETAIntoATAWithdrawerFunction } from "@umbra-privacy/sdk/withdrawal";
import { getEncryptedBalanceQuerierFunction } from "@umbra-privacy/sdk/query";
import {
  getBurnableStealthPoolNoteScannerFunction,
  getReceiverBurnableStealthPoolNoteIntoETABurnerFunction,
} from "@umbra-privacy/sdk/burn";
import {
  getUserRegistrationProver,
  getETAIntoStealthPoolNoteCreatorProver,
  getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver,
  getDefaultZkProverDeps,
} from "@umbra-privacy/sdk/zk-prover";
import { getCdnZkAssetProvider } from "@umbra-privacy/sdk/zk-prover/cdn";
import { createU64 } from "@umbra-privacy/sdk/types";
import {
  UMBRA_RPC,
  UMBRA_RELAYER,
  getBrowserUmbraClient,
  type VaultSignerLike,
} from "@/lib/umbra";
import { sendKitTxMessage } from "@/lib/wallet";
import type {
  PrivateRail,
  RailAsset,
  RailBalance,
  RailNote,
  RailStage,
} from "@/lib/rail";

type ScanResult = Awaited<
  ReturnType<ReturnType<typeof getBurnableStealthPoolNoteScannerFunction>>
>;
type ReceiverNote = ScanResult["etaToStealthPoolReceiverBurnable"][number];

type VW = VaultSignerLike & Parameters<typeof sendKitTxMessage>[0];

function noteId(n: ReceiverNote): string {
  return JSON.stringify(n, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  ).slice(0, 512);
}

function zkDeps() {
  return { ...getDefaultZkProverDeps(), assetProvider: getCdnZkAssetProvider() };
}

class UmbraRail implements PrivateRail {
  readonly name = "umbra";
  private rpc = createSolanaRpc(UMBRA_RPC);

  constructor(private vw: VW) {}

  private get owner(): Address {
    return address(this.vw.address);
  }

  private async ata(mint: string): Promise<Address> {
    const [ata] = await findAssociatedTokenPda({
      owner: this.owner,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      mint: address(mint),
    });
    return ata;
  }

  private async sendIxs(ixs: Instruction[]): Promise<string> {
    const signer = createNoopSigner(this.owner);
    const { value: blockhash } = await this.rpc.getLatestBlockhash().send();
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m)
    );
    return sendKitTxMessage(this.vw, msg);
  }

  async register(onStage?: RailStage): Promise<void> {
    const client = await getBrowserUmbraClient(this.vw);
    onStage?.("Sign to derive your private keys…");
    const register = getUserRegistrationFunction(
      { client },
      { zkProver: getUserRegistrationProver(zkDeps()) }
    );
    onStage?.("Generating ZK proof and submitting… this can take a few minutes");
    await register({ confidential: true, anonymous: true });
  }

  async deposit(asset: RailAsset, units: bigint, onStage?: RailStage): Promise<void> {
    const signer = createNoopSigner(this.owner);
    const mint = address(asset.mint);

    if (asset.isNative) {
      // Umbra shields SPL balances — native SOL wraps to wSOL first.
      onStage?.("Wrapping SOL → wSOL…");
      const ata = await this.ata(asset.mint);
      const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
        payer: signer,
        owner: this.owner,
        mint,
      });
      const fundIx = getTransferSolInstruction({
        source: signer,
        destination: ata,
        amount: toLamports(units),
      });
      const syncIx = getSyncNativeInstruction({ account: ata });
      await this.sendIxs([createAtaIx, fundIx, syncIx]);
    }

    onStage?.("Shielding into Private Balance…");
    const client = await getBrowserUmbraClient(this.vw);
    const shield = getATAIntoETADirectDepositorFunction({ client });
    await shield(this.owner, mint, createU64({ value: units }));
  }

  async withdraw(asset: RailAsset, units: bigint, onStage?: RailStage): Promise<void> {
    const signer = createNoopSigner(this.owner);
    const mint = address(asset.mint);

    onStage?.("Preparing destination account…");
    const createAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: signer,
      owner: this.owner,
      mint,
    });
    await this.sendIxs([createAtaIx]);

    onStage?.("Withdrawing from Private Balance (MPC)… this can take a few minutes");
    const client = await getBrowserUmbraClient(this.vw);
    const withdrawFn = getETAIntoATAWithdrawerFunction({ client });
    await withdrawFn(this.owner, mint, createU64({ value: units }));

    if (asset.isNative) {
      // Unwrap wSOL back to native SOL. Non-fatal: MPC may already have unwrapped.
      onStage?.("Unwrapping wSOL → SOL…");
      try {
        const ata = await this.ata(asset.mint);
        const closeIx = getCloseAccountInstruction({
          account: ata,
          destination: this.owner,
          owner: signer,
        });
        await this.sendIxs([closeIx]);
      } catch {
        // already unwrapped
      }
    }
  }

  async sendPrivate(
    dest: string,
    asset: RailAsset,
    units: bigint,
    onStage?: RailStage
  ): Promise<void> {
    onStage?.("Preparing private transfer…");
    const client = await getBrowserUmbraClient(this.vw);
    const createNote = getETAIntoReceiverBurnableStealthPoolNoteCreatorFunction(
      { client },
      { zkProver: getETAIntoStealthPoolNoteCreatorProver(zkDeps()) }
    );
    onStage?.("Generating ZK proof and sending privately… this can take a few minutes");
    await createNote({
      destinationAddress: address(dest),
      mint: address(asset.mint),
      amount: createU64({ value: units }),
    });
  }

  async scanIncoming(): Promise<RailNote[]> {
    const client = await getBrowserUmbraClient(this.vw);
    const scanFn = getBurnableStealthPoolNoteScannerFunction({ client });
    const res = await scanFn();
    return (res.etaToStealthPoolReceiverBurnable ?? []).map((n) => ({
      id: noteId(n),
      raw: n,
    }));
  }

  async claim(
    notes: RailNote[],
    onStage?: RailStage
  ): Promise<{ claimed: number; failed: number }> {
    const client = await getBrowserUmbraClient(this.vw);
    const r = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER });
    // The SDK burner resolves even when the relayer reports "failed" — the
    // poll response is the only source of truth, so track it ourselves.
    let lastStatus = "";
    const submitBurn: typeof r.submitClaim = async (...args) => {
      const res = await r.submitClaim(...args);
      console.log("[claim] submit →", JSON.stringify(res));
      return res;
    };
    const pollBurnStatus: typeof r.pollClaimStatus = async (...args) => {
      const res = await r.pollClaimStatus(...args);
      console.log("[claim] poll →", JSON.stringify(res));
      lastStatus = (res as { status?: string }).status ?? "";
      return res;
    };
    const burn = getReceiverBurnableStealthPoolNoteIntoETABurnerFunction(
      { client },
      {
        fetchBatchMerkleProof: client.fetchBatchMerkleProof!,
        zkProver: getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(zkDeps()),
        relayer: {
          submitBurn,
          pollBurnStatus,
          getRelayerAddress: r.getRelayerAddress,
        },
      }
    );

    // One relayer request per note — a burnt/poisoned note fails alone.
    let claimed = 0;
    let failed = 0;
    for (let i = 0; i < notes.length; i++) {
      onStage?.(`Claiming transfer ${i + 1}/${notes.length}… (ZK + relayer)`);
      lastStatus = "";
      try {
        await burn([
          {
            ...(notes[i].raw as ReceiverNote),
            kind: "receiver-burnable" as const,
          },
        ]);
        if (lastStatus === "completed") claimed++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return { claimed, failed };
  }

  async getPrivateBalance(asset: RailAsset): Promise<RailBalance> {
    const client = await getBrowserUmbraClient(this.vw);
    const query = getEncryptedBalanceQuerierFunction({ client });
    const result = await query([address(asset.mint)]);
    const entry = result.get(address(asset.mint));
    // Claim credits aren't showing on devnet — keep the raw dump until resolved.
    console.log(
      `[balance:${asset.symbol}]`,
      JSON.stringify(entry, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    );
    if (!entry || entry.state === "non_existent") return { amount: 0, status: "none" };
    if (entry.state === "shared") {
      return {
        amount: Number(entry.balance) / 10 ** asset.decimals,
        status: "ready",
      };
    }
    if (entry.state === "mxe") return { amount: null, status: "needs_conversion" };
    return { amount: null, status: "uninitialized" };
  }
}

// One rail per address, same lifetime as the cached Umbra client.
const railCache = new Map<string, PrivateRail>();

export function getPrivateRail(vw: VW): PrivateRail {
  const cached = railCache.get(vw.address);
  if (cached) return cached;
  const rail = new UmbraRail(vw);
  railCache.set(vw.address, rail);
  return rail;
}

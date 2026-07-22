"use client";

import { useMemo, useState } from "react";
import {
  createSolanaRpc,
  pipe,
  address,
  lamports,
  createNoopSigner,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  type Instruction,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { Connection } from "@solana/web3.js";
import { useVaultWallet, sendKitTxMessage } from "@/lib/wallet";
import { isSolName, resolveSolName } from "@/lib/sns";
import { UMBRA_RPC } from "@/lib/umbra";
import {
  availableTokens,
  findToken,
  parseAmount,
  SOL_DECIMALS,
} from "@/lib/tokens";
import { TransferFlow, type TransferSummary } from "@/ui/transfer-flow";
import { assetIcon } from "@/ui/asset-select";
import { useMarket } from "@/lib/market";
import { useToast } from "@/components/toast";

const RPC_URL = UMBRA_RPC;

function coinIcon(sym: string) {
  return (
    <span
      className="flex h-16 w-16 items-center justify-center"
      style={{
        background: sym === "SOL" ? "#141414" : "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-pill)",
      }}
    >
      {assetIcon(sym, 30)}
    </span>
  );
}

export function SendSol() {
  const rpc = useMemo(() => createSolanaRpc(RPC_URL), []);
  const vw = useVaultWallet();
  const quotes = useMarket();

  const toast = useToast();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("SOL");
  const [status, setStatus] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [flow, setFlow] = useState<{
    summary: TransferSummary;
    dest: string;
    token: string;
    units: bigint;
    isSol: boolean;
    decimals: number;
    amt: number;
  } | null>(null);

  const priceOf = (s: string) => (s === "SOL" ? quotes?.SOL?.price ?? 0 : 1);

  // Validate + resolve the recipient, then open the full-screen confirm flow.
  async function review() {
    if (!vw.isConnected || !vw.address || resolving) return;
    setStatus(null);
    const raw = to.trim();
    if (!raw) return setStatus("Enter a destination.");
    const isSol = token === "SOL";
    const decimals = isSol ? SOL_DECIMALS : findToken(token)!.decimals;
    const units = parseAmount(amount, decimals);
    if (units === null) return setStatus("Invalid amount.");

    setResolving(true);
    try {
      const dest = isSolName(raw)
        ? await resolveSolName(new Connection(RPC_URL), raw)
        : raw;
      address(dest); // throws on a malformed address
      const short = dest.length > 16 ? `${dest.slice(0, 6)}…${dest.slice(-6)}` : dest;
      setFlow({
        summary: {
          mode: "public",
          symbol: token,
          icon: coinIcon(token),
          amount,
          usd: parseFloat(amount) * priceOf(token),
          fromLabel: "Your Wallet",
          toLabel: isSolName(raw) ? raw : short,
          network: "Solana · devnet",
          fee: "~0.000005 SOL",
        },
        dest,
        token,
        units,
        isSol,
        decimals,
        amt: parseFloat(amount),
      });
    } catch {
      setStatus("Invalid destination address or name.");
    } finally {
      setResolving(false);
    }
  }

  async function runSend(log: (l: string) => void): Promise<{ signature?: string }> {
    if (!flow || !vw.address) throw new Error("Nothing to send");
    const destination = address(flow.dest);
    const signer = createNoopSigner(address(vw.address));
    log("> fetching blockhash…");
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const ixs: Instruction[] = [];
    if (flow.isSol) {
      ixs.push(
        getTransferSolInstruction({ source: signer, destination, amount: lamports(flow.units) })
      );
    } else {
      const mint = address(findToken(flow.token)!.mint!);
      const [sourceAta] = await findAssociatedTokenPda({
        owner: address(vw.address),
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        mint,
      });
      const [destAta] = await findAssociatedTokenPda({
        owner: destination,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        mint,
      });
      // Recipient may not hold this token yet — create their ATA, we pay rent.
      ixs.push(
        await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: signer, owner: destination, mint }),
        getTransferCheckedInstruction({
          source: sourceAta,
          mint,
          destination: destAta,
          authority: signer,
          amount: flow.units,
          decimals: flow.decimals,
        })
      );
    }

    const txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m)
    );
    log("> awaiting signature & broadcast…");
    const signature = await sendKitTxMessage(vw, txMessage);
    toast("success", `Sent ${flow.amt} ${flow.token}`);
    return { signature };
  }

  if (!vw.isConnected) return null;

  return (
    <div className="bv-card bv-enter p-5 text-left">
      <p className="bv-label">
        Send · devnet
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Address or name.blackvault.sol"
          className="bv-input px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            className="flex-1 bv-input px-3 py-2 text-sm"
          />
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={resolving}
            className="bv-input px-2 py-2 text-sm"
          >
            <option value="SOL">SOL</option>
            {availableTokens().map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>
          <button
            onClick={review}
            disabled={resolving}
            className="bv-press bv-btn-primary px-4 text-sm disabled:opacity-50"
          >
            {resolving ? "…" : "Send"}
          </button>
        </div>
      </div>
      {status && (
        <p className="mt-3 break-words text-sm leading-6 text-muted">{status}</p>
      )}
      {flow && (
        <TransferFlow
          open
          summary={flow.summary}
          onConfirm={runSend}
          onClose={() => setFlow(null)}
          onDone={() => {
            setFlow(null);
            setTo("");
            setAmount("");
          }}
        />
      )}
    </div>
  );
}

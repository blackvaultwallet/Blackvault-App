// BlackVault Names — claim / lookup a subname. Self-hosted (replaces NameStone).
// GET ?address= → current name; POST {name,address[,txHash]} → claim.
//
// Monetization: with NAMES_PRICE_USDG set (> 0), a claim must present the hash
// of a USDG transfer of at least that amount from the claiming address to
// NAMES_REVENUE_ADDR. The receipt is verified on-chain server-side and the tx
// hash is burned in the store (unique) so a payment can't be replayed.
// Price unset/0 → free claims (dev/testnet default).

import { createPublicClient, http, getAddress } from "viem";
import { claimName, getByAddress } from "@/lib/chain/evm/names-store";
import { ACTIVE_EVM_RPC_TARGET } from "@/lib/chain/evm/config";
import { findEvmToken } from "@/lib/chain/evm/tokens";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PARENT =
  process.env.NEXT_PUBLIC_NAMES_PARENT ?? process.env.NEXT_PUBLIC_ENS_PARENT ?? "blackvaultwallet.eth";
const LABEL_RE = /^[a-z0-9-]{3,20}$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_RE = /^0x[a-fA-F0-9]{64}$/;

const PRICE_USDG = parseFloat(process.env.NAMES_PRICE_USDG?.trim() ?? "0") || 0;
const REVENUE_ADDR = (process.env.NAMES_REVENUE_ADDR ?? "").trim();

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const pad = (addr: string) => "0x000000000000000000000000" + addr.slice(2).toLowerCase();

/** Confirms txHash is a successful USDG transfer from `from` to the revenue
 *  wallet worth at least the configured price. Throws with a reason if not. */
async function verifyPayment(txHash: string, from: string): Promise<void> {
  const token = findEvmToken("USDG");
  if (!token?.address) throw new Error("Payment token not configured");
  if (!ADDR_RE.test(REVENUE_ADDR)) throw new Error("Revenue address not configured");
  const client = createPublicClient({ transport: http(ACTIVE_EVM_RPC_TARGET) });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    timeout: 45_000,
  });
  if (receipt.status !== "success") throw new Error("Payment transaction failed");
  const need = BigInt(Math.round(PRICE_USDG * 1e6)); // USDG = 6 decimals
  const paid = receipt.logs.some(
    (l) =>
      l.address.toLowerCase() === token.address!.toLowerCase() &&
      l.topics[0] === TRANSFER_TOPIC &&
      l.topics[1]?.toLowerCase() === pad(from) &&
      l.topics[2]?.toLowerCase() === pad(getAddress(REVENUE_ADDR)) &&
      BigInt(l.data) >= need
  );
  if (!paid) throw new Error(`Payment of ${PRICE_USDG} USDG to the claim address not found in tx`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address");
  if (address) {
    const rec = await getByAddress(address);
    return Response.json({ name: rec ? `${rec.name}.${PARENT}` : null });
  }
  // No params: expose claim terms so the client renders the right flow.
  return Response.json({
    priceUsdg: PRICE_USDG,
    parent: PARENT,
    revenueAddr: ADDR_RE.test(REVENUE_ADDR) ? REVENUE_ADDR : null,
  });
}

export async function POST(req: Request) {
  // Claims are rare per human; throttle hard against squatting bots.
  const limited = await rateLimit(req, "names-claim", 5, 60);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    address?: string;
    txHash?: string;
  };
  const name = String(body.name ?? "").trim().toLowerCase();
  const address = body.address?.trim();
  if (!LABEL_RE.test(name)) {
    return Response.json({ error: "3–20 lowercase letters, numbers, or dashes" }, { status: 400 });
  }
  if (!address || !ADDR_RE.test(address)) {
    return Response.json({ error: "valid address required" }, { status: 400 });
  }

  let txHash: string | undefined;
  if (PRICE_USDG > 0) {
    txHash = body.txHash?.trim();
    if (!txHash || !TX_RE.test(txHash)) {
      return Response.json(
        { error: `This name costs ${PRICE_USDG} USDG — payment tx required` },
        { status: 402 }
      );
    }
    try {
      await verifyPayment(txHash, address);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 402 });
    }
  }

  try {
    const rec = await claimName(name, address, txHash);
    return Response.json({ name: `${rec.name}.${PARENT}` });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}

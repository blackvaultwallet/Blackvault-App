// CCIP-Read gateway (ERC-3668) for BlackVault Names. The OffchainResolver
// reverts OffchainLookup pointing here; we decode the resolve() request, look up
// the name in our store, and return a signed response the resolver verifies.
// Signing matches the canonical ENS SignatureVerifier.

import {
  decodeFunctionData,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  type Hex,
} from "viem";
import { namehash } from "viem/ens";
import { sign } from "viem/accounts";
import { getByName } from "@/lib/chain/evm/names-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GATEWAY_KEY = (process.env.NAMES_GATEWAY_KEY ?? process.env.NAMES_SEPOLIA_KEY ?? "") as Hex;
const TTL = 300;

const RESOLVE_ABI = [
  { name: "resolve", type: "function", stateMutability: "view", inputs: [{ type: "bytes" }, { type: "bytes" }], outputs: [{ type: "bytes" }] },
] as const;

const INNER_ABI = [
  { name: "addr", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] },
  { name: "addr", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "uint256" }], outputs: [{ type: "bytes" }] },
  { name: "text", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "string" }], outputs: [{ type: "string" }] },
] as const;

// DNS-encoded name → dotted string
function decodeDnsName(hex: Hex): string {
  const bytes = Buffer.from(hex.slice(2), "hex");
  const labels: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i];
    if (len === 0) break;
    labels.push(bytes.slice(i + 1, i + 1 + len).toString("utf8"));
    i += 1 + len;
  }
  return labels.join(".");
}

async function answer(sender: string, callData: Hex): Promise<Hex> {
  const target = sender as Hex;
  // outer: resolve(bytes name, bytes data)
  const { args } = decodeFunctionData({ abi: RESOLVE_ABI, data: callData });
  const encodedName = args[0] as Hex;
  const inner = args[1] as Hex;
  const name = decodeDnsName(encodedName);

  // inner: addr(node) / addr(node,coin) / text(node,key)
  const decoded = decodeFunctionData({ abi: INNER_ABI, data: inner });
  const node = decoded.args[0] as Hex;
  if (namehash(name) !== node) throw new Error("name/node mismatch");

  const label = name.split(".")[0];
  const rec = await getByName(label);
  const addr = (rec?.address ?? "0x0000000000000000000000000000000000000000") as Hex;

  // encode the inner function's result
  let result: Hex;
  if (decoded.functionName === "text") {
    result = encodeAbiParameters([{ type: "string" }], [rec ? "" : ""]);
  } else {
    result = encodeAbiParameters([{ type: "address" }], [addr]);
  }

  const expires = BigInt(Math.floor(Date.now() / 1000) + TTL);
  const messageHash = keccak256(
    encodePacked(
      ["bytes", "address", "uint64", "bytes32", "bytes32"],
      ["0x1900", target, expires, keccak256(callData), keccak256(result)]
    )
  );
  const sig = await sign({ hash: messageHash, privateKey: GATEWAY_KEY, to: "hex" });

  return encodeAbiParameters(
    [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
    [result, expires, sig]
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ sender: string; data: string }> }) {
  const { sender, data } = await params;
  try {
    const callData = ("0x" + data.replace(/\.json$/, "").replace(/^0x/, "")) as Hex;
    const out = await answer(sender, callData);
    return Response.json({ data: out });
  } catch (e) {
    return Response.json({ message: (e as Error).message }, { status: 400 });
  }
}

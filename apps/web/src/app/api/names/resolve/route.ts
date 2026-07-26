// Forward resolution for pay-by-name: <label>.<parent> → address. Works in-app
// immediately (before a mainnet CCIP-Read gateway is live). Once the offchain
// resolver is deployed on mainnet, `<label>.blackvault.eth` also resolves via
// standard ENS everywhere — same UX, no app change.

import { getByName } from "@/lib/chain/evm/names-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARENT =
  process.env.NEXT_PUBLIC_NAMES_PARENT ?? process.env.NEXT_PUBLIC_ENS_PARENT ?? "blackvaultwallet.eth";

export async function GET(req: Request) {
  let name = new URL(req.url).searchParams.get("name")?.trim().toLowerCase() ?? "";
  if (!name) return Response.json({ address: null });
  if (name.endsWith("." + PARENT.toLowerCase())) name = name.slice(0, -(PARENT.length + 1));
  const rec = await getByName(name);
  return Response.json({ address: rec?.address ?? null });
}

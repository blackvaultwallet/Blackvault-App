// ENS subname claim via NameStone (offchain, gasless). Server-side so the API
// key stays secret. Activation needs a mainnet parent name (blackvault.eth)
// delegated to NameStone + NAMESTONE_API_KEY set; until then it 503s cleanly.

import { NextResponse } from "next/server";

const API = "https://namestone.com/api/public_v1";
const KEY = process.env.NAMESTONE_API_KEY ?? "";
const DOMAIN = process.env.NEXT_PUBLIC_ENS_PARENT ?? "";

function configured() {
  return KEY.length > 0 && DOMAIN.length > 0;
}

// Current subname for an address (to show what the user already claimed).
export async function GET(req: Request) {
  if (!configured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const address = new URL(req.url).searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });
  try {
    const r = await fetch(`${API}/get-names?domain=${DOMAIN}&address=${address}`, {
      headers: { Authorization: KEY },
    });
    const data = await r.json();
    const first = Array.isArray(data) ? data[0] : null;
    return NextResponse.json({ name: first?.name ? `${first.name}.${DOMAIN}` : null });
  } catch {
    return NextResponse.json({ name: null });
  }
}

// Claim `<name>.<DOMAIN>` → address (gasless; NameStone stores it offchain).
export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; address?: string };
  const name = body.name?.trim().toLowerCase();
  const address = body.address;
  if (!name || !address) {
    return NextResponse.json({ error: "name and address required" }, { status: 400 });
  }
  const r = await fetch(`${API}/set-name`, {
    method: "POST",
    headers: { Authorization: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ domain: DOMAIN, name, address }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return NextResponse.json({ error: detail || "claim failed" }, { status: r.status });
  }
  return NextResponse.json({ name: `${name}.${DOMAIN}` });
}

// Our own payment-request links for EVM (no WalletConnect dependency). A request
// encodes who to pay, how much, which token, and an optional note into a /pay
// link + QR. `to` is either a public 0x address (public request) or a stealth
// meta-address `st:eth:…` (private request). Pure/SDK-free so it's easy to test.

export interface EvmPayRequest {
  to: string;
  amount?: number;
  token?: string;
  note?: string;
  isPrivate: boolean; // derived: a stealth meta-address request
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const isStealth = (s: string) => s.startsWith("st:eth:");

export function buildEvmPayLink(
  origin: string,
  req: { to: string; amount?: number; token?: string; note?: string }
): string {
  const p = new URLSearchParams({ to: req.to.trim(), chain: "robinhood" });
  if (req.amount && req.amount > 0) p.set("amount", String(req.amount));
  if (req.token) p.set("token", req.token);
  if (req.note && req.note.trim()) p.set("note", req.note.trim());
  return `${origin}/pay?${p.toString()}`;
}

export function parseEvmPayRequest(params: {
  to?: string | null;
  amount?: string | number | null;
  token?: string | null;
  note?: string | null;
}): EvmPayRequest | null {
  const to = (params.to ?? "").toString().trim();
  if (!to || (!ADDR_RE.test(to) && !isStealth(to))) return null;
  const raw = params.amount;
  const amount = typeof raw === "number" ? raw : raw ? parseFloat(raw) : undefined;
  return {
    to,
    amount: amount && Number.isFinite(amount) && amount > 0 ? amount : undefined,
    token: params.token?.toString() || undefined,
    note: params.note?.toString() || undefined,
    isPrivate: isStealth(to),
  };
}

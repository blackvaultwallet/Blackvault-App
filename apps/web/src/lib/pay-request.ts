// Pure helpers for payment-request links, kept SDK-free for vitest.

export interface PayRequest {
  to: string;
  amount?: number;
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function buildPayLink(origin: string, req: PayRequest): string {
  const params = new URLSearchParams({ to: req.to });
  if (req.amount && req.amount > 0) params.set("amount", String(req.amount));
  return `${origin}/pay?${params.toString()}`;
}

export function parsePayRequest(params: {
  to?: string | null;
  amount?: string | null;
}): PayRequest | null {
  const to = params.to?.trim();
  if (!to || !BASE58_RE.test(to)) return null;
  const amount = params.amount ? parseFloat(params.amount) : undefined;
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    return { to };
  }
  return { to, amount };
}

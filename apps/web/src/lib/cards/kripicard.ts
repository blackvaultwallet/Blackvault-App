import "server-only";

// Kripicard client. Server-only, and it has to stay that way: cards are issued
// under our account, so this key can create and drain cards for everyone.
//
// Base URL comes from the developer console, not the public docs page — the
// paths advertised there (home.kripicard.com/api/premium/*) 404. Verified
// 2026-08-03 against appapi.kripicard.com, which answers JSON.
//
// Their rate limit is strict and punitive: exceed it and the key is blocked for
// minutes, not seconds. Never call this per render — read from our own store
// and hit the provider only when the user asks for something live.

const BASE = process.env.KRIPICARD_BASE_URL ?? "https://appapi.kripicard.com";

function key(): string {
  const k = process.env.KRIPICARD_API_KEY;
  if (!k) throw new Error("Cards are not configured");
  return k;
}

/** BINs the provider issues on. dateOfBirth is required only for these three. */
export const DOB_REQUIRED_BINS = new Set(["537872", "533171", "246001"]);

export interface CreatedCard {
  card_id: string;
  last_4: string;
  bin: string;
  amount: number;
  fee: number;
  total_charged: number;
}

export interface CardDetails {
  card_number: string;
  expiry: string;
  cvv: string;
  balance: number;
  status: string;
}

export interface CardTransaction {
  date: string;
  type: string;
  merchant: string;
  amount: number;
  currency: string;
  status: string;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: key(), ...body }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | ({ success?: boolean; message?: string; error?: string } & Record<string, unknown>)
    | null;

  if (!json) throw new Error(`Card provider returned ${res.status}`);
  // They answer 200 with success:false for business errors, and their rate-limit
  // message is the useful one — pass it through rather than flattening it.
  if (json.success === false || !res.ok) {
    throw new Error(json.message ?? json.error ?? `Card provider returned ${res.status}`);
  }
  return json as T;
}

export function createCard(input: {
  bin: string;
  amount: number;
  nameOnCard: string;
  email?: string;
  dateOfBirth?: string;
}): Promise<CreatedCard & { message?: string }> {
  return call("/api/external/cards/createcard", {
    bin: input.bin,
    amount: input.amount,
    name_on_card: input.nameOnCard,
    ...(input.email ? { email: input.email } : {}),
    ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
  });
}

export function fundCard(cardId: string, amount: number) {
  return call<{ data: { card_id: string; amount: number; fee: number; total_debited: number } }>(
    "/api/external/cards/fundcard",
    { card_id: cardId, amount }
  );
}

export function cardDetails(cardId: string): Promise<CardDetails> {
  return call<CardDetails>("/api/external/cards/carddetails", { card_id: cardId });
}

export function cardTransactions(cardId: string) {
  return call<{
    data: { card_id: string; balance: number; total_transactions: number; transactions: CardTransaction[] };
  }>("/api/external/cards/transactions", { card_id: cardId });
}

export function setFrozen(cardId: string, frozen: boolean) {
  return call<{ message?: string }>("/api/external/premium/Freeze_Unfreeze", {
    card_id: cardId,
    action: frozen ? "freeze" : "unfreeze",
  });
}

export interface Deposit {
  id: string;
  status: string;
  amount_usd: number;
  /** Their cut, 1% at time of writing — separate from the card funding fee. */
  fee_usd: number;
  credited_on_completion_usd: number;
  /** Where to send. Solana address for network "sol", so not a 0x string. */
  pay_address: string;
  /** Send at least this much; slightly above amount_usd to absorb rounding. */
  pay_amount: string;
  pay_currency: string;
  network: string;
  /** ISO. The address stops accepting after this — quote and send inside it. */
  expires_at: string;
}

/**
 * Opens a deposit intent against our account balance and returns where to pay.
 * Credits OUR account, not the user's — the provider has one account for all of
 * them, so who the money belongs to is recorded on our side.
 */
export function createDeposit(amountUsd: number): Promise<{ data: Deposit }> {
  return call<{ data: Deposit }>("/api/external/deposits/create", {
    amount: amountUsd,
    currency: "USDT",
    network: "sol",
  });
}

export interface DepositStatus {
  id: string;
  status: string;
  /** The only trustworthy signal that money actually arrived. */
  credited: boolean;
  credited_amount_usd: number;
  amount_usd: number;
  fee_usd: number;
  gateway_status?: string;
}

/**
 * Asks the provider whether a deposit landed. Never fund a card off a client's
 * word that it did — the account being debited is ours.
 */
export function depositStatus(id: string): Promise<{ data: DepositStatus }> {
  return call<{ data: DepositStatus }>("/api/external/deposits/status", { id });
}

/** Irreversible. Returns the remaining balance minus their $2 cashout fee. */
export function deleteCard(cardId: string) {
  return call<{ refunded: number; fee: number; message?: string }>(
    "/api/external/cards/deletecard",
    { card_id: cardId }
  );
}

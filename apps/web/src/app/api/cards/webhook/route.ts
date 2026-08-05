// Kripicard webhook receiver.
//
// The point of this endpoint is deposit.completed: without it the client has to
// poll to learn its bridge landed, and a user who closes the tab mid-flow ends
// up credited to our account with nothing on their card.
//
// Signature scheme per their docs: HMAC-SHA256 over `${timestamp}.${rawBody}`,
// header `Kripicard-Signature: t=<unix>,v1=<hex>`, reject anything older than
// five minutes. The raw body has to be hashed byte for byte, so nothing may
// re-serialise it before verification.

import { claimDeposit, pendingDepositIds, releaseDeposit } from "@/lib/cards/cards-store";
import { depositStatus, fundCard } from "@/lib/cards/kripicard";
import { MIN_TOPUP, fundableWith } from "@/lib/cards/pricing";
import { verifyWebhook } from "@/lib/cards/webhook-verify";

export const runtime = "nodejs";

/** Every string in the payload, so we can spot a deposit id we know about. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => strings(v, out));
  }
  return out;
}

async function onDepositCompleted(payload: unknown): Promise<void> {
  // Their published template covers transaction.created, not this event, so
  // rather than guess a field name we look for any value matching a deposit we
  // are actually waiting on. Unknown ids simply don't match.
  const pending = new Set(await pendingDepositIds());
  const id = strings(payload).find((s) => pending.has(s));
  if (!id) return;

  const { data: status } = await depositStatus(id);
  if (!status.credited) return;

  const rec = await claimDeposit(id);
  if (!rec) return;
  // A deposit with no card behind it is paying to open one, and only the create
  // call can do that — it carries the name and the BIN. Put it back rather than
  // leaving it marked applied, which would strand the money in our account and
  // fail the user's create with "already applied".
  if (!rec.cardId) {
    await releaseDeposit(id);
    return;
  }

  const onCard = fundableWith(status.credited_amount_usd);
  if (onCard < MIN_TOPUP) {
    await releaseDeposit(id);
    return;
  }
  try {
    await fundCard(rec.cardId, onCard);
  } catch {
    // Leave it claimable so the user's own apply-deposit call can retry.
    await releaseDeposit(id);
  }
}

export async function POST(req: Request) {
  const raw = await req.text();

  const ok = verifyWebhook({
    secret: process.env.KRIPICARD_WEBHOOK_SECRET,
    rawBody: raw,
    signature: req.headers.get("kripicard-signature"),
    timestamp: req.headers.get("kripicard-timestamp"),
  });
  if (!ok) return new Response("Invalid signature", { status: 400 });

  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(raw) as { type?: string; data?: unknown };
  } catch {
    return new Response("Malformed body", { status: 400 });
  }

  // They retry on non-2xx and give up after five attempts, and they time out at
  // ten seconds. Work that fails should not cost us the delivery, so acknowledge
  // first and let anything unhandled fall to the user's own apply-deposit.
  if (event.type === "deposit.completed") {
    try {
      await onDepositCompleted(event);
    } catch {
      // swallowed on purpose — see above
    }
  }

  return Response.json({ received: true });
}

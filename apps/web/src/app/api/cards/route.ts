// Card routes. One handler, action in the body, because every one of them needs
// the same two things first: a verified caller, and proof that the caller owns
// the card they named.
//
// The ownership check is the whole point. Cards live under our provider account,
// so a card_id straight off the wire would let anyone read anyone's card number.

import { NextRequest } from "next/server";
import { authErrorResponse, requireWallet } from "@/lib/server-auth";
import {
  assertOwns,
  claimDeposit,
  forgetCard,
  listCards,
  recordCard,
  recordDeposit,
  releaseDeposit,
} from "@/lib/cards/cards-store";
import {
  DOB_REQUIRED_BINS,
  cardDetails,
  cardTransactions,
  createCard,
  createDeposit,
  deleteCard,
  depositStatus,
  fundCard,
  setFrozen,
} from "@/lib/cards/kripicard";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function POST(req: NextRequest) {
  let wallet: string;
  try {
    wallet = await requireWallet(req);
  } catch (e) {
    return authErrorResponse(e);
  }

  // Our own limit sits in front of theirs: their block lasts seven minutes and
  // hits every user of the key at once, so one impatient caller must not take
  // cards down for everybody. Set well under whatever theirs is — 20/minute was
  // far too generous and tripped them in ordinary use.
  const limited = await rateLimit(req, `cards:${wallet}`, 6, 60);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("Malformed request");
  const action = String(body.action ?? "");
  const cardId = typeof body.cardId === "string" ? body.cardId : "";

  // Actions that don't name an existing card.
  const CARDLESS = new Set(["list", "create", "deposit", "apply-deposit"]);
  if (!CARDLESS.has(action)) {
    if (!cardId) return bad("cardId is required");
    try {
      await assertOwns(wallet, cardId);
    } catch {
      return bad("Card not found", 404);
    }
  }

  try {
    switch (action) {
      case "list":
        return Response.json({ cards: await listCards(wallet) });

      case "create": {
        const bin = String(body.bin ?? "");
        const amount = Number(body.amount);
        const nameOnCard = String(body.nameOnCard ?? "").trim();
        const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : undefined;

        if (!bin) return bad("Pick a card BIN");
        if (!Number.isFinite(amount) || amount < 10) return bad("Minimum is $10");
        if (nameOnCard.length < 2) return bad("Enter the name on card");
        if (DOB_REQUIRED_BINS.has(bin) && !dateOfBirth) {
          return bad("This BIN requires a date of birth");
        }

        const card = await createCard({
          bin,
          amount,
          nameOnCard,
          dateOfBirth,
          email: typeof body.email === "string" ? body.email : undefined,
        });
        // Record before returning: a card we forget about is a card the owner
        // can never reach again, and the money is already spent.
        await recordCard({
          cardId: card.card_id,
          address: wallet,
          last4: card.last_4 ?? "",
          bin: card.bin ?? bin,
          holder: nameOnCard,
          // Ours, not theirs — the provider has no concept of tiers.
          tierId: typeof body.tierId === "string" ? body.tierId : "standard",
        });
        return Response.json({ card });
      }

      case "fund": {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount < 10) return bad("Minimum is $10");
        return Response.json(await fundCard(cardId, amount));
      }

      // Opens a deposit intent and hands back where to pay. The client bridges
      // to pay_address with Relay, then calls apply-deposit once it lands.
      case "deposit": {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount < 10) return bad("Minimum is $10");

        // Funding an existing card? Then it has to be the caller's.
        const target = typeof body.forCardId === "string" ? body.forCardId : null;
        if (target) {
          try {
            await assertOwns(wallet, target);
          } catch {
            return bad("Card not found", 404);
          }
        }

        const { data } = await createDeposit(amount);
        await recordDeposit({
          depositId: data.id,
          address: wallet,
          cardId: target,
          creditUsd: data.credited_on_completion_usd,
        });
        return Response.json({ deposit: data });
      }

      // Called after the bridge fills. Two guards, and both are load-bearing:
      // the provider says whether money actually arrived (funding debits OUR
      // account, so a client claiming it landed is not evidence), and
      // claimDeposit flips pending→applied atomically so a retry or a second
      // tab can't fund a card twice off one deposit.
      case "apply-deposit": {
        const depositId = typeof body.depositId === "string" ? body.depositId : "";
        if (!depositId) return bad("depositId is required");

        const { data: status } = await depositStatus(depositId);
        if (!status.credited) return bad("Deposit hasn't landed yet", 409);

        const rec = await claimDeposit(depositId, wallet);
        if (!rec) return bad("Deposit already applied or not found", 409);
        // The provider is the authority on what arrived — our stored figure was
        // only ever an estimate made before the money moved.
        const credited = status.credited_amount_usd;
        if (!rec.cardId) return Response.json({ credited });

        // Their funding fee ($1 + 4%) comes off the account on top, so the card
        // can only take what's left after it.
        const onCard = Math.floor(((credited - 1) / 1.04) * 100) / 100;
        if (onCard < 10) {
          await releaseDeposit(depositId);
          return bad("Too little left to fund a card after fees");
        }
        try {
          return Response.json({ ...(await fundCard(rec.cardId, onCard)), onCard });
        } catch (e) {
          // Credited but not delivered — put it back so they can retry rather
          // than losing the deposit to a marked-applied row.
          await releaseDeposit(depositId);
          throw e;
        }
      }

      case "details":
        return Response.json(await cardDetails(cardId));

      case "transactions":
        return Response.json(await cardTransactions(cardId));

      case "freeze":
      case "unfreeze":
        return Response.json(await setFrozen(cardId, action === "freeze"));

      case "delete": {
        const out = await deleteCard(cardId);
        await forgetCard(cardId);
        return Response.json(out);
      }

      default:
        return bad("Unknown action");
    }
  } catch (e) {
    // Provider messages are user-facing on purpose — "Rate limit exceeded,
    // blocked for 7 minutes" is far more useful than "Something went wrong".
    return bad((e as Error).message || "Card request failed", 502);
  }
}

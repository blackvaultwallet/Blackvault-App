// What a card costs, in one place.
//
// Two directions have to agree or money goes missing in the gap: forwards, to
// decide how much a user is asked to send, and backwards, to decide what a
// payment that actually landed can buy. The UI quotes the forward figure and
// the route enforces the backward one, so they are kept here together and
// pinned by tests.
//
// Rates are the provider's, taken from a real invoice: a $10 card debited
// $16.40 — $10 on the card, $5 issuance, $1 processing, $0.40 funding.

/** The provider's floor on a card's opening balance. */
export const MIN_OPEN = 10;
/** Their floor on a later top-up — US cards, per their support. */
export const MIN_TOPUP = 1;
/**
 * Their floor on a single deposit into our account, which is a different limit
 * from either of the above and the one that actually binds: a $1 top-up needs
 * only a $2.06 deposit, and they will not take one that small.
 */
export const MIN_DEPOSIT = 10;

/** Charged once, when the card is opened. */
export const ISSUANCE_FEE = 5;
/** Flat, on every funding of a card — opening included. */
export const PROCESSING_FEE = 1;
/** Proportion of the balance being loaded. */
export const FUNDING_RATE = 0.04;
/** Their cut on money coming in, taken before our account sees it. */
export const DEPOSIT_FEE_RATE = 0.01;

/** What our account must be credited to open a card carrying `open`. */
export function costToOpen(open: number): number {
  return open * (1 + FUNDING_RATE) + ISSUANCE_FEE + PROCESSING_FEE;
}

/** Same, for adding `amount` to a card that already exists — no issuance fee. */
export function costToFund(amount: number): number {
  return amount * (1 + FUNDING_RATE) + PROCESSING_FEE;
}

// Dollars don't survive binary floating point, and both directions round, so
// the error lands on a boundary rather than washing out. Exactly $16.40 credited
// came back as $10.399999999999999 after the flat fees, floored to $9.99, and
// failed the $10 minimum for a payment that covered it to the cent. Cents are
// rounded to integers before dividing, and the epsilon absorbs what's left —
// it is far below a cent, so it can never hand out real money.
const EPSILON = 1e-9;
const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * The largest opening balance a credit of `credited` can pay for.
 *
 * Rounded down to the cent, always: rounding up here asks the provider to spend
 * money the deposit did not cover, and the call simply fails.
 */
export function openableWith(credited: number): number {
  const afterFlat = cents(credited) - cents(ISSUANCE_FEE + PROCESSING_FEE);
  return Math.floor(afterFlat / (1 + FUNDING_RATE) + EPSILON) / 100;
}

/**
 * What to ask the user for, so that after the provider's inbound cut the credit
 * still covers `open` plus its fees.
 *
 * Rounded up, for the mirror-image reason: a deposit a cent short opens a card
 * a cent smaller than the one that was quoted.
 */
export function depositToOpen(open: number): number {
  return Math.ceil((costToOpen(open) / (1 - DEPOSIT_FEE_RATE)) * 100 - EPSILON) / 100;
}

/** What a credit of `credited` can add to a card that already exists. */
export function fundableWith(credited: number): number {
  const afterFlat = cents(credited) - cents(PROCESSING_FEE);
  return Math.floor(afterFlat / (1 + FUNDING_RATE) + EPSILON) / 100;
}

/** What to ask for so `amount` actually lands on the card. */
export function depositToFund(amount: number): number {
  return Math.ceil((costToFund(amount) / (1 - DEPOSIT_FEE_RATE)) * 100 - EPSILON) / 100;
}

/**
 * The smallest top-up the deposit floor actually permits.
 *
 * MIN_TOPUP is what the card accepts; this is what the payment rail allows, and
 * it is the larger of the two. Quoting the card's figure alone would offer a
 * $1 top-up that fails at the provider with a message about deposits.
 */
export const MIN_FUNDABLE = Math.max(
  MIN_TOPUP,
  fundableWith(MIN_DEPOSIT * (1 - DEPOSIT_FEE_RATE))
);

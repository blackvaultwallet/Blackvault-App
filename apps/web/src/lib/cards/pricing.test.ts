import { describe, expect, it } from "vitest";
import {
  DEPOSIT_FEE_RATE,
  MIN_DEPOSIT,
  MIN_FUNDABLE,
  MIN_OPEN,
  MIN_OPENABLE,
  MIN_TOPUP,
  costToFund,
  costToOpen,
  depositToFund,
  depositToOpen,
  fundableWith,
  openableWith,
} from "./pricing";

describe("card pricing", () => {
  it("matches the invoice we actually received", () => {
    // A $10 card debited $16.40 at the provider — the figure every rate here
    // was derived from.
    expect(costToOpen(10)).toBeCloseTo(16.4, 10);
  });

  it("inverts itself", () => {
    for (const open of [10, 15, 20, 25, 50, 100, 250]) {
      expect(openableWith(costToOpen(open))).toBeCloseTo(open, 10);
    }
  });

  it("asks for enough that the credit still covers the card", () => {
    // The whole point of the gross-up: after their inbound cut, what lands has
    // to pay for the card that was quoted. A cent short opens a smaller card.
    for (const open of [10, 15, 20, 25, 50, 100, 250, 999.99]) {
      const asked = depositToOpen(open);
      const credited = asked * (1 - DEPOSIT_FEE_RATE);
      expect(credited).toBeGreaterThanOrEqual(costToOpen(open));
      expect(openableWith(credited)).toBeGreaterThanOrEqual(open);
    }
  });

  it("never asks for more than a cent of slack", () => {
    // Rounding up is deliberate, but it is the user's money — it should not
    // drift into a tip.
    for (const open of [10, 15, 20, 25, 50, 100, 250]) {
      const credited = depositToOpen(open) * (1 - DEPOSIT_FEE_RATE);
      expect(credited - costToOpen(open)).toBeLessThan(0.01);
    }
  });

  it("rounds the affordable balance down, never up", () => {
    // 16.39 buys slightly less than the $10 card 16.40 buys, and the answer has
    // to land below it or the provider rejects the call.
    expect(openableWith(16.39)).toBeLessThan(10);
    expect(openableWith(16.4)).toBeGreaterThanOrEqual(10);
  });

  it("goes negative rather than pretending a tiny credit opens a card", () => {
    // The route reads this as "too little left after fees" — it must not come
    // back as 0 and look like a legitimate free card.
    expect(openableWith(3)).toBeLessThan(0);
  });
});

describe("the deposit floor", () => {
  // The one that binds. Their API refuses anything under $20 — the minimums the
  // card advertises ($10 to open, $1 after) are unreachable through this rail,
  // and quoting them offers a payment that fails at the provider.
  it("is cleared by the smallest top-up we offer", () => {
    expect(depositToFund(MIN_FUNDABLE)).toBeGreaterThanOrEqual(MIN_DEPOSIT);
  });

  it("is cleared by the smallest card we offer", () => {
    expect(depositToOpen(MIN_OPENABLE)).toBeGreaterThanOrEqual(MIN_DEPOSIT);
  });

  it("is not cleared a cent below either — these are the true floors", () => {
    expect(depositToFund(MIN_FUNDABLE - 0.01)).toBeLessThan(MIN_DEPOSIT);
    expect(depositToOpen(MIN_OPENABLE - 0.01)).toBeLessThan(MIN_DEPOSIT);
  });

  it("sits above what the card itself would allow", () => {
    // If this ever inverts, the extra floors are dead weight and should go.
    expect(MIN_FUNDABLE).toBeGreaterThan(MIN_TOPUP);
    expect(MIN_OPENABLE).toBeGreaterThan(MIN_OPEN);
  });
});

describe("top-up pricing", () => {
  it("carries no issuance fee — that is paid once, at opening", () => {
    expect(costToOpen(10) - costToFund(10)).toBeCloseTo(5, 10);
  });

  it("puts on the card exactly what was asked for", () => {
    // The fault this replaces: asking for $10 sent $10, of which fees ate their
    // share, and $8.56 reached the card while the screen had promised $10.
    for (const amount of [1, 5, 10, 20, 50, 250]) {
      const credited = depositToFund(amount) * (1 - DEPOSIT_FEE_RATE);
      expect(fundableWith(credited)).toBeGreaterThanOrEqual(amount);
    }
  });

  it("inverts itself", () => {
    for (const amount of [1, 5, 10, 20, 50, 250]) {
      expect(fundableWith(costToFund(amount))).toBeCloseTo(amount, 10);
    }
  });

  it("never asks for more than a cent of slack", () => {
    for (const amount of [1, 5, 10, 20, 50, 250]) {
      const credited = depositToFund(amount) * (1 - DEPOSIT_FEE_RATE);
      expect(credited - costToFund(amount)).toBeLessThan(0.01);
    }
  });
});

import { describe, it, expect } from "vitest";
import { guardDeposit, guardWithdraw } from "./privacy-guard";

describe("guardDeposit", () => {
  it("accepts round amounts", () => {
    expect(guardDeposit({ amountSol: 0.5 }).warnings).toHaveLength(0);
    expect(guardDeposit({ amountSol: 1 }).warnings).toHaveLength(0);
  });

  it("warns on non-round amounts", () => {
    const { warnings } = guardDeposit({ amountSol: 0.4373 });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/round/i);
  });

  it("ignores invalid input", () => {
    expect(guardDeposit({ amountSol: NaN }).warnings).toHaveLength(0);
    expect(guardDeposit({ amountSol: 0 }).warnings).toHaveLength(0);
  });
});

describe("guardWithdraw", () => {
  it("warns when amount matches last deposit within 5%", () => {
    const { warnings } = guardWithdraw({
      amountSol: 0.5,
      lastDepositSol: 0.5,
      minutesSinceDeposit: 120,
    });
    expect(warnings.some((w) => /correlat/i.test(w))).toBe(true);
  });

  it("warns when withdrawing too soon after deposit", () => {
    const { warnings } = guardWithdraw({
      amountSol: 0.3,
      lastDepositSol: 1,
      minutesSinceDeposit: 5,
    });
    expect(warnings.some((w) => /soon|wait/i.test(w))).toBe(true);
  });

  it("stays quiet on unrelated round withdrawal after a while", () => {
    const { warnings } = guardWithdraw({
      amountSol: 0.2,
      lastDepositSol: 1,
      minutesSinceDeposit: 600,
    });
    expect(warnings).toHaveLength(0);
  });

  it("warns on non-round amounts", () => {
    const { warnings } = guardWithdraw({ amountSol: 0.333 });
    expect(warnings.some((w) => /round/i.test(w))).toBe(true);
  });

  it("handles missing deposit history", () => {
    expect(guardWithdraw({ amountSol: 0.5 }).warnings).toHaveLength(0);
  });
});

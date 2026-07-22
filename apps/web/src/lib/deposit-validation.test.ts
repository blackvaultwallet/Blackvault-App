import { describe, it, expect } from "vitest";
import { validateDepositSol, validateWithdrawSol } from "./deposit-validation";

describe("validateDepositSol", () => {
  const balance = 1.0;

  it("rejects amounts <= 0", () => {
    expect(validateDepositSol(0, balance).ok).toBe(false);
    expect(validateDepositSol(-1, balance).ok).toBe(false);
  });

  it("rejects NaN", () => {
    expect(validateDepositSol(NaN, balance).ok).toBe(false);
  });

  it("rejects amounts above balance minus fee buffer", () => {
    expect(validateDepositSol(1.0, balance).ok).toBe(false);
    expect(validateDepositSol(0.99, balance).ok).toBe(true);
  });

  it("accepts valid amounts and computes lamports", () => {
    const r = validateDepositSol(0.5, balance);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lamports).toBe(500_000_000n);
  });
});

describe("validateWithdrawSol", () => {
  const priv = 1.0;

  it("rejects <= 0 / NaN", () => {
    expect(validateWithdrawSol(0, priv).ok).toBe(false);
    expect(validateWithdrawSol(NaN, priv).ok).toBe(false);
  });

  it("rejects amounts above private balance", () => {
    expect(validateWithdrawSol(1.5, priv).ok).toBe(false);
  });

  it("accepts valid amounts and computes lamports", () => {
    const r = validateWithdrawSol(0.5, priv);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lamports).toBe(500_000_000n);
  });

  it("accepts exactly the private balance (max)", () => {
    expect(validateWithdrawSol(1.0, priv).ok).toBe(true);
  });
});

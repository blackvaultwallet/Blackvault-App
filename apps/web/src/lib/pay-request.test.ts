import { describe, it, expect } from "vitest";
import { buildPayLink, parsePayRequest } from "./pay-request";

const ADDR = "GDVxGXw6kvMZYTSAU8jv37EnWnKeEkKjq3t6AeQNybDH";

describe("buildPayLink", () => {
  it("builds link with amount", () => {
    expect(buildPayLink("https://x.app", { to: ADDR, amount: 0.5 })).toBe(
      `https://x.app/pay?to=${ADDR}&amount=0.5`
    );
  });

  it("omits amount when absent", () => {
    expect(buildPayLink("https://x.app", { to: ADDR })).toBe(
      `https://x.app/pay?to=${ADDR}`
    );
  });
});

describe("parsePayRequest", () => {
  it("parses valid params", () => {
    expect(parsePayRequest({ to: ADDR, amount: "0.5" })).toEqual({
      to: ADDR,
      amount: 0.5,
    });
  });

  it("rejects invalid address", () => {
    expect(parsePayRequest({ to: "not-an-address" })).toBeNull();
    expect(parsePayRequest({ to: null })).toBeNull();
  });

  it("drops invalid amount but keeps address", () => {
    expect(parsePayRequest({ to: ADDR, amount: "-3" })).toEqual({ to: ADDR });
    expect(parsePayRequest({ to: ADDR, amount: "abc" })).toEqual({ to: ADDR });
  });
});

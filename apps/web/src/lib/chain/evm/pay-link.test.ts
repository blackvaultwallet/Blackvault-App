import { describe, expect, it } from "vitest";
import { buildEvmPayLink, parseEvmPayRequest } from "./pay-link";

const ADDR = "0x55649E01B5Df198D18D95b5cc5051630cfD45564";

describe("parseEvmPayRequest", () => {
  it("parses a public address request", () => {
    const r = parseEvmPayRequest({ to: ADDR, amount: "1.5", token: "USDG", note: "hi" });
    expect(r).toEqual({ to: ADDR, amount: 1.5, token: "USDG", note: "hi", isPrivate: false });
  });

  it("flags stealth meta-addresses as private", () => {
    const r = parseEvmPayRequest({ to: "st:eth:0x02abc" });
    expect(r?.isPrivate).toBe(true);
  });

  it("rejects garbage and drops bad amounts", () => {
    expect(parseEvmPayRequest({ to: "not-an-address" })).toBeNull();
    expect(parseEvmPayRequest({ to: "" })).toBeNull();
    expect(parseEvmPayRequest({ to: ADDR, amount: "-3" })?.amount).toBeUndefined();
    expect(parseEvmPayRequest({ to: ADDR, amount: "abc" })?.amount).toBeUndefined();
  });
});

describe("buildEvmPayLink", () => {
  it("round-trips through parse", () => {
    const url = new URL(buildEvmPayLink("https://app.blackvault.cash", { to: ADDR, amount: 2, token: "ETH" }));
    const r = parseEvmPayRequest({
      to: url.searchParams.get("to"),
      amount: url.searchParams.get("amount"),
      token: url.searchParams.get("token"),
      note: url.searchParams.get("note"),
    });
    expect(r).toEqual({ to: ADDR, amount: 2, token: "ETH", note: undefined, isPrivate: false });
  });
});

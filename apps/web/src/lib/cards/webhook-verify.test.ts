import { describe, expect, it } from "vitest";
import { MAX_AGE_SECONDS, signWebhook, verifyWebhook } from "./webhook-verify";

const SECRET = "whsec_test";
const BODY = JSON.stringify({ type: "deposit.completed", data: { id: "F570D40793E8" } });
const NOW = 1_760_000_000;

const header = (ts: number, sig: string) => `t=${ts},v1=${sig}`;
const good = () => header(NOW, signWebhook(SECRET, NOW, BODY));

const check = (over: Partial<Parameters<typeof verifyWebhook>[0]> = {}) =>
  verifyWebhook({ secret: SECRET, rawBody: BODY, signature: good(), now: NOW, ...over });

describe("verifyWebhook", () => {
  it("accepts a correctly signed delivery", () => {
    expect(check()).toBe(true);
  });

  it("rejects a body that changed after signing", () => {
    expect(check({ rawBody: BODY.replace("F570D40793E8", "DEADBEEF") })).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(check({ secret: "whsec_other" })).toBe(false);
  });

  it("refuses to run with no secret configured", () => {
    expect(check({ secret: undefined })).toBe(false);
  });

  it("rejects a replay older than the tolerance", () => {
    expect(check({ now: NOW + MAX_AGE_SECONDS + 1 })).toBe(false);
    // Just inside the window still passes, in both directions — their clock
    // can legitimately run a little ahead of ours.
    expect(check({ now: NOW + MAX_AGE_SECONDS - 1 })).toBe(true);
    expect(check({ now: NOW - MAX_AGE_SECONDS + 1 })).toBe(true);
  });

  it("rejects a signature whose timestamp doesn't match the one it was signed with", () => {
    // Moving t= alone must invalidate it, since the timestamp is inside the mac.
    expect(check({ signature: header(NOW + 1, signWebhook(SECRET, NOW, BODY)) })).toBe(false);
  });

  it("rejects missing, malformed, and non-hex signatures", () => {
    expect(check({ signature: null })).toBe(false);
    expect(check({ signature: "garbage" })).toBe(false);
    expect(check({ signature: `t=${NOW}` })).toBe(false);
    expect(check({ signature: header(NOW, "zzzz") })).toBe(false);
    expect(check({ signature: `t=abc,v1=${signWebhook(SECRET, NOW, BODY)}` })).toBe(false);
  });

  it("doesn't throw when the signature is a different length", () => {
    // timingSafeEqual throws on mismatched lengths; this must be false, not a 500.
    expect(() => check({ signature: header(NOW, "ab") })).not.toThrow();
    expect(check({ signature: header(NOW, "ab") })).toBe(false);
  });

  it("prefers the explicit timestamp header when present", () => {
    const sig = header(NOW, signWebhook(SECRET, NOW, BODY));
    expect(check({ signature: sig, timestamp: String(NOW) })).toBe(true);
    expect(check({ signature: sig, timestamp: String(NOW + 1) })).toBe(false);
  });
});

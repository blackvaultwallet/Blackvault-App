// HMAC verification for Kripicard webhooks, kept separate from the route so it
// can be tested without standing up a request.
//
// Scheme per their docs: HMAC-SHA256 over `${timestamp}.${rawBody}`, delivered
// as `Kripicard-Signature: t=<unix>,v1=<hex>`, with anything older than five
// minutes treated as a replay.

import crypto from "crypto";

/** Their stated tolerance, in seconds. */
export const MAX_AGE_SECONDS = 300;

export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyWebhook(opts: {
  secret: string | undefined;
  rawBody: string;
  signature: string | null;
  timestamp?: string | null;
  /** Seconds since epoch; injectable so tests don't depend on the clock. */
  now?: number;
}): boolean {
  const { secret, rawBody, signature } = opts;
  if (!secret || !signature) return false;

  const parts = signature.split(",").map((p) => p.trim());
  const ts = opts.timestamp ?? parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
  if (!ts || !/^\d+$/.test(ts)) return false;

  const now = opts.now ?? Date.now() / 1000;
  if (Math.abs(now - Number(ts)) > MAX_AGE_SECONDS) return false;

  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3) ?? "";
  if (!/^[0-9a-f]+$/i.test(v1)) return false;

  const expected = signWebhook(secret, Number(ts), rawBody);
  // timingSafeEqual throws on a length mismatch, so screen for that first and
  // compare in constant time only once the lengths can match.
  if (v1.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
}

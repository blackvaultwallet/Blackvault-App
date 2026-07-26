// Per-IP rate limiting via Upstash Redis (REST, serverless-safe). Each caller
// names a bucket + budget; identity is the client IP from Vercel's headers.
// Without UPSTASH_* env the check is a no-op, so local dev and builds work
// with no Redis around.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// One limiter per bucket, cached across invocations of a warm instance.
const limiters = new Map<string, Ratelimit>();

function limiterFor(bucket: string, limit: number, windowSec: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${bucket}:${limit}:${windowSec}`;
  let l = limiters.get(key);
  if (!l) {
    l = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `bv:rl:${bucket}`,
    });
    limiters.set(key, l);
  }
  return l;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns null when allowed, or a ready 429 Response when over budget.
 * Fails open on Redis errors — an outage must not take the API down.
 */
export async function rateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowSec: number
): Promise<Response | null> {
  const l = limiterFor(bucket, limit, windowSec);
  if (!l) return null;
  try {
    const { success, reset } = await l.limit(clientIp(req));
    if (success) return null;
    return Response.json(
      { error: "rate limited" },
      {
        status: 429,
        headers: { "retry-after": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
      }
    );
  } catch {
    return null;
  }
}

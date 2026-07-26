// Small async helpers for RH testnet reads: retry flaky calls and run many in
// parallel with a concurrency cap (free-tier RPC rate limits).

export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts - 1) break;
      // 429s come from minute-window rate limits (Blockscout logs endpoint) —
      // they need seconds of backoff, not milliseconds. Other errors stay fast.
      const is429 = String((e as Error)?.message ?? e).includes("429");
      const base = is429 ? 2500 : 300;
      await new Promise((r) => setTimeout(r, Math.min(base * 2 ** i, 20_000)));
    }
  }
  throw last;
}

/** Map `fn` over `items` with at most `limit` promises in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

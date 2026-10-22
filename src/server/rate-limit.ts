type Bucket = { count: number; resetAt: number };

const globalForLimit = globalThis as unknown as {
  nexaRateBuckets?: Map<string, Bucket>;
};

const buckets = globalForLimit.nexaRateBuckets ?? new Map<string, Bucket>();
globalForLimit.nexaRateBuckets = buckets;

let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateResult = { ok: boolean; remaining: number; retryAfter: number };

/**
 * Fixed-window in-memory rate limiter. Suitable for a single Node process.
 * Replace with Redis in a multi-instance deployment (documented in README).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { ok: true, remaining: limit - existing.count, retryAfter: 0 };
}

export function resetRateLimit(key?: string) {
  if (key) buckets.delete(key);
  else buckets.clear();
}

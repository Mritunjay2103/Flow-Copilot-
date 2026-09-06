/**
 * In-memory per-instance request limiter for prototype abuse reduction.
 *
 * This is NOT a distributed production rate limiter. Limits reset when the
 * Node process restarts and are not shared across Vercel instances.
 */

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number };

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max requests per window. Default 30. */
  limit?: number;
  /** Window length in ms. Default 60_000. */
  windowMs?: number;
  /** Optional clock for tests. */
  now?: () => number;
};

/**
 * Check-and-consume one request for `key` (typically a client IP).
 */
export function consumeRateLimit(
  key: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  const limit = options.limit ?? 30;
  const windowMs = options.windowMs ?? 60_000;
  const now = (options.now ?? Date.now)();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Test helper — clears all buckets. */
export function resetRateLimitBuckets(): void {
  buckets.clear();
}

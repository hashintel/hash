/**
 * Vercel's edge overwrites `x-forwarded-for` with the real client IP and
 * refuses externally set values, so callers cannot spoof it there.
 * `x-vercel-forwarded-for` carries the same value behind a custom proxy.
 */
export const resolveClientIp = (request: Request): string | null => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-vercel-forwarded-for");
};

/**
 * Fixed-window request limit per client. Buckets live in function memory, so
 * they reset on cold start and are not shared between concurrent instances.
 */
export const createClientRateLimiter = ({
  windowMs,
  maxRequests,
  maxTrackedClients,
  now = Date.now,
}: {
  windowMs: number;
  maxRequests: number;
  maxTrackedClients: number;
  now?: () => number;
}) => {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (client: string): boolean => {
    const time = now();
    const current = buckets.get(client);
    if (current && current.resetAt > time) {
      if (current.count >= maxRequests) return false;
      current.count += 1;
      return true;
    }
    if (!current && buckets.size >= maxTrackedClients) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= time) buckets.delete(key);
      }
      if (buckets.size >= maxTrackedClients) return false;
    }
    buckets.set(client, { count: 1, resetAt: time + windowMs });
    return true;
  };
};

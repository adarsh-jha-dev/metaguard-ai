/**
 * A small per-IP sliding-window limiter for the /api/connect/* routes.
 *
 * These routes make the server open outbound connections to a host the caller
 * chooses. The SSRF guard already refuses internal addresses, but without a
 * limit a public deployment is still a free port-scanner against the internet.
 *
 * Honest about its limits: this is in-process state. On a serverless platform
 * each instance keeps its own counter, so it raises the cost of abuse rather
 * than eliminating it. A shared store (Redis, Upstash) is the real fix if this
 * ever needs to hold up under a determined attacker.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
/** Stop the map growing without bound on a long-lived instance. */
const MAX_TRACKED_CLIENTS = 5_000;

const hits = new Map<string, number[]>();

export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_TRACKED_CLIENTS) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

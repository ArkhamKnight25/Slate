/**
 * Simple in-memory sliding-window rate limiter.
 * Per-IP, resets after `windowMs`.
 * Bypassed entirely when the caller supplies their own Notion token.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

const WINDOW_MS = 60_000; // 1 minute

// Different limits per endpoint type
export const LIMITS = {
  import: 10,  // 10 imports per minute
  pages: 20,   // 20 page-list fetches per minute
  create: 5    // 5 page creations per minute
} as const;

export type LimitKey = keyof typeof LIMITS;

export function checkRateLimit(
  ip: string,
  key: LimitKey
): { allowed: boolean; remaining: number; resetAt: number } {
  const id = `${ip}:${key}`;
  const now = Date.now();
  const limit = LIMITS[key];

  let entry = store.get(id);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(id, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt
  };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

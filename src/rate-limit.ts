// Fixed-window rate limiting per store. In-memory for now; move to
// redis when we run more than one node.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limitPerMin: number = 100,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    const win = this.windows.get(key);
    if (!win || win.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + 60_000 });
      return { allowed: true, remaining: this.limitPerMin - 1, retryAfterSec: 0 };
    }
    win.count += 1;
    const allowed = win.count <= this.limitPerMin;
    return {
      allowed,
      remaining: Math.max(0, this.limitPerMin - win.count),
      retryAfterSec: allowed ? 0 : Math.ceil((win.resetAt - now) / 1000),
    };
  }
}

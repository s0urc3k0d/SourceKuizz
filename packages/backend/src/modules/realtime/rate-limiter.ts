export interface RateLimitRule {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private defaultRule: RateLimitRule) {}

  allow(key: string, rule: RateLimitRule = this.defaultRule): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (now - b.windowStart >= rule.windowMs) {
      b.windowStart = now;
      b.count = 1;
      return true;
    }
    if (b.count < rule.max) {
      b.count += 1;
      return true;
    }
    return false;
  }

  clear() { this.buckets.clear(); }
}

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
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private defaultRule: RateLimitRule, cleanupIntervalMs = 60000) {
    // Nettoyage périodique des buckets expirés pour éviter les fuites mémoire
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

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

  /** Supprime les buckets expirés pour libérer la mémoire */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.defaultRule.windowMs * 2) {
        this.buckets.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /** Arrête le nettoyage périodique (pour les tests ou l'arrêt propre) */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }

  clear() { this.buckets.clear(); }

  get size(): number { return this.buckets.size; }
}

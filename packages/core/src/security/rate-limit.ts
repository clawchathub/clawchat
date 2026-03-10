/**
 * Token bucket rate limiter for preventing abuse
 *
 * Uses token bucket algorithm with configurable:
 * - Rate: tokens added per second
 * - Burst: maximum tokens in bucket
 */

export interface RateLimitConfig {
  /** Tokens added per second */
  rate: number;
  /** Maximum tokens in bucket */
  burst: number;
  /** Window size in milliseconds for tracking */
  windowMs?: number;
}

export interface RateLimitState {
  tokens: number;
  lastUpdate: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetIn: number;
}

export class TokenBucketRateLimiter {
  private buckets: Map<string, RateLimitState> = new Map();
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      rate: config.rate,
      burst: config.burst,
      windowMs: config.windowMs ?? 60000, // Default 1 minute window
    };
  }

  /**
   * Try to consume tokens from a bucket
   */
  consume(key: string, tokens: number = 1): RateLimitResult {
    const now = Date.now();
    const bucket = this.getOrCreateBucket(key, now);

    // Refill tokens based on time elapsed
    const elapsed = (now - bucket.lastUpdate) / 1000;
    bucket.tokens = Math.min(
      this.config.burst,
      bucket.tokens + elapsed * this.config.rate
    );
    bucket.lastUpdate = now;

    // Try to consume
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return {
        allowed: true,
        remainingTokens: bucket.tokens,
        resetIn: 0,
      };
    }

    // Calculate time until enough tokens
    const needed = tokens - bucket.tokens;
    const resetIn = Math.ceil((needed / this.config.rate) * 1000);

    return {
      allowed: false,
      remainingTokens: bucket.tokens,
      resetIn,
    };
  }

  /**
   * Check if action is allowed without consuming tokens
   */
  peek(key: string, tokens: number = 1): boolean {
    const now = Date.now();
    const bucket = this.getOrCreateBucket(key, now);

    const elapsed = (now - bucket.lastUpdate) / 1000;
    const availableTokens = Math.min(
      this.config.burst,
      bucket.tokens + elapsed * this.config.rate
    );

    return availableTokens >= tokens;
  }

  /**
   * Get remaining tokens for a key
   */
  getRemaining(key: string): number {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return this.config.burst;
    }

    const elapsed = (now - bucket.lastUpdate) / 1000;
    return Math.min(
      this.config.burst,
      bucket.tokens + elapsed * this.config.rate
    );
  }

  /**
   * Reset bucket for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Clean up old buckets
   */
  cleanup(): number {
    const now = Date.now();
    const threshold = now - this.config.windowMs;
    let cleaned = 0;

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.lastUpdate < threshold) {
        this.buckets.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  private getOrCreateBucket(key: string, now: number): RateLimitState {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.burst,
        lastUpdate: now,
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }
}

/**
 * Predefined rate limit presets
 */
export const RateLimitPresets = {
  /** For message sending - 10 messages per second, burst of 20 */
  messaging: { rate: 10, burst: 20 },

  /** For API calls - 100 calls per second, burst of 200 */
  api: { rate: 100, burst: 200 },

  /** For authentication - 5 attempts per second, burst of 10 */
  auth: { rate: 5, burst: 10 },

  /** For relay connections - 50 connections per second, burst of 100 */
  relay: { rate: 50, burst: 100 },
} as const;

/**
 * Multi-key rate limiter with different limits per category
 */
export class MultiRateLimiter {
  private limiters: Map<string, TokenBucketRateLimiter> = new Map();

  addCategory(name: string, config: RateLimitConfig): void {
    this.limiters.set(name, new TokenBucketRateLimiter(config));
  }

  consume(category: string, key: string, tokens?: number): RateLimitResult {
    const limiter = this.limiters.get(category);
    if (!limiter) {
      throw new Error(`Unknown rate limit category: ${category}`);
    }
    return limiter.consume(key, tokens);
  }

  peek(category: string, key: string, tokens?: number): boolean {
    const limiter = this.limiters.get(category);
    if (!limiter) {
      throw new Error(`Unknown rate limit category: ${category}`);
    }
    return limiter.peek(key, tokens);
  }

  cleanup(): void {
    for (const limiter of this.limiters.values()) {
      limiter.cleanup();
    }
  }
}
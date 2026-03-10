import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenBucketRateLimiter,
  MultiRateLimiter,
  RateLimitPresets,
} from '../src/security/rate-limit.js';

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new TokenBucketRateLimiter({
      rate: 10,
      burst: 20,
    });
  });

  it('should allow consuming tokens within burst limit', () => {
    const result = limiter.consume('user1', 5);
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(15);
  });

  it('should deny consuming more tokens than available', () => {
    const result = limiter.consume('user1', 25);
    expect(result.allowed).toBe(false);
  });

  it('should track multiple keys independently', () => {
    const result1 = limiter.consume('user1', 10);
    const result2 = limiter.consume('user2', 10);

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });

  it('should reset bucket', () => {
    limiter.consume('user1', 10);
    limiter.reset('user1');
    expect(limiter.getRemaining('user1')).toBe(20);
  });

  it('should clear all buckets', () => {
    limiter.consume('user1', 10);
    limiter.consume('user2', 10);
    limiter.clear();
    expect(limiter.getRemaining('user1')).toBe(20);
    expect(limiter.getRemaining('user2')).toBe(20);
  });

  it('should allow peeking without consuming', () => {
    expect(limiter.peek('user1', 10)).toBe(true);
    expect(limiter.getRemaining('user1')).toBe(20);
  });

  it('should calculate reset time when denied', () => {
    const result = limiter.consume('user1', 25);
    expect(result.allowed).toBe(false);
    expect(result.resetIn).toBeGreaterThan(0);
  });

  it('should support cleanup of old buckets', () => {
    limiter.consume('user1', 10);
    const cleaned = limiter.cleanup();
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});

describe('MultiRateLimiter', () => {
  let multiLimiter: MultiRateLimiter;

  beforeEach(() => {
    multiLimiter = new MultiRateLimiter();
    multiLimiter.addCategory('messaging', RateLimitPresets.messaging);
    multiLimiter.addCategory('api', RateLimitPresets.api);
  });

  it('should track different categories separately', () => {
    const msgResult = multiLimiter.consume('messaging', 'user1', 10);
    const apiResult = multiLimiter.consume('api', 'user1', 50);

    expect(msgResult.allowed).toBe(true);
    expect(apiResult.allowed).toBe(true);
  });

  it('should throw for unknown category', () => {
    expect(() => multiLimiter.consume('unknown', 'user1')).toThrow();
  });
});
/**
 * Relay Server Middleware
 * Validation and rate limiting functions for relay server
 */

import type { AgentCard } from '@clawchat/core';
import { TokenBucketRateLimiter } from '@clawchat/core';

export const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB

/**
 * Validate message size
 */
export function validateMessageSize(data: Buffer): { valid: boolean; error?: string } {
  if (data.length > MAX_MESSAGE_SIZE) {
    return { valid: false, error: 'Message too large' };
  }
  return { valid: true };
}

/**
 * Validate agent card structure
 */
export function validateRelayAgentCard(card: unknown): { valid: boolean; error?: string } {
  if (!card || typeof card !== 'object') {
    return { valid: false, error: 'Invalid agent card format' };
  }
  const c = card as AgentCard;
  if (!c.identity || !c.identity.name || !c.identity.url) {
    return { valid: false, error: 'Agent card missing required fields (identity.name, identity.url)' };
  }
  return { valid: true };
}

/**
 * Check rate limit
 */
export function checkRateLimit(
  limiter: TokenBucketRateLimiter,
  key: string
): { allowed: boolean; error?: string } {
  const result = limiter.consume(key);
  if (!result.allowed) {
    return { allowed: false, error: 'Rate limited - too many registration attempts' };
  }
  return { allowed: true };
}

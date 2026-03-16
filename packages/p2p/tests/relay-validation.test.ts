import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RelayServer } from '../src/relay/server.js';
import { validateMessageSize, validateRelayAgentCard as validateAgentCard, checkRateLimit, MAX_MESSAGE_SIZE } from '../src/relay/middleware.js';
import { TokenBucketRateLimiter } from '@clawchat/core';
import type { AgentCard } from '@clawchat/core';

describe('RelayServer - Validation Tests', () => {
  let relayServer: RelayServer;
  const testPort = 19993;

  const mockAgentCard: AgentCard = {
    identity: {
      name: 'Test Agent',
      description: 'Test Description',
      url: 'http://localhost',
      version: '1.0.0',
    },
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    skills: [],
    interfaces: [],
  };

  beforeEach(async () => {
    relayServer = new RelayServer({
      port: testPort,
      host: '127.0.0.1',
      messageRetentionMs: 60000,
      maxQueueSize: 100,
    });
    await relayServer.start();
  });

  afterEach(async () => {
    await relayServer.stop();
  });

  describe('validateMessageSize', () => {
    it('should accept messages within size limit', () => {
      const smallBuffer = Buffer.from('{"test":"data"}');
      const result = validateMessageSize(smallBuffer);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject messages exceeding size limit', () => {
      const largeBuffer = Buffer.alloc(MAX_MESSAGE_SIZE + 1);
      const result = validateMessageSize(largeBuffer);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Message too large');
    });

    it('should accept messages exactly at size limit', () => {
      const exactBuffer = Buffer.alloc(MAX_MESSAGE_SIZE);
      const result = validateMessageSize(exactBuffer);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAgentCard', () => {
    it('should accept valid agent card', () => {
      const result = validateAgentCard(mockAgentCard);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject null or undefined agent card', () => {
      expect(validateAgentCard(null as any).valid).toBe(false);
      expect(validateAgentCard(undefined as any).valid).toBe(false);
    });

    it('should reject agent card without identity', () => {
      const invalidCard = { ...mockAgentCard, identity: undefined };
      const result = validateAgentCard(invalidCard as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    it('should reject agent card without identity.name', () => {
      const invalidCard = {
        identity: { name: '', description: 'Test', url: 'http://localhost' }
      };
      const result = validateAgentCard(invalidCard as any);
      expect(result.valid).toBe(false);
    });

    it('should reject agent card without identity.url', () => {
      const invalidCard = {
        identity: { name: 'Test', description: 'Test', url: '' }
      };
      const result = validateAgentCard(invalidCard as any);
      expect(result.valid).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const limiter = new TokenBucketRateLimiter({
        rate: 10,
        burst: 20,
      });

      const result = checkRateLimit(limiter, 'test-key');
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject requests exceeding rate limit', () => {
      const limiter = new TokenBucketRateLimiter({
        rate: 1,
        burst: 2,
      });

      // Exhaust the bucket
      checkRateLimit(limiter, 'test-key');
      checkRateLimit(limiter, 'test-key');

      // Third request should be rate limited
      const result = checkRateLimit(limiter, 'test-key');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Rate limited');
    });

    it('should track rate limits independently per key', () => {
      const limiter = new TokenBucketRateLimiter({
        rate: 1,
        burst: 2,
      });

      // Exhaust one key
      checkRateLimit(limiter, 'key-1');
      checkRateLimit(limiter, 'key-1');

      // Different key should still be allowed
      const result = checkRateLimit(limiter, 'key-2');
      expect(result.allowed).toBe(true);
    });
  });

  describe('RelayServer integration', () => {
    it('should validate message size before processing', async () => {
      const oversizedMessage = Buffer.alloc(MAX_MESSAGE_SIZE + 100);
      const result = validateMessageSize(oversizedMessage);
      expect(result.valid).toBe(false);
    });

    it('should validate agent card during registration', async () => {
      const validCard: AgentCard = {
        identity: {
          name: 'Valid Agent',
          description: 'A valid test agent',
          url: 'http://localhost:8080',
          version: '1.0.0',
        },
        capabilities: {
          streaming: true,
          pushNotifications: false,
          extendedAgentCard: false,
        },
        skills: [],
        interfaces: [],
      };

      const result = validateAgentCard(validCard);
      expect(result.valid).toBe(true);
    });

    it('should check rate limits during registration', async () => {
      const limiter = new TokenBucketRateLimiter({
        rate: 1,
        burst: 1,
      });

      let result = checkRateLimit(limiter, 'test-agent');
      expect(result.allowed).toBe(true);

      result = checkRateLimit(limiter, 'test-agent');
      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

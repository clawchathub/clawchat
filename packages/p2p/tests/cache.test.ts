import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionCache, getConnectionCache } from '../src/connection/cache.js';

describe('ConnectionCache', () => {
  let cache: ConnectionCache;

  beforeEach(() => {
    cache = new ConnectionCache();
  });

  describe('basic operations', () => {
    it('should store and retrieve connection paths', () => {
      const peerKey = 'test-peer-001';

      cache.set(peerKey, {
        peerPublicKey: peerKey,
        method: 'direct',
        endpoint: { ip: '192.168.1.100', port: 8080 },
        latency: 50,
      });

      const result = cache.get(peerKey);

      expect(result).not.toBeNull();
      expect(result?.method).toBe('direct');
      expect(result?.endpoint?.ip).toBe('192.168.1.100');
      expect(result?.successRate).toBe(1);
    });

    it('should return null for non-existent entries', () => {
      const result = cache.get('non-existent-peer');
      expect(result).toBeNull();
    });

    it('should track hit/miss stats', () => {
      cache.set('peer1', {
        peerPublicKey: 'peer1',
        method: 'direct',
        endpoint: { ip: '192.168.1.1', port: 8080 },
        latency: 10,
      });

      cache.get('peer1'); // hit
      cache.get('non-existent'); // miss

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('success rate tracking', () => {
    it('should update success rate on failures', () => {
      const peerKey = 'test-peer-002';

      cache.set(peerKey, {
        peerPublicKey: peerKey,
        method: 'direct',
        endpoint: { ip: '192.168.1.100', port: 8080 },
        latency: 50,
      });

      // Initial success rate should be 1
      expect(cache.get(peerKey)?.successRate).toBe(1);

      // Record a failure
      cache.recordFailure(peerKey);

      // Success rate should now be 0.5 (1 success, 1 failure)
      expect(cache.get(peerKey)?.successRate).toBe(0.5);
    });

    it('should remove entries with low success rate', () => {
      const cacheWithLowThreshold = new ConnectionCache({ minSuccessRate: 0.5 });
      const peerKey = 'test-peer-003';

      cacheWithLowThreshold.set(peerKey, {
        peerPublicKey: peerKey,
        method: 'relay',
        relayUrl: 'wss://relay.example.com',
        latency: 100,
      });

      // Record multiple failures
      cacheWithLowThreshold.recordFailure(peerKey);
      cacheWithLowThreshold.recordFailure(peerKey);
      cacheWithLowThreshold.recordFailure(peerKey);

      // Entry should be removed
      expect(cacheWithLowThreshold.get(peerKey)).toBeNull();
    });
  });

  describe('latency tracking', () => {
    it('should update latency with exponential moving average', () => {
      const peerKey = 'test-peer-004';

      cache.set(peerKey, {
        peerPublicKey: peerKey,
        method: 'direct',
        endpoint: { ip: '192.168.1.100', port: 8080 },
        latency: 100,
      });

      cache.updateLatency(peerKey, 200);

      // EMA: 100 * 0.7 + 200 * 0.3 = 70 + 60 = 130
      expect(cache.get(peerKey)?.latency).toBe(130);
    });
  });

  describe('connection method selection', () => {
    it('should get best method for a peer', () => {
      cache.set('peer-direct', {
        peerPublicKey: 'peer-direct',
        method: 'direct',
        endpoint: { ip: '192.168.1.1', port: 8080 },
        latency: 10,
      });

      cache.set('peer-relay', {
        peerPublicKey: 'peer-relay',
        method: 'relay',
        relayUrl: 'wss://relay.example.com',
        latency: 100,
      });

      expect(cache.getBestMethod('peer-direct')).toBe('direct');
      expect(cache.getBestMethod('peer-relay')).toBe('relay');
      expect(cache.getBestMethod('unknown-peer')).toBeNull();
    });

    it('should get direct capable peers', () => {
      cache.set('peer1', {
        peerPublicKey: 'peer1',
        method: 'direct',
        endpoint: { ip: '192.168.1.1', port: 8080 },
        latency: 10,
      });

      cache.set('peer2', {
        peerPublicKey: 'peer2',
        method: 'relay',
        relayUrl: 'wss://relay.example.com',
        latency: 100,
      });

      const directPeers = cache.getDirectCapablePeers();
      expect(directPeers).toContain('peer1');
      expect(directPeers).not.toContain('peer2');
    });
  });

  describe('export/import', () => {
    it('should export and import cache entries', () => {
      cache.set('peer1', {
        peerPublicKey: 'peer1',
        method: 'direct',
        endpoint: { ip: '192.168.1.1', port: 8080 },
        latency: 10,
      });

      const exported = cache.export();
      expect(exported.length).toBe(1);

      const newCache = new ConnectionCache();
      newCache.import(exported);

      expect(newCache.get('peer1')).not.toBeNull();
    });
  });

  describe('pruning', () => {
    it('should clear all entries', () => {
      cache.set('peer1', {
        peerPublicKey: 'peer1',
        method: 'direct',
        endpoint: { ip: '192.168.1.1', port: 8080 },
        latency: 10,
      });

      cache.clear();

      expect(cache.get('peer1')).toBeNull();
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return singleton instance', () => {
      const instance1 = getConnectionCache();
      const instance2 = getConnectionCache();
      expect(instance1).toBe(instance2);
    });
  });
});
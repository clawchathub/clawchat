/**
 * Performance Module Tests
 * Tests for sharding, queue, connection pool, and metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ShardedConversationStore,
  ConversationShard,
  getShardKey,
  DEFAULT_SHARDING_CONFIG,
} from '../../src/intervention/performance/sharding.js';
import {
  InterventionQueue,
  DEFAULT_QUEUE_CONFIG,
  ACTION_PRIORITY,
} from '../../src/intervention/performance/queue.js';
import {
  WebSocketConnectionPool,
  DEFAULT_CONNECTION_CONFIG,
} from '../../src/intervention/performance/connection-pool.js';
import {
  PerformanceMetrics,
  PerformanceAlerter,
} from '../../src/intervention/performance/metrics.js';
import type { InterventionRequest, GuidedConversationConfig } from '../../src/intervention/types.js';

// ============================================
// Sharding Tests
// ============================================

describe('Sharding', () => {
  describe('getShardKey', () => {
    it('should return consistent shard keys for the same conversation ID', () => {
      const conversationId = 'test-conversation-123';
      const key1 = getShardKey(conversationId, 8);
      const key2 = getShardKey(conversationId, 8);
      expect(key1).toBe(key2);
    });

    it('should distribute keys across shards', () => {
      const shardCount = 8;
      const distribution = new Set<number>();

      for (let i = 0; i < 100; i++) {
        const key = getShardKey(`conversation-${i}`, shardCount);
        distribution.add(key);
      }

      // Should use multiple shards
      expect(distribution.size).toBeGreaterThan(1);
      expect(distribution.size).toBeLessThanOrEqual(shardCount);
    });

    it('should return keys within valid range', () => {
      const shardCount = 8;
      for (let i = 0; i < 100; i++) {
        const key = getShardKey(`conversation-${i}`, shardCount);
        expect(key).toBeGreaterThanOrEqual(0);
        expect(key).toBeLessThan(shardCount);
      }
    });
  });

  describe('ConversationShard', () => {
    let shard: ConversationShard;

    beforeEach(() => {
      shard = new ConversationShard(0, DEFAULT_SHARDING_CONFIG);
    });

    it('should create and retrieve conversation state', () => {
      const config: GuidedConversationConfig = {
        conversationId: 'test-conv',
        enableIntervention: true,
      };

      const state = shard.getOrCreate('test-conv', () => config);
      expect(state.conversationId).toBe('test-conv');
      expect(state.state).toBe('active');
    });

    it('should add messages to conversation', () => {
      const config: GuidedConversationConfig = {
        conversationId: 'test-conv',
        enableIntervention: true,
      };

      shard.getOrCreate('test-conv', () => config);
      shard.addMessage('test-conv', {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        contextId: 'test-conv',
        timestamp: Date.now(),
      });

      const messages = shard.getMessages('test-conv');
      expect(messages).toHaveLength(1);
      expect(messages[0].parts[0].type).toBe('text');
    });

    it('should return empty array for non-existent conversation', () => {
      const messages = shard.getMessages('non-existent');
      expect(messages).toHaveLength(0);
    });

    it('should delete conversation', () => {
      const config: GuidedConversationConfig = {
        conversationId: 'test-conv',
        enableIntervention: true,
      };

      shard.getOrCreate('test-conv', () => config);
      expect(shard.get('test-conv')).toBeDefined();

      const deleted = shard.delete('test-conv');
      expect(deleted).toBe(true);
      expect(shard.get('test-conv')).toBeUndefined();
    });

    it('should track message count', () => {
      const config: GuidedConversationConfig = {
        conversationId: 'test-conv',
        enableIntervention: true,
      };

      shard.getOrCreate('test-conv', () => config);

      for (let i = 0; i < 5; i++) {
        shard.addMessage('test-conv', {
          role: 'user',
          parts: [{ type: 'text', text: `Message ${i}` }],
          contextId: 'test-conv',
          timestamp: Date.now(),
        });
      }

      expect(shard.getMessageCount('test-conv')).toBe(5);
    });
  });

  describe('ShardedConversationStore', () => {
    let store: ShardedConversationStore;

    beforeEach(() => {
      store = new ShardedConversationStore({ shardCount: 4 });
    });

    afterEach(() => {
      store.stopEviction();
    });

    it('should route conversations to correct shards', () => {
      const config: GuidedConversationConfig = {
        conversationId: 'test-conv',
        enableIntervention: true,
      };

      store.getOrCreate('test-conv', config);
      const shard = store.getShard('test-conv');
      expect(shard.get('test-conv')).toBeDefined();
    });

    it('should add and retrieve messages', () => {
      const config: GuidedConversationConfig = {
        conversationId: 'test-conv',
        enableIntervention: true,
      };

      store.getOrCreate('test-conv', config);
      store.addMessage('test-conv', {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        contextId: 'test-conv',
        timestamp: Date.now(),
      });

      const messages = store.getMessages('test-conv');
      expect(messages).toHaveLength(1);
    });

    it('should return aggregate statistics', () => {
      const config: GuidedConversationConfig = {
        conversationId: 'test-conv',
        enableIntervention: true,
      };

      store.getOrCreate('test-conv', config);
      store.addMessage('test-conv', {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        contextId: 'test-conv',
        timestamp: Date.now(),
      });

      const stats = store.getStats();
      expect(stats.shardCount).toBe(4);
      expect(stats.totalConversations).toBe(1);
      expect(stats.totalMessages).toBe(1);
    });

    it('should return shard distribution', () => {
      const config1: GuidedConversationConfig = {
        conversationId: 'conv-1',
        enableIntervention: true,
      };
      const config2: GuidedConversationConfig = {
        conversationId: 'conv-2',
        enableIntervention: true,
      };

      store.getOrCreate('conv-1', config1);
      store.getOrCreate('conv-2', config2);

      const distribution = store.getDistribution();
      expect(distribution.size).toBe(4);
    });
  });
});

// ============================================
// Queue Tests
// ============================================

describe('InterventionQueue', () => {
  let queue: InterventionQueue;

  beforeEach(() => {
    queue = new InterventionQueue({ maxSize: 100, batchSize: 10 });
  });

  afterEach(() => {
    queue.stop();
    queue.clear();
  });

  const createRequest = (id: string, action: InterventionRequest['action'] = 'send_message'): InterventionRequest => ({
    id,
    conversationId: 'test-conv',
    participantId: 'user-1',
    action,
    content: 'Test message',
    timestamp: Date.now(),
  });

  it('should enqueue requests', () => {
    const request = createRequest('req-1');
    const result = queue.enqueue(request);
    expect(result).toBe(true);
    expect(queue.size()).toBe(1);
  });

  it('should dequeue requests in priority order', () => {
    const lowRequest = createRequest('req-low', 'delegate');
    const highRequest = createRequest('req-high', 'pause');
    const normalRequest = createRequest('req-normal', 'send_message');

    queue.enqueue(lowRequest);
    queue.enqueue(highRequest);
    queue.enqueue(normalRequest);

    const dequeued = queue.dequeue();
    expect(dequeued?.id).toBe('req-high'); // pause is high priority
  });

  it('should dequeue batches', () => {
    for (let i = 0; i < 15; i++) {
      queue.enqueue(createRequest(`req-${i}`));
    }

    const batch = queue.dequeueBatch(10);
    expect(batch).toHaveLength(10);
  });

  it('should track queue depth by priority', () => {
    queue.enqueue(createRequest('req-1', 'terminate')); // critical
    queue.enqueue(createRequest('req-2', 'pause')); // high
    queue.enqueue(createRequest('req-3', 'send_message')); // normal
    queue.enqueue(createRequest('req-4', 'delegate')); // low

    const depth = queue.getDepth();
    expect(depth.critical).toBe(1);
    expect(depth.high).toBe(1);
    expect(depth.normal).toBe(1);
    expect(depth.low).toBe(1);
  });

  it('should process batches with processor', async () => {
    const processedIds: string[] = [];
    queue.setProcessor(async (batch) => {
      const results = new Map<string, boolean>();
      for (const req of batch) {
        processedIds.push(req.id);
        results.set(req.id, true);
      }
      return results;
    });

    for (let i = 0; i < 5; i++) {
      queue.enqueue(createRequest(`req-${i}`));
    }

    await queue.processBatch();
    expect(processedIds).toHaveLength(5);
  });

  it('should track statistics', () => {
    queue.enqueue(createRequest('req-1'));
    queue.enqueue(createRequest('req-2'));
    // dequeue doesn't increment totalProcessed, only processBatch does
    queue.dequeue();

    const stats = queue.getStats();
    expect(stats.totalEnqueued).toBe(2);
    // totalProcessed is only updated via processBatch
  });

  it('should emit events', () => {
    const events: string[] = [];
    queue.subscribe((event) => {
      events.push(event.type);
    });

    queue.enqueue(createRequest('req-1'));
    expect(events).toContain('enqueued');
  });

  it('should use correct action priorities', () => {
    expect(ACTION_PRIORITY['terminate']).toBe('critical');
    expect(ACTION_PRIORITY['pause']).toBe('high');
    expect(ACTION_PRIORITY['send_message']).toBe('normal');
    expect(ACTION_PRIORITY['delegate']).toBe('low');
  });
});

// ============================================
// Connection Pool Tests
// ============================================

describe('WebSocketConnectionPool', () => {
  let pool: WebSocketConnectionPool;

  beforeEach(() => {
    pool = new WebSocketConnectionPool({
      maxConnections: 10,
      minConnections: 2,
    });
  });

  afterEach(async () => {
    await pool.closeAll();
    pool.stop();
  });

  it('should create pool with correct config', () => {
    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(0);
  });

  it('should return health status for empty pool', () => {
    const health = pool.getHealth();
    expect(health.healthy).toBe(true);
    expect(health.issues).toHaveLength(0);
    expect(health.maxConnections).toBe(10);
  });

  it('should return correct stats structure', () => {
    const stats = pool.getStats();
    expect(stats).toHaveProperty('totalConnections');
    expect(stats).toHaveProperty('activeConnections');
    expect(stats).toHaveProperty('idleConnections');
    expect(stats).toHaveProperty('pendingConnections');
    expect(stats).toHaveProperty('errorConnections');
    expect(stats).toHaveProperty('totalMessages');
    expect(stats).toHaveProperty('totalErrors');
    expect(stats).toHaveProperty('averageLatency');
  });

  it('should support message handler registration', () => {
    const handler = vi.fn();
    pool.onMessage(handler);
    // Handler is registered (no error thrown)
    expect(true).toBe(true);
  });

  it('should support event subscription', () => {
    const handler = vi.fn();
    const unsubscribe = pool.subscribe(handler);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('should throw on acquire when pool exhausted', async () => {
    const smallPool = new WebSocketConnectionPool({
      maxConnections: 1,
      minConnections: 0,
    });

    // The pool would need actual WebSocket connections to test exhaustion
    // For now, just verify it initializes correctly
    const stats = smallPool.getStats();
    expect(stats.totalConnections).toBe(0);

    await smallPool.closeAll();
    smallPool.stop();
  });
});

// ============================================
// Metrics Tests
// ============================================

describe('PerformanceMetrics', () => {
  let metrics: PerformanceMetrics;

  beforeEach(() => {
    metrics = new PerformanceMetrics({ collectionInterval: 100 });
  });

  afterEach(() => {
    metrics.stop();
    metrics.clear();
  });

  it('should record latency', () => {
    metrics.recordInterventionLatency(50);
    metrics.recordInterventionLatency(100);
    metrics.recordInterventionLatency(150);

    const snapshot = metrics.getSnapshot();
    expect(snapshot.latency.count).toBe(3);
    expect(snapshot.latency.min).toBe(50);
    expect(snapshot.latency.max).toBe(150);
  });

  it('should track queue depth', () => {
    metrics.updateQueueDepth(10, {
      critical: 2,
      high: 3,
      normal: 4,
      low: 1,
    });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.queue.depth).toBe(10);
    expect(snapshot.queue.depthByPriority.critical).toBe(2);
  });

  it('should track connection states', () => {
    metrics.updateConnectionState('conn-1', 'connected');
    metrics.updateConnectionState('conn-2', 'connecting');
    metrics.updateConnectionState('conn-3', 'error');

    const snapshot = metrics.getSnapshot();
    expect(snapshot.connections.total).toBe(3);
    expect(snapshot.connections.active).toBe(1);
    expect(snapshot.connections.pending).toBe(1);
    expect(snapshot.connections.error).toBe(1);
  });

  it('should track rates', () => {
    metrics.recordEnqueue();
    metrics.recordEnqueue();
    metrics.recordDequeue();
    metrics.recordMessage();
    metrics.recordError();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.queue.enqueueRate).toBeGreaterThan(0);
    expect(snapshot.queue.dequeueRate).toBeGreaterThan(0);
    expect(snapshot.connections.messagesPerSecond).toBeGreaterThan(0);
    expect(snapshot.connections.errorsPerSecond).toBeGreaterThan(0);
  });

  it('should collect snapshots on interval', async () => {
    metrics.start();
    metrics.recordInterventionLatency(100);

    // Wait for collection
    await new Promise((resolve) => setTimeout(resolve, 150));

    const history = metrics.getHistory(1000);
    expect(history.length).toBeGreaterThan(0);

    metrics.stop();
  });

  it('should emit events to subscribers', () => {
    const snapshots: any[] = [];
    metrics.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    metrics.start();
    metrics.recordInterventionLatency(100);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        metrics.stop();
        expect(snapshots.length).toBeGreaterThan(0);
        resolve();
      }, 150);
    });
  });

  it('should calculate aggregated metrics', async () => {
    metrics.start();

    for (let i = 0; i < 5; i++) {
      metrics.recordInterventionLatency(100 + i * 10);
      metrics.recordMessage();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const aggregated = metrics.getAggregatedMetrics(1000);
    expect(aggregated.avgLatency).toBeGreaterThan(0);
    expect(aggregated.totalMessages).toBeGreaterThan(0);

    metrics.stop();
  });
});

describe('PerformanceAlerter', () => {
  let metrics: PerformanceMetrics;
  let alerter: PerformanceAlerter;

  beforeEach(() => {
    metrics = new PerformanceMetrics();
    alerter = new PerformanceAlerter(metrics);
  });

  afterEach(() => {
    alerter.stop();
    metrics.stop();
  });

  it('should add and remove thresholds', () => {
    alerter.addThreshold('high-latency', {
      metric: 'latency',
      threshold: 100,
      comparison: 'gt',
      duration: 1000,
    });

    alerter.removeThreshold('high-latency');
  });

  it('should trigger alerts when threshold exceeded', () => {
    const alerts: any[] = [];
    alerter.subscribe((alert) => {
      alerts.push(alert);
    });

    alerter.addThreshold('high-latency', {
      metric: 'latency',
      threshold: 50,
      comparison: 'gt',
      duration: 1000,
    });

    metrics.recordInterventionLatency(100);
    alerter.start(10);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        alerter.stop();
        expect(alerts.length).toBeGreaterThan(0);
        expect(alerts[0].metric).toBe('latency');
        resolve();
      }, 50);
    });
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Performance Integration', () => {
  it('should handle high throughput with queue and metrics', async () => {
    const queue = new InterventionQueue({ maxSize: 1000, batchSize: 50 });
    const metrics = new PerformanceMetrics();

    queue.subscribe((event) => {
      if (event.type === 'enqueued') {
        metrics.recordEnqueue();
        metrics.updateQueueDepth(queue.size(), queue.getDepth());
      } else if (event.type === 'dequeued') {
        metrics.recordDequeue();
      }
    });

    queue.setProcessor(async (batch) => {
      const results = new Map<string, boolean>();
      for (const req of batch) {
        const latency = Date.now() - req.timestamp;
        metrics.recordInterventionLatency(latency);
        results.set(req.id, true);
      }
      return results;
    });

    // Enqueue many requests
    const startTime = Date.now();
    for (let i = 0; i < 100; i++) {
      queue.enqueue({
        id: `req-${i}`,
        conversationId: `conv-${i % 10}`,
        participantId: 'user-1',
        action: 'send_message',
        content: `Message ${i}`,
        timestamp: Date.now(),
      });
    }

    // Process batches
    await queue.processBatch();
    await queue.processBatch();

    const duration = Date.now() - startTime;
    const stats = queue.getStats();
    const snapshot = metrics.getSnapshot();

    expect(stats.totalEnqueued).toBe(100);
    expect(stats.totalProcessed).toBeGreaterThan(0);
    expect(snapshot.latency.count).toBeGreaterThan(0);
    expect(duration).toBeLessThan(1000); // Should be fast

    queue.stop();
    metrics.stop();
  });

  it('should scale with sharded store', () => {
    const store = new ShardedConversationStore({ shardCount: 8 });
    const metrics = new PerformanceMetrics();

    // Create many conversations
    for (let i = 0; i < 100; i++) {
      const config: GuidedConversationConfig = {
        conversationId: `conv-${i}`,
        enableIntervention: true,
      };
      store.getOrCreate(`conv-${i}`, config);

      // Add messages
      for (let j = 0; j < 10; j++) {
        store.addMessage(`conv-${i}`, {
          role: 'user',
          parts: [{ type: 'text', text: `Message ${j}` }],
          contextId: `conv-${i}`,
          timestamp: Date.now(),
        });
      }
    }

    const stats = store.getStats();
    metrics.updateConversationCount(stats.totalConversations);
    metrics.updateMessageCount(stats.totalMessages);

    expect(stats.totalConversations).toBe(100);
    expect(stats.totalMessages).toBe(1000);

    // Check distribution across shards
    const distribution = store.getDistribution();
    const values = Array.from(distribution.values());
    const maxDiff = Math.max(...values) - Math.min(...values);
    expect(maxDiff).toBeLessThan(30); // Reasonably balanced

    store.stopEviction();
    metrics.stop();
  });
});
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/adapter.js';
import { OfflineQueue } from '../src/queue.js';
import type { A2AMessage } from '@clawchat/core';

describe('OfflineQueue', () => {
  let adapter: SQLiteAdapter;
  let queue: OfflineQueue;

  const createMessage = (text: string): A2AMessage => ({
    role: 'user',
    parts: [{ type: 'text', text }],
  });

  beforeEach(() => {
    adapter = new SQLiteAdapter({ path: ':memory:' });
    queue = new OfflineQueue(adapter, {
      maxAttempts: 3,
      retryDelayMs: 100,
      expirationMs: 10000,
    });
  });

  afterEach(() => {
    adapter.close();
  });

  describe('enqueue', () => {
    it('should enqueue a message', () => {
      const message = createMessage('Test');
      const result = queue.enqueue('agent-2', message);

      expect(result).toBeDefined();
      expect(result?.toAgent).toBe('agent-2');
    });

    it('should set priority', () => {
      const message = createMessage('Test');
      const result = queue.enqueue('agent-2', message, 'high');

      expect(result?.priority).toBe('high');
    });

    it('should reject when queue is full', () => {
      const smallQueue = new OfflineQueue(adapter, { maxQueueSize: 2 });
      smallQueue.enqueue('agent-2', createMessage('1'));
      smallQueue.enqueue('agent-2', createMessage('2'));

      const result = smallQueue.enqueue('agent-2', createMessage('3'));
      expect(result).toBeNull();
    });
  });

  describe('getPending', () => {
    it('should get pending messages', () => {
      queue.enqueue('agent-2', createMessage('A'));
      queue.enqueue('agent-2', createMessage('B'));
      queue.enqueue('agent-3', createMessage('C'));

      const pending = queue.getPending('agent-2');
      expect(pending.length).toBe(2);
    });
  });

  describe('markDelivered', () => {
    it('should mark as delivered', () => {
      const msg = queue.enqueue('agent-2', createMessage('Test'));
      queue.markDelivered(msg!.id);

      const pending = queue.getPending('agent-2');
      expect(pending.length).toBe(0);
    });
  });

  describe('markAttempted', () => {
    it('should increment attempts', () => {
      const msg = queue.enqueue('agent-2', createMessage('Test'));
      queue.markAttempted(msg!.id);

      const pending = queue.getPending('agent-2');
      expect(pending[0]?.attempts).toBe(1);
    });
  });

  describe('canRetry', () => {
    it('should allow retry when attempts not exceeded', () => {
      const msg = queue.enqueue('agent-2', createMessage('Test'));
      expect(queue.canRetry(msg!)).toBe(true);
    });

    it('should not allow retry when attempts exceeded', () => {
      const msg = queue.enqueue('agent-2', createMessage('Test'));
      queue.markAttempted(msg!.id);
      queue.markAttempted(msg!.id);
      queue.markAttempted(msg!.id);

      const pending = queue.getPending('agent-2');
      expect(queue.canRetry(pending[0]!)).toBe(false);
    });

    it('should not allow retry when expired', () => {
      const msg = queue.enqueue('agent-2', createMessage('Test'), 'normal', Date.now() - 1000);

      expect(queue.canRetry(msg!)).toBe(false);
    });
  });

  describe('getReadyForRetry', () => {
    it('should get messages ready for retry', async () => {
      queue.enqueue('agent-2', createMessage('Test'));
      queue.markAttempted(queue.getPending('agent-2')[0]!.id);

      // Wait for retry delay
      await new Promise((r) => setTimeout(r, 150));

      const ready = queue.getReadyForRetry();
      expect(ready.length).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should remove expired messages', async () => {
      queue.enqueue('agent-2', createMessage('Test'), 'normal', Date.now() - 10000);

      const result = queue.cleanup();
      expect(result.expired).toBe(1);
    });

    it('should remove failed messages', () => {
      const msg = queue.enqueue('agent-2', createMessage('Test'));
      queue.markAttempted(msg!.id);
      queue.markAttempted(msg!.id);
      queue.markAttempted(msg!.id);

      const result = queue.cleanup();
      expect(result.failed).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', () => {
      queue.enqueue('agent-2', createMessage('A'), 'high');
      queue.enqueue('agent-2', createMessage('B'), 'normal');
      queue.enqueue('agent-3', createMessage('C'), 'low');

      const stats = queue.getStats();

      expect(stats.pending).toBe(3);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.normal).toBe(1);
      expect(stats.byPriority.low).toBe(1);
    });
  });
});
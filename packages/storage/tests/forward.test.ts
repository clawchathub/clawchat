import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SQLiteAdapter } from '../src/adapter.js';
import { StoreAndForward } from '../src/forward.js';
import type { A2AMessage } from '@clawchat/core';

describe('StoreAndForward', () => {
  let adapter: SQLiteAdapter;
  let saf: StoreAndForward;

  const createMessage = (text: string): A2AMessage => ({
    role: 'user',
    parts: [{ type: 'text', text }],
  });

  beforeEach(() => {
    adapter = new SQLiteAdapter({ path: ':memory:' });
    saf = new StoreAndForward(adapter);
  });

  afterEach(() => {
    saf.stopRetryProcessor();
    adapter.close();
  });

  describe('send', () => {
    it('should store message in history', async () => {
      const message = createMessage('Test');
      const result = await saf.send(message, 'agent-1', 'agent-2');

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should queue message when delivery fails', async () => {
      saf.setDeliveryCallback(async () => false);

      const message = createMessage('Test');
      const result = await saf.send(message, 'agent-1', 'agent-2');

      expect(result.delivered).toBe(false);
      expect(result.queued).toBe(true);
    });

    it('should mark delivered when delivery succeeds', async () => {
      saf.setDeliveryCallback(async () => true);

      const message = createMessage('Test');
      const result = await saf.send(message, 'agent-1', 'agent-2');

      expect(result.delivered).toBe(true);
      expect(result.queued).toBe(false);
    });
  });

  describe('deliverPending', () => {
    it('should deliver pending messages', async () => {
      // First set callback to fail so messages get queued
      saf.setDeliveryCallback(async () => false);

      // Queue some messages
      await saf.send(createMessage('A'), 'agent-1', 'agent-2');
      await saf.send(createMessage('B'), 'agent-1', 'agent-2');

      // Now set callback to succeed
      saf.setDeliveryCallback(async () => true);

      const result = await saf.deliverPending('agent-2');

      expect(result.delivered).toBe(2);
    });

    it('should handle failed deliveries', async () => {
      let attempts = 0;
      saf.setDeliveryCallback(async () => {
        attempts++;
        return attempts > 2;
      });

      await saf.send(createMessage('A'), 'agent-1', 'agent-2');

      const result = await saf.deliverPending('agent-2');
      expect(result.delivered).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      await saf.send(createMessage('A'), 'agent-1', 'agent-2');
      await saf.send(createMessage('B'), 'agent-1', 'agent-3');

      const stats = saf.getStats();

      expect(stats.history.total).toBe(2);
    });
  });

  describe('retry processor', () => {
    it('should start and stop retry processor', () => {
      saf.startRetryProcessor();
      saf.stopRetryProcessor();
      // Should not throw
    });
  });

  describe('maintenance', () => {
    it('should perform maintenance', async () => {
      await saf.send(createMessage('Test'), 'agent-1', 'agent-2');

      const result = saf.maintenance();

      expect(result).toBeDefined();
      expect(typeof result.historyDeleted).toBe('number');
    });
  });

  describe('getHistory', () => {
    it('should return history instance', () => {
      const history = saf.getHistory();
      expect(history).toBeDefined();
    });
  });

  describe('getQueue', () => {
    it('should return queue instance', () => {
      const queue = saf.getQueue();
      expect(queue).toBeDefined();
    });
  });
});
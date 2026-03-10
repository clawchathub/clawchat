import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/adapter.js';
import { MessageHistory } from '../src/history.js';
import type { A2AMessage } from '@clawchat/core';

describe('MessageHistory', () => {
  let adapter: SQLiteAdapter;
  let history: MessageHistory;

  const createMessage = (text: string): A2AMessage => ({
    role: 'user',
    parts: [{ type: 'text', text }],
  });

  beforeEach(() => {
    adapter = new SQLiteAdapter({ path: ':memory:' });
    history = new MessageHistory(adapter);
  });

  afterEach(() => {
    adapter.close();
  });

  describe('store', () => {
    it('should store a message', () => {
      const message = createMessage('Hello');
      const id = history.store(message, 'agent-1');

      expect(id).toBeDefined();
    });

    it('should store message with context', () => {
      const message = createMessage('Test');
      const id = history.store(message, 'agent-1', 'agent-2', 'ctx-1');

      const result = history.getConversation('ctx-1');
      expect(result.messages.length).toBe(1);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      const msg1 = createMessage('Message 1');
      const msg2 = createMessage('Message 2');
      const msg3 = createMessage('Message 3');

      history.store(msg1, 'agent-1', 'agent-2', 'ctx-1');
      history.store(msg2, 'agent-1', 'agent-2', 'ctx-1');
      history.store(msg3, 'agent-2', 'agent-1', 'ctx-2');
    });

    it('should query by context', () => {
      const result = history.query({ contextId: 'ctx-1' });
      expect(result.messages.length).toBe(2);
    });

    it('should query by from agent', () => {
      const result = history.query({ fromAgent: 'agent-2' });
      expect(result.messages.length).toBe(1);
    });

    it('should query by to agent', () => {
      const result = history.query({ toAgent: 'agent-2' });
      expect(result.messages.length).toBe(2);
    });

    it('should support pagination', () => {
      const result = history.query({}, { limit: 2, offset: 0 });
      expect(result.messages.length).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should support ordering', () => {
      const asc = history.query({}, { orderBy: 'asc' });
      const desc = history.query({}, { orderBy: 'desc' });

      expect(asc.messages[0]?.message).not.toEqual(desc.messages[0]?.message);
    });
  });

  describe('getConversation', () => {
    it('should get conversation messages', () => {
      history.store(createMessage('A'), 'agent-1', 'agent-2', 'ctx-1');
      history.store(createMessage('B'), 'agent-2', 'agent-1', 'ctx-1');

      const result = history.getConversation('ctx-1');
      expect(result.messages.length).toBe(2);
    });
  });

  describe('getConversationSummary', () => {
    it('should return null for empty conversation', () => {
      const summary = history.getConversationSummary('non-existent');
      expect(summary).toBeNull();
    });

    it('should return summary for conversation', () => {
      history.store(createMessage('A'), 'agent-1', 'agent-2', 'ctx-1');
      history.store(createMessage('B'), 'agent-2', 'agent-1', 'ctx-1');

      const summary = history.getConversationSummary('ctx-1');

      expect(summary).toBeDefined();
      expect(summary?.messageCount).toBe(2);
      expect(summary?.participants).toContain('agent-1');
      expect(summary?.participants).toContain('agent-2');
    });
  });

  describe('markDelivered', () => {
    it('should mark messages as delivered', () => {
      const id = history.store(createMessage('Test'), 'agent-1', 'agent-2', 'ctx-1');
      history.markDelivered([id]);

      const result = history.query({ delivered: true });
      expect(result.messages.length).toBe(1);
    });
  });

  describe('getUndelivered', () => {
    it('should get undelivered messages', () => {
      history.store(createMessage('A'), 'agent-1', 'agent-2', 'ctx-1');
      history.store(createMessage('B'), 'agent-1', 'agent-3', 'ctx-2');

      const result = history.getUndelivered('agent-2');
      expect(result.messages.length).toBe(1);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      history.store(createMessage('Hello world'), 'agent-1', 'agent-2', 'ctx-1');
      history.store(createMessage('Goodbye'), 'agent-1', 'agent-2', 'ctx-1');
      history.store(createMessage('Hello again'), 'agent-1', 'agent-2', 'ctx-1');
    });

    it('should search messages by content', () => {
      const result = history.search('Hello');
      expect(result.messages.length).toBe(2);
    });
  });
});
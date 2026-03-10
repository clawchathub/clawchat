import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter, type StorageConfig } from '../src/adapter.js';
import type { A2ATask, A2AMessage } from '@clawchat/core';

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter;

  beforeEach(() => {
    // Use in-memory database for tests
    adapter = new SQLiteAdapter({ path: ':memory:' });
  });

  afterEach(() => {
    adapter.close();
  });

  describe('initialization', () => {
    it('should create database with tables', () => {
      const stats = adapter.getStats();
      expect(stats.messages).toBe(0);
      expect(stats.tasks).toBe(0);
    });
  });

  describe('message operations', () => {
    it('should store a message', () => {
      adapter.storeMessage({
        id: 'msg-1',
        contextId: 'ctx-1',
        fromAgent: 'agent-1',
        message: JSON.stringify({ role: 'user', parts: [] }),
        timestamp: Date.now(),
        delivered: false,
      });

      const stats = adapter.getStats();
      expect(stats.messages).toBe(1);
    });

    it('should get messages by context', () => {
      adapter.storeMessage({
        id: 'msg-1',
        contextId: 'ctx-1',
        fromAgent: 'agent-1',
        message: '{}',
        timestamp: 1000,
        delivered: false,
      });

      adapter.storeMessage({
        id: 'msg-2',
        contextId: 'ctx-1',
        fromAgent: 'agent-2',
        message: '{}',
        timestamp: 2000,
        delivered: false,
      });

      const messages = adapter.getMessagesByContext('ctx-1');
      expect(messages.length).toBe(2);
    });

    it('should mark message as delivered', () => {
      adapter.storeMessage({
        id: 'msg-1',
        contextId: 'ctx-1',
        fromAgent: 'agent-1',
        message: '{}',
        timestamp: Date.now(),
        delivered: false,
      });

      adapter.markDelivered('msg-1');

      const messages = adapter.getMessagesByContext('ctx-1');
      expect(messages[0]?.delivered).toBe(1);
    });

    it('should get undelivered messages', () => {
      adapter.storeMessage({
        id: 'msg-1',
        contextId: 'ctx-1',
        fromAgent: 'agent-1',
        toAgent: 'agent-2',
        message: '{}',
        timestamp: Date.now(),
        delivered: false,
      });

      const undelivered = adapter.getUndeliveredMessages('agent-2');
      expect(undelivered.length).toBe(1);
    });
  });

  describe('task operations', () => {
    const createTask = (): A2ATask => ({
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'submitted', timestamp: Date.now() },
      history: [],
    });

    it('should store a task', () => {
      const task = createTask();
      adapter.storeTask(task);

      const stats = adapter.getStats();
      expect(stats.tasks).toBe(1);
    });

    it('should get a task by ID', () => {
      const task = createTask();
      adapter.storeTask(task);

      const retrieved = adapter.getTask('task-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('task-1');
    });

    it('should return null for non-existent task', () => {
      const retrieved = adapter.getTask('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete a task', () => {
      const task = createTask();
      adapter.storeTask(task);

      const deleted = adapter.deleteTask('task-1');
      expect(deleted).toBe(true);

      const stats = adapter.getStats();
      expect(stats.tasks).toBe(0);
    });
  });

  describe('agent card cache', () => {
    it('should cache an agent card', () => {
      const card = {
        identity: { name: 'Test Agent', description: '', url: '', version: '1.0' },
        capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
        skills: [],
      };

      adapter.cacheAgentCard('pubkey-1', card);

      const retrieved = adapter.getAgentCard('pubkey-1');
      expect(retrieved).toEqual(card);
    });

    it('should return null for unknown agent', () => {
      const retrieved = adapter.getAgentCard('unknown');
      expect(retrieved).toBeNull();
    });
  });

  describe('offline queue', () => {
    it('should add to queue', () => {
      adapter.addToQueue('q-1', 'agent-2', '{}');

      const pending = adapter.getPendingQueue('agent-2');
      expect(pending.length).toBe(1);
    });

    it('should update queue attempt', () => {
      adapter.addToQueue('q-1', 'agent-2', '{}');
      adapter.updateQueueAttempt('q-1');

      const pending = adapter.getPendingQueue('agent-2');
      expect(pending[0]?.attempts).toBe(1);
    });

    it('should mark queue as delivered', () => {
      adapter.addToQueue('q-1', 'agent-2', '{}');
      adapter.markQueueDelivered('q-1');

      const pending = adapter.getPendingQueue('agent-2');
      expect(pending.length).toBe(0);
    });
  });

  describe('transactions', () => {
    it('should run operations in transaction', () => {
      adapter.transaction(() => {
        adapter.storeMessage({
          id: 'msg-1',
          contextId: 'ctx-1',
          fromAgent: 'agent-1',
          message: '{}',
          timestamp: Date.now(),
          delivered: false,
        });

        adapter.storeMessage({
          id: 'msg-2',
          contextId: 'ctx-1',
          fromAgent: 'agent-1',
          message: '{}',
          timestamp: Date.now(),
          delivered: false,
        });
      });

      const messages = adapter.getMessagesByContext('ctx-1');
      expect(messages.length).toBe(2);
    });
  });
});
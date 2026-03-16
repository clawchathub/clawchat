import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager } from '../src/manager.js';
import type { A2AMessage } from '@clawchat/core';

const createTestMessage = (text: string): A2AMessage => ({
  role: 'agent',
  parts: [{ type: 'text', text }],
  contextId: 'test-context',
  timestamp: Date.now(),
});

describe('TaskManager duplicate check', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  it('should throw on duplicate task ID', () => {
    const id = 'test-task-1';
    manager.create({
      id,
      initialMessage: createTestMessage('test'),
    });

    expect(() => {
      manager.create({
        id,
        initialMessage: createTestMessage('test2'),
      });
    }).toThrow('already exists');
  });

  it('should allow unique task IDs', () => {
    const task1 = manager.create({ initialMessage: createTestMessage('a') });
    const task2 = manager.create({ initialMessage: createTestMessage('b') });

    expect(task1.id).not.toBe(task2.id);
    expect(manager.list()).toHaveLength(2);
  });

  it('should accept optional logger', () => {
    const logger = {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
    };
    const managerWithLogger = new TaskManager(logger);
    const task = managerWithLogger.create({ initialMessage: createTestMessage('test') });
    expect(task).toBeDefined();
  });
});

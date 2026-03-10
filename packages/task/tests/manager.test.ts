import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager, type TaskEvent } from '../src/manager.js';
import type { A2AMessage } from '@clawchat/core';

describe('TaskManager', () => {
  let manager: TaskManager;

  const createMessage = (text: string): A2AMessage => ({
    role: 'user',
    parts: [{ type: 'text', text }],
  });

  beforeEach(() => {
    manager = new TaskManager();
  });

  describe('task creation', () => {
    it('should create a task', () => {
      const message = createMessage('Hello');
      const task = manager.create({ initialMessage: message });

      expect(task.id).toBeDefined();
      expect(task.status.state).toBe('submitted');
      expect(task.history.length).toBe(1);
      expect(task.history[0]).toEqual(message);
    });

    it('should create task with custom ID', () => {
      const task = manager.create({
        id: 'custom-id',
        initialMessage: createMessage('Test'),
      });

      expect(task.id).toBe('custom-id');
    });

    it('should create task with custom context ID', () => {
      const task = manager.create({
        contextId: 'ctx-123',
        initialMessage: createMessage('Test'),
      });

      expect(task.contextId).toBe('ctx-123');
    });
  });

  describe('task retrieval', () => {
    it('should get task by ID', () => {
      const created = manager.create({ initialMessage: createMessage('Test') });
      const retrieved = manager.get(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent task', () => {
      expect(manager.get('non-existent')).toBeUndefined();
    });

    it('should get tasks by context ID', () => {
      const task1 = manager.create({
        contextId: 'ctx-1',
        initialMessage: createMessage('Task 1'),
      });
      manager.create({
        contextId: 'ctx-2',
        initialMessage: createMessage('Task 2'),
      });

      const tasks = manager.getByContext('ctx-1');
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.id).toBe(task1.id);
    });
  });

  describe('task updates', () => {
    it('should update task state', () => {
      const task = manager.create({ initialMessage: createMessage('Test') });
      const updated = manager.update(task.id, { state: 'working' });

      expect(updated?.status.state).toBe('working');
    });

    it('should update task progress', () => {
      const task = manager.create({ initialMessage: createMessage('Test') });
      manager.update(task.id, { state: 'working' });
      const updated = manager.update(task.id, { state: 'completed' });

      expect(updated?.status.state).toBe('completed');
    });

    it('should reject invalid state transition', () => {
      const task = manager.create({ initialMessage: createMessage('Test') });
      const updated = manager.update(task.id, { state: 'completed' });

      // Cannot go from submitted to completed directly
      expect(updated).toBeNull();
    });

    it('should add message to history', () => {
      const task = manager.create({ initialMessage: createMessage('First') });
      const updated = manager.addMessage(task.id, createMessage('Second'));

      expect(updated?.history.length).toBe(2);
    });
  });

  describe('task listing', () => {
    it('should list all tasks', () => {
      manager.create({ initialMessage: createMessage('Task 1') });
      manager.create({ initialMessage: createMessage('Task 2') });
      manager.create({ initialMessage: createMessage('Task 3') });

      const tasks = manager.list();
      expect(tasks.length).toBe(3);
    });

    it('should filter by state', () => {
      const task1 = manager.create({ initialMessage: createMessage('Task 1') });
      manager.create({ initialMessage: createMessage('Task 2') });
      manager.update(task1.id, { state: 'working' });

      const workingTasks = manager.list({ state: 'working' });
      expect(workingTasks.length).toBe(1);
    });

    it('should filter by multiple states', () => {
      const task1 = manager.create({ initialMessage: createMessage('Task 1') });
      const task2 = manager.create({ initialMessage: createMessage('Task 2') });
      const task3 = manager.create({ initialMessage: createMessage('Task 3') });
      manager.update(task1.id, { state: 'working' });
      manager.update(task2.id, { state: 'canceled' });

      const tasks = manager.list({ state: ['submitted', 'working'] });
      expect(tasks.length).toBe(2);
    });
  });

  describe('task cancellation', () => {
    it('should cancel a task', () => {
      const task = manager.create({ initialMessage: createMessage('Test') });
      const canceled = manager.cancel(task.id, 'User requested');

      expect(canceled?.status.state).toBe('canceled');
    });
  });

  describe('task deletion', () => {
    it('should delete a task', () => {
      const task = manager.create({ initialMessage: createMessage('Test') });
      expect(manager.delete(task.id)).toBe(true);
      expect(manager.get(task.id)).toBeUndefined();
    });

    it('should return false for non-existent task', () => {
      expect(manager.delete('non-existent')).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit created event', () => {
      const events: TaskEvent[] = [];
      manager.subscribe((e) => events.push(e));

      manager.create({ initialMessage: createMessage('Test') });

      expect(events.length).toBe(1);
      expect(events[0]?.type).toBe('created');
    });

    it('should emit completed event', () => {
      const events: TaskEvent[] = [];
      manager.subscribe((e) => events.push(e));

      const task = manager.create({ initialMessage: createMessage('Test') });
      manager.update(task.id, { state: 'working' });
      manager.update(task.id, { state: 'completed' });

      expect(events.find((e) => e.type === 'completed')).toBeDefined();
    });

    it('should unsubscribe', () => {
      const events: TaskEvent[] = [];
      const unsubscribe = manager.subscribe((e) => events.push(e));

      manager.create({ initialMessage: createMessage('Test 1') });
      unsubscribe();
      manager.create({ initialMessage: createMessage('Test 2') });

      expect(events.length).toBe(1);
    });
  });
});
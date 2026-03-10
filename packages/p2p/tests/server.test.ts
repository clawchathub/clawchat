import { describe, it, expect, beforeEach } from 'vitest';
import { A2AServer } from '../src/jsonrpc/server.js';
import type { A2AMessage, A2ATask } from '@clawchat/core';

describe('A2AServer', () => {
  let server: A2AServer;

  beforeEach(() => {
    server = new A2AServer({ port: 18789 });
  });

  describe('task management', () => {
    it('should create a task from message/send', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      };

      const request = {
        jsonrpc: '2.0',
        method: 'message/send' as const,
        params: { message },
        id: 1,
      };

      // Simulate JSON-RPC processing
      const result = await (server as any).processRequest(request);

      expect(result.jsonrpc).toBe('2.0');
      expect(result.result).toBeDefined();
      expect(result.result.id).toBeDefined();
      expect(result.result.status.state).toBe('submitted');
    });

    it('should retrieve a task with task/get', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Test' }],
      };

      // Create task first
      const createRequest = {
        jsonrpc: '2.0',
        method: 'message/send' as const,
        params: { message },
        id: 1,
      };
      const createResult = await (server as any).processRequest(createRequest);
      const taskId = createResult.result.id;

      // Get task
      const getRequest = {
        jsonrpc: '2.0',
        method: 'task/get' as const,
        params: { taskId },
        id: 2,
      };
      const getResult = await (server as any).processRequest(getRequest);

      expect(getResult.result).toBeDefined();
      expect(getResult.result.id).toBe(taskId);
    });

    it('should list tasks with task/list', async () => {
      // Create multiple tasks
      for (let i = 0; i < 3; i++) {
        const message: A2AMessage = {
          role: 'user',
          parts: [{ type: 'text', text: `Message ${i}` }],
        };
        await (server as any).processRequest({
          jsonrpc: '2.0',
          method: 'message/send',
          params: { message },
          id: i,
        });
      }

      const request = {
        jsonrpc: '2.0',
        method: 'task/list' as const,
        id: 10,
      };
      const result = await (server as any).processRequest(request);

      expect(result.result).toBeDefined();
      expect(Array.isArray(result.result)).toBe(true);
      expect(result.result.length).toBe(3);
    });

    it('should cancel a task with task/cancel', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'To cancel' }],
      };

      const createResult = await (server as any).processRequest({
        jsonrpc: '2.0',
        method: 'message/send',
        params: { message },
        id: 1,
      });
      const taskId = createResult.result.id;

      const cancelResult = await (server as any).processRequest({
        jsonrpc: '2.0',
        method: 'task/cancel',
        params: { taskId },
        id: 2,
      });

      expect(cancelResult.result.status.state).toBe('canceled');
    });
  });

  describe('message/stream handler', () => {
    it('should return taskId for message/stream', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Stream test' }],
      };

      const request = {
        jsonrpc: '2.0',
        method: 'message/stream' as const,
        params: { message },
        id: 1,
      };

      const result = await (server as any).processRequest(request);

      expect(result.jsonrpc).toBe('2.0');
      expect(result.result).toBeDefined();
      expect(result.result.taskId).toBeDefined();
      expect(typeof result.result.taskId).toBe('string');
    });

    it('should invoke onMessageStream handler when set', async () => {
      let streamCallbackInvoked = false;
      let receivedTask: A2ATask | null = null;

      server.setHandlers({
        onMessageStream: (_message, _context, callback) => {
          streamCallbackInvoked = true;
          // Simulate task update
          const task: A2ATask = {
            id: 'test-task-id',
            contextId: 'test-context',
            status: { state: 'working', timestamp: Date.now() },
            history: [],
          };
          callback(task);
        },
      });

      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Stream with handler' }],
      };

      const request = {
        jsonrpc: '2.0',
        method: 'message/stream' as const,
        params: { message },
        id: 1,
      };

      await (server as any).processRequest(request);

      expect(streamCallbackInvoked).toBe(true);
    });

    it('should create task in store for streaming', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Stream store test' }],
      };

      const request = {
        jsonrpc: '2.0',
        method: 'message/stream' as const,
        params: { message },
        id: 1,
      };

      const result = await (server as any).processRequest(request);
      const taskId = result.result.taskId;

      // Verify task was created
      const task = server.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.status.state).toBe('submitted');
    });
  });

  describe('SSE streaming', () => {
    it('should track SSE subscribers', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'SSE test' }],
      };

      const createResult = await (server as any).processRequest({
        jsonrpc: '2.0',
        method: 'message/send',
        params: { message },
        id: 1,
      });
      const taskId = createResult.result.id;

      // Check internal streams map
      const streams = (server as any).streams;
      expect(streams).toBeInstanceOf(Map);
      expect(streams.size).toBe(0); // No subscribers yet

      // Simulate subscriber registration
      const callback = (_task: A2ATask) => {};
      if (!streams.has(taskId)) {
        streams.set(taskId, new Set());
      }
      streams.get(taskId)!.add(callback);

      expect(streams.get(taskId)?.size).toBe(1);
    });

    it('should notify SSE subscribers on task update', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'SSE notify test' }],
      };

      const createResult = await (server as any).processRequest({
        jsonrpc: '2.0',
        method: 'message/send',
        params: { message },
        id: 1,
      });
      const taskId = createResult.result.id;

      let notifiedTask: A2ATask | null = null;
      const callback = (task: A2ATask) => {
        notifiedTask = task;
      };

      // Register subscriber
      const streams = (server as any).streams;
      if (!streams.has(taskId)) {
        streams.set(taskId, new Set());
      }
      streams.get(taskId)!.add(callback);

      // Update task
      const task = server.getTask(taskId)!;
      task.status = { state: 'working', timestamp: Date.now() };
      server.updateTask(task);

      expect(notifiedTask).toBeDefined();
      expect(notifiedTask?.status.state).toBe('working');
    });

    it('should handle multiple SSE subscribers', async () => {
      const message: A2AMessage = {
        role: 'user',
        parts: [{ type: 'text', text: 'Multi SSE test' }],
      };

      const createResult = await (server as any).processRequest({
        jsonrpc: '2.0',
        method: 'message/send',
        params: { message },
        id: 1,
      });
      const taskId = createResult.result.id;

      const notifications: string[] = [];
      const streams = (server as any).streams;
      if (!streams.has(taskId)) {
        streams.set(taskId, new Set());
      }

      // Add multiple subscribers
      streams.get(taskId)!.add(() => notifications.push('sub1'));
      streams.get(taskId)!.add(() => notifications.push('sub2'));
      streams.get(taskId)!.add(() => notifications.push('sub3'));

      // Trigger notification
      const task = server.getTask(taskId)!;
      server.notifyTaskUpdate(task);

      expect(notifications.length).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown method', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'unknown/method',
        id: 1,
      };

      const result = await (server as any).processRequest(request);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32601);
    });

    it('should return null for non-existent task', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'task/get',
        params: { taskId: 'non-existent' },
        id: 1,
      };

      const result = await (server as any).processRequest(request);

      expect(result.result).toBeNull();
    });
  });
});
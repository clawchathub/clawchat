/**
 * A2A JSON-RPC 2.0 Server
 * Implements the A2A protocol for agent communication
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { A2AMessage, A2ATask, JSONRPCRequest, JSONRPCResponse } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface A2AServerConfig {
  port?: number;
  host?: string;
  agentCardUrl?: string;
}

export type MessageHandler = (message: A2AMessage, context: RequestContext) => Promise<A2ATask | null>;
export type TaskHandler = (taskId: string, context: RequestContext) => Promise<A2ATask | null>;
export type StreamHandler = (message: A2AMessage, context: RequestContext, callback: (task: A2ATask) => void) => void;

export interface RequestContext {
  agentId: string;
  headers: Record<string, string>;
}

export interface A2AServerHandlers {
  onMessageSend?: MessageHandler;
  onMessageStream?: StreamHandler;
  onTaskGet?: TaskHandler;
  onTaskList?: () => Promise<A2ATask[]>;
  onTaskCancel?: TaskHandler;
}

// ============================================
// JSON-RPC Server
// ============================================

export class A2AServer {
  private config: Required<A2AServerConfig>;
  private handlers: A2AServerHandlers = {};
  private tasks: Map<string, A2ATask> = new Map();
  private streams: Map<string, Set<(task: A2ATask) => void>> = new Map();

  constructor(config: A2AServerConfig = {}) {
    this.config = {
      port: config.port ?? 18789,
      host: config.host ?? '0.0.0.0',
      agentCardUrl: config.agentCardUrl ?? '/.well-known/agent.json',
    };
  }

  /**
   * Set message handler
   */
  setHandlers(handlers: A2AServerHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Handle HTTP request
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Agent Card discovery
    if (url === this.config.agentCardUrl || url === '/.well-known/agent.json') {
      await this.handleAgentCard(req, res);
      return;
    }

    // JSON-RPC endpoint
    if (method === 'POST' && (url === '/' || url === '/jsonrpc')) {
      await this.handleJSONRPC(req, res);
      return;
    }

    // SSE streaming endpoint
    if (method === 'GET' && url.startsWith('/stream/')) {
      await this.handleSSE(req, res, url);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle Agent Card request
   */
  private async handleAgentCard(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    // This should be overridden by the agent implementation
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent card not configured' }));
  }

  /**
   * Handle JSON-RPC request
   */
  private async handleJSONRPC(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      const request = JSON.parse(body) as JSONRPCRequest;
      const response = await this.processRequest(request);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      const errorResponse: JSONRPCResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
        id: null,
      };
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errorResponse));
    }
  }

  /**
   * Process JSON-RPC request
   */
  private async processRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      let result: unknown;

      switch (request.method) {
        case 'message/send':
          result = await this.handleMessageSend(request.params as { message: A2AMessage });
          break;

        case 'message/stream':
          // Streaming is handled via SSE, this returns a task ID
          result = await this.handleMessageStream(request.params as { message: A2AMessage });
          break;

        case 'task/get':
          result = await this.handleTaskGet(request.params as { taskId: string });
          break;

        case 'task/list':
          result = await this.handleTaskList();
          break;

        case 'task/cancel':
          result = await this.handleTaskCancel(request.params as { taskId: string });
          break;

        default:
          return {
            jsonrpc: '2.0',
            error: { code: -32601, message: `Method not found: ${request.method}` },
            id: request.id ?? null,
          };
      }

      return {
        jsonrpc: '2.0',
        result,
        id: request.id ?? null,
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
        id: request.id ?? null,
      };
    }
  }

  // ============================================
  // Method Handlers
  // ============================================

  private async handleMessageSend(params: { message: A2AMessage }): Promise<A2ATask> {
    const taskId = uuidv4();
    const contextId = params.message.contextId ?? uuidv4();

    const task: A2ATask = {
      id: taskId,
      contextId,
      status: {
        state: 'submitted',
        timestamp: Date.now(),
      },
      history: [params.message],
    };

    this.tasks.set(taskId, task);

    // Call custom handler if set
    if (this.handlers.onMessageSend) {
      const context: RequestContext = {
        agentId: '',
        headers: {},
      };
      const updatedTask = await this.handlers.onMessageSend(params.message, context);
      if (updatedTask) {
        this.tasks.set(taskId, updatedTask);
        return updatedTask;
      }
    }

    return task;
  }

  private async handleMessageStream(params: { message: A2AMessage }): Promise<{ taskId: string }> {
    const task = await this.handleMessageSend(params);

    // Invoke the stream handler if set
    if (this.handlers.onMessageStream) {
      const context: RequestContext = { agentId: '', headers: {} };
      this.handlers.onMessageStream(params.message, context, (updatedTask: A2ATask) => {
        this.updateTask(updatedTask);
      });
    }

    return { taskId: task.id };
  }

  private async handleTaskGet(params: { taskId: string }): Promise<A2ATask | null> {
    const task = this.tasks.get(params.taskId);
    if (!task) {
      return null;
    }

    if (this.handlers.onTaskGet) {
      const context: RequestContext = { agentId: '', headers: {} };
      return this.handlers.onTaskGet(params.taskId, context);
    }

    return task;
  }

  private async handleTaskList(): Promise<A2ATask[]> {
    if (this.handlers.onTaskList) {
      return this.handlers.onTaskList();
    }
    return Array.from(this.tasks.values());
  }

  private async handleTaskCancel(params: { taskId: string }): Promise<A2ATask | null> {
    const task = this.tasks.get(params.taskId);
    if (!task) {
      return null;
    }

    task.status = {
      state: 'canceled',
      timestamp: Date.now(),
    };

    if (this.handlers.onTaskCancel) {
      const context: RequestContext = { agentId: '', headers: {} };
      return this.handlers.onTaskCancel(params.taskId, context);
    }

    return task;
  }

  // ============================================
  // SSE Streaming
  // ============================================

  private async handleSSE(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const taskId = url.replace('/stream/', '');
    const task = this.tasks.get(taskId);

    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found' }));
      return;
    }

    // Setup SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial task
    res.write(`data: ${JSON.stringify(task)}\n\n`);

    // Register for updates
    const callback = (updatedTask: A2ATask) => {
      res.write(`data: ${JSON.stringify(updatedTask)}\n\n`);
    };

    if (!this.streams.has(taskId)) {
      this.streams.set(taskId, new Set());
    }
    this.streams.get(taskId)!.add(callback);

    // Handle client disconnect
    req.on('close', () => {
      this.streams.get(taskId)?.delete(callback);
    });
  }

  /**
   * Notify subscribers of task update
   */
  notifyTaskUpdate(task: A2ATask): void {
    const subscribers = this.streams.get(task.id);
    if (subscribers) {
      for (const callback of subscribers) {
        callback(task);
      }
    }
  }

  /**
   * Update task in store
   */
  updateTask(task: A2ATask): void {
    this.tasks.set(task.id, task);
    this.notifyTaskUpdate(task);
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): A2ATask | undefined {
    return this.tasks.get(taskId);
  }
}
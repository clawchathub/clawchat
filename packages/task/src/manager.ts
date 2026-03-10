/**
 * Task Manager
 * Orchestrates task lifecycle and operations
 */

import { TaskStateMachine, type TaskState } from './state-machine.js';
import type { A2ATask, A2AMessage, Artifact } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface TaskOptions {
  id?: string;
  contextId?: string;
  initialMessage: A2AMessage;
  metadata?: Record<string, unknown>;
}

export interface TaskUpdate {
  state?: TaskState;
  message?: string;
  progress?: number;
  artifact?: Artifact;
}

export interface TaskFilter {
  state?: TaskState | TaskState[];
  contextId?: string;
  assignedTo?: string;
  createdAfter?: number;
  createdBefore?: number;
}

export interface TaskEvent {
  type: 'created' | 'updated' | 'completed' | 'failed' | 'canceled';
  task: A2ATask;
  timestamp: number;
}

export type TaskEventListener = (event: TaskEvent) => void;

// ============================================
// Task Manager
// ============================================

export class TaskManager {
  private tasks: Map<string, A2ATask> = new Map();
  private stateMachines: Map<string, TaskStateMachine> = new Map();
  private listeners: Set<TaskEventListener> = new Set();
  private contextIndex: Map<string, Set<string>> = new Map();

  /**
   * Create a new task
   */
  create(options: TaskOptions): A2ATask {
    const taskId = options.id ?? uuidv4();
    const contextId = options.contextId ?? uuidv4();

    const stateMachine = new TaskStateMachine('submitted');
    const status = stateMachine.createStatus();

    const task: A2ATask = {
      id: taskId,
      contextId,
      status,
      history: [options.initialMessage],
      metadata: options.metadata as Record<string, string> | undefined,
    };

    this.tasks.set(taskId, task);
    this.stateMachines.set(taskId, stateMachine);

    // Index by context
    if (!this.contextIndex.has(contextId)) {
      this.contextIndex.set(contextId, new Set());
    }
    this.contextIndex.get(contextId)!.add(taskId);

    this.emit({ type: 'created', task, timestamp: Date.now() });

    return task;
  }

  /**
   * Get a task by ID
   */
  get(taskId: string): A2ATask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Update a task
   */
  update(taskId: string, update: TaskUpdate): A2ATask | null {
    const task = this.tasks.get(taskId);
    const stateMachine = this.stateMachines.get(taskId);

    if (!task || !stateMachine) {
      return null;
    }

    // Handle state transition
    if (update.state) {
      const transition = stateMachine.transition(update.state);
      if (!transition.allowed) {
        return null;
      }

      task.status = {
        state: update.state,
        timestamp: Date.now(),
      };
    } else if (update.message || update.progress !== undefined) {
      task.status = {
        ...task.status,
        timestamp: Date.now(),
      };
    }

    // Add artifact if provided
    if (update.artifact) {
      if (!task.artifacts) {
        task.artifacts = [];
      }
      task.artifacts.push(update.artifact);
    }

    // Emit event
    const eventType = this.getEventType(task.status.state);
    this.emit({ type: eventType, task, timestamp: Date.now() });

    return task;
  }

  /**
   * Add a message to task history
   */
  addMessage(taskId: string, message: A2AMessage): A2ATask | null {
    const task = this.tasks.get(taskId);

    if (!task) {
      return null;
    }

    if (!task.history) {
      task.history = [];
    }
    task.history.push(message);
    return task;
  }

  /**
   * List tasks with optional filter
   */
  list(filter?: TaskFilter): A2ATask[] {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.state) {
        const states = Array.isArray(filter.state) ? filter.state : [filter.state];
        tasks = tasks.filter((t) => states.includes(t.status.state));
      }

      if (filter.contextId) {
        tasks = tasks.filter((t) => t.contextId === filter.contextId);
      }

      if (filter.assignedTo) {
        tasks = tasks.filter((t) => (t as any).assignedTo === filter.assignedTo);
      }

      if (filter.createdAfter) {
        tasks = tasks.filter((t) => t.status.timestamp >= filter.createdAfter!);
      }

      if (filter.createdBefore) {
        tasks = tasks.filter((t) => t.status.timestamp <= filter.createdBefore!);
      }
    }

    return tasks;
  }

  /**
   * Get tasks by context ID
   */
  getByContext(contextId: string): A2ATask[] {
    const taskIds = this.contextIndex.get(contextId);
    if (!taskIds) return [];

    return Array.from(taskIds)
      .map((id) => this.tasks.get(id))
      .filter((t): t is A2ATask => t !== undefined);
  }

  /**
   * Cancel a task
   */
  cancel(taskId: string, reason?: string): A2ATask | null {
    return this.update(taskId, { state: 'canceled', message: reason });
  }

  /**
   * Delete a task
   */
  delete(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.tasks.delete(taskId);
    this.stateMachines.delete(taskId);

    // Remove from context index
    const contextTasks = this.contextIndex.get(task.contextId);
    if (contextTasks) {
      contextTasks.delete(taskId);
      if (contextTasks.size === 0) {
        this.contextIndex.delete(task.contextId);
      }
    }

    return true;
  }

  /**
   * Subscribe to task events
   */
  subscribe(listener: TaskEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get state machine for a task
   */
  getStateMachine(taskId: string): TaskStateMachine | undefined {
    return this.stateMachines.get(taskId);
  }

  /**
   * Emit event to listeners
   */
  private emit(event: TaskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Task event listener error:', error);
      }
    }
  }

  /**
   * Determine event type from state
   */
  private getEventType(state: TaskState): TaskEvent['type'] {
    switch (state) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'canceled';
      default:
        return 'updated';
    }
  }
}
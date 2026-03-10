/**
 * Task Decomposition
 * Implements parent/child task relationships for complex workflows
 */

import type { A2ATask } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface TaskNode {
  task: A2ATask;
  parentId?: string;
  children: string[];
  depth: number;
}

export interface DecompositionPlan {
  parentTaskId: string;
  subtasks: SubtaskDefinition[];
  strategy: 'sequential' | 'parallel' | 'mixed';
  aggregationRule?: 'all' | 'any' | 'threshold';
  threshold?: number;
}

export interface SubtaskDefinition {
  id?: string;
  description: string;
  dependencies?: string[];
  assignedTo?: string;
  metadata?: Record<string, unknown>;
}

export interface AggregationResult {
  parentId: string;
  completedCount: number;
  totalCount: number;
  successRate: number;
  allCompleted: boolean;
  anyCompleted: boolean;
  thresholdMet: boolean;
}

// ============================================
// Task Decomposition Manager
// ============================================

export class TaskDecomposition {
  private nodes: Map<string, TaskNode> = new Map();
  private parentIndex: Map<string, Set<string>> = new Map();

  /**
   * Register a task in the hierarchy
   */
  registerTask(task: A2ATask, parentId?: string): TaskNode {
    const existingNode = this.nodes.get(task.id);

    if (existingNode) {
      return existingNode;
    }

    // Calculate depth
    let depth = 0;
    if (parentId) {
      const parentNode = this.nodes.get(parentId);
      if (parentNode) {
        depth = parentNode.depth + 1;
        parentNode.children.push(task.id);
      }
    }

    const node: TaskNode = {
      task,
      parentId,
      children: [],
      depth,
    };

    this.nodes.set(task.id, node);

    // Update parent index
    if (parentId) {
      if (!this.parentIndex.has(parentId)) {
        this.parentIndex.set(parentId, new Set());
      }
      this.parentIndex.get(parentId)!.add(task.id);
    }

    return node;
  }

  /**
   * Decompose a parent task into subtasks
   */
  decompose(
    parentTask: A2ATask,
    plan: DecompositionPlan
  ): A2ATask[] {
    const subtasks: A2ATask[] = [];

    for (const definition of plan.subtasks) {
      const subtaskId = definition.id ?? uuidv4();
      const subtask: A2ATask = {
        id: subtaskId,
        contextId: parentTask.contextId,
        status: {
          state: 'submitted',
          timestamp: Date.now(),
        },
        history: [],
        metadata: {
          ...definition.metadata,
          parentId: parentTask.id,
          description: definition.description,
          dependencies: definition.dependencies,
          assignedTo: definition.assignedTo,
          decompositionStrategy: plan.strategy,
        },
      };

      this.registerTask(subtask, parentTask.id);
      subtasks.push(subtask);
    }

    // Update parent task metadata
    if (!parentTask.metadata) {
      parentTask.metadata = {};
    }
    parentTask.metadata.decomposed = true;
    parentTask.metadata.subtaskCount = subtasks.length;
    parentTask.metadata.decompositionStrategy = plan.strategy;

    return subtasks;
  }

  /**
   * Get task node
   */
  getNode(taskId: string): TaskNode | undefined {
    return this.nodes.get(taskId);
  }

  /**
   * Get parent task
   */
  getParent(taskId: string): A2ATask | undefined {
    const node = this.nodes.get(taskId);
    if (!node?.parentId) return undefined;

    return this.nodes.get(node.parentId)?.task;
  }

  /**
   * Get children tasks
   */
  getChildren(taskId: string): A2ATask[] {
    const node = this.nodes.get(taskId);
    if (!node) return [];

    return node.children
      .map((id) => this.nodes.get(id)?.task)
      .filter((t): t is A2ATask => t !== undefined);
  }

  /**
   * Get all descendants
   */
  getDescendants(taskId: string): A2ATask[] {
    const descendants: A2ATask[] = [];
    const stack = [taskId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const node = this.nodes.get(currentId);

      if (node) {
        for (const childId of node.children) {
          const childNode = this.nodes.get(childId);
          if (childNode) {
            descendants.push(childNode.task);
            stack.push(childId);
          }
        }
      }
    }

    return descendants;
  }

  /**
   * Get all ancestors
   */
  getAncestors(taskId: string): A2ATask[] {
    const ancestors: A2ATask[] = [];
    let currentId: string | undefined = taskId;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node?.parentId) break;

      const parentNode = this.nodes.get(node.parentId);
      if (parentNode) {
        ancestors.push(parentNode.task);
        currentId = node.parentId;
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Check if task is a root (no parent)
   */
  isRoot(taskId: string): boolean {
    const node = this.nodes.get(taskId);
    return !node?.parentId;
  }

  /**
   * Check if task is a leaf (no children)
   */
  isLeaf(taskId: string): boolean {
    const node = this.nodes.get(taskId);
    return !node || node.children.length === 0;
  }

  /**
   * Aggregate results from child tasks
   */
  aggregateResults(parentTaskId: string): AggregationResult | null {
    const children = this.getChildren(parentTaskId);

    if (children.length === 0) {
      return null;
    }

    const completed = children.filter(
      (t) => t.status.state === 'completed'
    );

    const result: AggregationResult = {
      parentId: parentTaskId,
      completedCount: completed.length,
      totalCount: children.length,
      successRate: completed.length / children.length,
      allCompleted: completed.length === children.length,
      anyCompleted: completed.length > 0,
      thresholdMet: false,
    };

    // Check threshold if specified
    const parentNode = this.nodes.get(parentTaskId);
    const threshold = parentNode?.task.metadata?.threshold as number | undefined;
    if (threshold !== undefined) {
      result.thresholdMet = result.successRate >= threshold;
    }

    return result;
  }

  /**
   * Get tasks at a specific depth
   */
  getTasksAtDepth(depth: number): A2ATask[] {
    return Array.from(this.nodes.values())
      .filter((node) => node.depth === depth)
      .map((node) => node.task);
  }

  /**
   * Get task tree as nested structure
   */
  getTree(taskId: string): { task: A2ATask; children: ReturnType<typeof this.getTree>[] } | null {
    const node = this.nodes.get(taskId);
    if (!node) return null;

    return {
      task: node.task,
      children: node.children
        .map((id) => this.getTree(id))
        .filter((t): t is NonNullable<typeof t> => t !== null),
    };
  }

  /**
   * Remove a task and its descendants
   */
  remove(taskId: string): boolean {
    const node = this.nodes.get(taskId);
    if (!node) return false;

    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((id) => id !== taskId);
      }
    }

    // Remove all descendants
    const descendants = this.getDescendants(taskId);
    for (const descendant of descendants) {
      this.nodes.delete(descendant.id);
    }

    // Remove this node
    this.nodes.delete(taskId);

    return true;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalTasks: number;
    maxDepth: number;
    rootCount: number;
    leafCount: number;
  } {
    let maxDepth = 0;
    let rootCount = 0;
    let leafCount = 0;

    for (const node of this.nodes.values()) {
      maxDepth = Math.max(maxDepth, node.depth);
      if (!node.parentId) rootCount++;
      if (node.children.length === 0) leafCount++;
    }

    return {
      totalTasks: this.nodes.size,
      maxDepth,
      rootCount,
      leafCount,
    };
  }
}
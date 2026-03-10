import { describe, it, expect, beforeEach } from 'vitest';
import { TaskDecomposition, type DecompositionPlan } from '../src/decomposition.js';
import type { A2ATask } from '@clawchat/core';

describe('TaskDecomposition', () => {
  let decomposition: TaskDecomposition;

  const createTask = (id: string, contextId: string = 'ctx-1'): A2ATask => ({
    id,
    contextId,
    status: { state: 'submitted', timestamp: Date.now() },
    history: [],
  });

  beforeEach(() => {
    decomposition = new TaskDecomposition();
  });

  describe('task registration', () => {
    it('should register a task', () => {
      const task = createTask('task-1');
      const node = decomposition.registerTask(task);

      expect(node.task).toEqual(task);
      expect(node.children).toEqual([]);
      expect(node.depth).toBe(0);
    });

    it('should register task with parent', () => {
      const parent = createTask('parent');
      const child = createTask('child');

      decomposition.registerTask(parent);
      const childNode = decomposition.registerTask(child, 'parent');

      expect(childNode.parentId).toBe('parent');
      expect(childNode.depth).toBe(1);
    });
  });

  describe('decomposition', () => {
    it('should decompose a task into subtasks', () => {
      const parent = createTask('parent');
      decomposition.registerTask(parent);

      const plan: DecompositionPlan = {
        parentTaskId: 'parent',
        strategy: 'parallel',
        subtasks: [
          { description: 'Subtask 1' },
          { description: 'Subtask 2' },
          { description: 'Subtask 3' },
        ],
      };

      const subtasks = decomposition.decompose(parent, plan);

      expect(subtasks.length).toBe(3);
      expect(parent.metadata?.decomposed).toBe('true');
      expect(parent.metadata?.subtaskCount).toBe('3');
    });

    it('should set parent metadata', () => {
      const parent = createTask('parent');
      decomposition.registerTask(parent);

      const plan: DecompositionPlan = {
        parentTaskId: 'parent',
        strategy: 'sequential',
        subtasks: [{ description: 'Subtask 1' }],
      };

      decomposition.decompose(parent, plan);

      expect(parent.metadata?.decompositionStrategy).toBe('sequential');
    });
  });

  describe('hierarchy navigation', () => {
    it('should get parent task', () => {
      const parent = createTask('parent');
      const child = createTask('child');

      decomposition.registerTask(parent);
      decomposition.registerTask(child, 'parent');

      const retrieved = decomposition.getParent('child');
      expect(retrieved?.id).toBe('parent');
    });

    it('should get children tasks', () => {
      const parent = createTask('parent');
      const child1 = createTask('child-1');
      const child2 = createTask('child-2');

      decomposition.registerTask(parent);
      decomposition.registerTask(child1, 'parent');
      decomposition.registerTask(child2, 'parent');

      const children = decomposition.getChildren('parent');
      expect(children.length).toBe(2);
    });

    it('should get all descendants', () => {
      const root = createTask('root');
      const child = createTask('child');
      const grandchild = createTask('grandchild');

      decomposition.registerTask(root);
      decomposition.registerTask(child, 'root');
      decomposition.registerTask(grandchild, 'child');

      const descendants = decomposition.getDescendants('root');
      expect(descendants.length).toBe(2);
    });

    it('should get all ancestors', () => {
      const root = createTask('root');
      const child = createTask('child');
      const grandchild = createTask('grandchild');

      decomposition.registerTask(root);
      decomposition.registerTask(child, 'root');
      decomposition.registerTask(grandchild, 'child');

      const ancestors = decomposition.getAncestors('grandchild');
      expect(ancestors.length).toBe(2);
      expect(ancestors[0]?.id).toBe('child');
      expect(ancestors[1]?.id).toBe('root');
    });
  });

  describe('node classification', () => {
    it('should identify root nodes', () => {
      const task = createTask('task');
      decomposition.registerTask(task);

      expect(decomposition.isRoot('task')).toBe(true);
    });

    it('should identify non-root nodes', () => {
      const parent = createTask('parent');
      const child = createTask('child');

      decomposition.registerTask(parent);
      decomposition.registerTask(child, 'parent');

      expect(decomposition.isRoot('child')).toBe(false);
    });

    it('should identify leaf nodes', () => {
      const parent = createTask('parent');
      const child = createTask('child');

      decomposition.registerTask(parent);
      decomposition.registerTask(child, 'parent');

      expect(decomposition.isLeaf('parent')).toBe(false);
      expect(decomposition.isLeaf('child')).toBe(true);
    });
  });

  describe('aggregation', () => {
    it('should aggregate results from children', () => {
      const parent = createTask('parent');
      decomposition.registerTask(parent);

      const plan: DecompositionPlan = {
        parentTaskId: 'parent',
        strategy: 'parallel',
        subtasks: [
          { description: 'Subtask 1' },
          { description: 'Subtask 2' },
        ],
      };

      const subtasks = decomposition.decompose(parent, plan);

      // Mark one as completed
      subtasks[0]!.status.state = 'completed';

      const result = decomposition.aggregateResults('parent');

      expect(result?.completedCount).toBe(1);
      expect(result?.totalCount).toBe(2);
      expect(result?.successRate).toBe(0.5);
      expect(result?.anyCompleted).toBe(true);
      expect(result?.allCompleted).toBe(false);
    });

    it('should return null for task without children', () => {
      const task = createTask('task');
      decomposition.registerTask(task);

      expect(decomposition.aggregateResults('task')).toBeNull();
    });
  });

  describe('removal', () => {
    it('should remove task and descendants', () => {
      const root = createTask('root');
      const child = createTask('child');

      decomposition.registerTask(root);
      decomposition.registerTask(child, 'root');

      decomposition.remove('root');

      expect(decomposition.getNode('root')).toBeUndefined();
      expect(decomposition.getNode('child')).toBeUndefined();
    });
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      const root = createTask('root');
      const child1 = createTask('child-1');
      const child2 = createTask('child-2');

      decomposition.registerTask(root);
      decomposition.registerTask(child1, 'root');
      decomposition.registerTask(child2, 'root');

      const stats = decomposition.getStats();

      expect(stats.totalTasks).toBe(3);
      expect(stats.maxDepth).toBe(1);
      expect(stats.rootCount).toBe(1);
      expect(stats.leafCount).toBe(2);
    });
  });
});
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TaskStateMachine,
  type TaskState,
  isValidTaskStatus,
  createInitialStatus,
} from '../src/state-machine.js';

describe('TaskStateMachine', () => {
  let machine: TaskStateMachine;

  beforeEach(() => {
    machine = new TaskStateMachine();
  });

  describe('initialization', () => {
    it('should start in submitted state', () => {
      expect(machine.getState()).toBe('submitted');
    });

    it('should allow custom initial state', () => {
      const workingMachine = new TaskStateMachine('working');
      expect(workingMachine.getState()).toBe('working');
    });

    it('should not be terminal initially', () => {
      expect(machine.isTerminal()).toBe(false);
    });
  });

  describe('valid transitions', () => {
    it('should allow submitted -> working', () => {
      expect(machine.canTransitionTo('working')).toBe(true);
    });

    it('should allow submitted -> canceled', () => {
      expect(machine.canTransitionTo('canceled')).toBe(true);
    });

    it('should allow submitted -> rejected', () => {
      expect(machine.canTransitionTo('rejected')).toBe(true);
    });

    it('should not allow submitted -> completed', () => {
      expect(machine.canTransitionTo('completed')).toBe(false);
    });

    it('should allow working -> completed', () => {
      machine.transition('working');
      expect(machine.canTransitionTo('completed')).toBe(true);
    });

    it('should allow working -> failed', () => {
      machine.transition('working');
      expect(machine.canTransitionTo('failed')).toBe(true);
    });

    it('should not allow working -> submitted', () => {
      machine.transition('working');
      expect(machine.canTransitionTo('submitted')).toBe(false);
    });
  });

  describe('terminal states', () => {
    it('should be terminal after completed', () => {
      machine.transition('working');
      machine.transition('completed');
      expect(machine.isTerminal()).toBe(true);
    });

    it('should be terminal after failed', () => {
      machine.transition('working');
      machine.transition('failed');
      expect(machine.isTerminal()).toBe(true);
    });

    it('should be terminal after canceled', () => {
      machine.transition('canceled');
      expect(machine.isTerminal()).toBe(true);
    });

    it('should not allow transitions from terminal state', () => {
      machine.transition('working');
      machine.transition('completed');
      expect(machine.canTransitionTo('working')).toBe(false);
    });
  });

  describe('transition execution', () => {
    it('should execute valid transition', () => {
      const result = machine.transition('working');
      expect(result.allowed).toBe(true);
      expect(result.from).toBe('submitted');
      expect(result.to).toBe('working');
      expect(machine.getState()).toBe('working');
    });

    it('should reject invalid transition', () => {
      const result = machine.transition('completed');
      expect(result.allowed).toBe(false);
      expect(machine.getState()).toBe('submitted');
    });
  });

  describe('history', () => {
    it('should record transition history', () => {
      machine.transition('working');
      machine.transition('completed');

      const history = machine.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]?.to).toBe('working');
      expect(history[1]?.to).toBe('completed');
    });
  });

  describe('valid next states', () => {
    it('should list valid next states from submitted', () => {
      const next = machine.getValidNextStates();
      expect(next).toContain('working');
      expect(next).toContain('canceled');
      expect(next).toContain('rejected');
      expect(next).toContain('input-required');
      expect(next).toContain('auth-required');
    });

    it('should return empty array for terminal state', () => {
      machine.transition('canceled');
      expect(machine.getValidNextStates()).toEqual([]);
    });
  });

  describe('status creation', () => {
    it('should create status object', () => {
      const status = machine.createStatus('Test message', 50);
      expect(status.state).toBe('submitted');
      expect(status.message).toBe('Test message');
      expect(status.progress).toBe(50);
      expect(status.timestamp).toBeDefined();
    });
  });
});

describe('Helper functions', () => {
  describe('isValidTaskStatus', () => {
    it('should validate correct status', () => {
      expect(isValidTaskStatus({ state: 'submitted', timestamp: Date.now() })).toBe(true);
      expect(isValidTaskStatus({ state: 'working', timestamp: Date.now() })).toBe(true);
      expect(isValidTaskStatus({ state: 'completed', timestamp: Date.now() })).toBe(true);
    });

    it('should reject invalid status', () => {
      expect(isValidTaskStatus(null)).toBe(false);
      expect(isValidTaskStatus({})).toBe(false);
      expect(isValidTaskStatus({ state: 'invalid' })).toBe(false);
      expect(isValidTaskStatus({ timestamp: Date.now() })).toBe(false);
    });
  });

  describe('createInitialStatus', () => {
    it('should create submitted status', () => {
      const status = createInitialStatus('Initial task');
      expect(status.state).toBe('submitted');
      expect(status.message).toBe('Initial task');
      expect(status.timestamp).toBeDefined();
    });
  });
});
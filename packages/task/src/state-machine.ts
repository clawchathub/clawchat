/**
 * Task State Machine
 * Implements A2A Task lifecycle with all state transitions
 */

import type { A2AMessage } from '@clawchat/core';

// ============================================
// Types
// ============================================

export type TaskState =
  | 'submitted'      // Task has been submitted
  | 'working'        // Task is being processed
  | 'input-required' // Task needs additional input
  | 'auth-required'  // Task needs authentication
  | 'completed'      // Task completed successfully
  | 'failed'         // Task failed
  | 'canceled'       // Task was canceled
  | 'rejected';      // Task was rejected

export type TerminalState = 'completed' | 'failed' | 'canceled' | 'rejected';

export interface TaskStatus {
  state: TaskState;
  timestamp: number;
  message?: A2AMessage;
}

export interface StateTransition {
  from: TaskState;
  to: TaskState;
  allowed: boolean;
  reason?: string;
}

// ============================================
// State Machine Configuration
// ============================================

/**
 * Valid state transitions based on A2A specification
 */
const VALID_TRANSITIONS: Map<TaskState, Set<TaskState>> = new Map([
  ['submitted', new Set(['working', 'canceled', 'rejected', 'auth-required', 'input-required'])],
  ['working', new Set(['completed', 'failed', 'canceled', 'input-required', 'auth-required'])],
  ['input-required', new Set(['working', 'canceled', 'submitted'])],
  ['auth-required', new Set(['working', 'canceled', 'submitted'])],
  ['completed', new Set()], // Terminal state
  ['failed', new Set()], // Terminal state
  ['canceled', new Set()], // Terminal state
  ['rejected', new Set()], // Terminal state
]);

/**
 * Terminal states that cannot transition
 */
const TERMINAL_STATES: Set<TaskState> = new Set([
  'completed',
  'failed',
  'canceled',
  'rejected',
]);

// ============================================
// State Machine
// ============================================

export class TaskStateMachine {
  private currentState: TaskState;
  private history: StateTransition[] = [];

  constructor(initialState: TaskState = 'submitted') {
    this.currentState = initialState;
  }

  /**
   * Get current state
   */
  getState(): TaskState {
    return this.currentState;
  }

  /**
   * Check if current state is terminal
   */
  isTerminal(): boolean {
    return TERMINAL_STATES.has(this.currentState);
  }

  /**
   * Check if transition is valid
   */
  canTransitionTo(newState: TaskState): boolean {
    if (this.isTerminal()) {
      return false;
    }

    const allowedTransitions = VALID_TRANSITIONS.get(this.currentState);
    return allowedTransitions?.has(newState) ?? false;
  }

  /**
   * Attempt state transition
   */
  transition(newState: TaskState, reason?: string): StateTransition {
    const allowed = this.canTransitionTo(newState);

    const transition: StateTransition = {
      from: this.currentState,
      to: newState,
      allowed,
      reason,
    };

    if (allowed) {
      this.currentState = newState;
    }

    this.history.push(transition);
    return transition;
  }

  /**
   * Force state transition (for recovery/testing)
   */
  forceState(newState: TaskState): void {
    this.currentState = newState;
  }

  /**
   * Get transition history
   */
  getHistory(): StateTransition[] {
    return [...this.history];
  }

  /**
   * Get valid next states
   */
  getValidNextStates(): TaskState[] {
    if (this.isTerminal()) {
      return [];
    }

    const allowed = VALID_TRANSITIONS.get(this.currentState);
    return allowed ? Array.from(allowed) : [];
  }

  /**
   * Create status object for current state
   */
  createStatus(message?: A2AMessage): TaskStatus {
    return {
      state: this.currentState,
      timestamp: Date.now(),
      message,
    };
  }

  /**
   * Check if state is a terminal state
   */
  static isTerminalState(state: TaskState): boolean {
    return TERMINAL_STATES.has(state);
  }

  /**
   * Get all valid transitions from a state
   */
  static getValidTransitions(state: TaskState): TaskState[] {
    const allowed = VALID_TRANSITIONS.get(state);
    return allowed ? Array.from(allowed) : [];
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Validate a task status object
 */
export function isValidTaskStatus(status: unknown): status is TaskStatus {
  if (typeof status !== 'object' || status === null) {
    return false;
  }

  const s = status as Record<string, unknown>;

  if (typeof s.state !== 'string') {
    return false;
  }

  const validStates: TaskState[] = [
    'submitted', 'working', 'input-required', 'auth-required',
    'completed', 'failed', 'canceled', 'rejected',
  ];

  return validStates.includes(s.state as TaskState);
}

/**
 * Create initial task status
 */
export function createInitialStatus(message?: A2AMessage): TaskStatus {
  return {
    state: 'submitted',
    timestamp: Date.now(),
    message,
  };
}
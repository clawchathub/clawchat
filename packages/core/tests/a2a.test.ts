import { describe, it, expect } from 'vitest';
import {
  TaskStateSchema,
  TaskStatusSchema,
  A2ATaskSchema,
  A2AMessageSchema,
  PartSchema,
  isTerminalState,
  TERMINAL_STATES,
  NON_TERMINAL_STATES,
} from '../src/types/a2a.js';

describe('A2A Types', () => {
  describe('Part Schema', () => {
    it('should validate text part', () => {
      const result = PartSchema.safeParse({
        type: 'text',
        text: 'Hello',
      });

      expect(result.success).toBe(true);
    });

    it('should validate file part', () => {
      const result = PartSchema.safeParse({
        type: 'file',
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should validate data part', () => {
      const result = PartSchema.safeParse({
        type: 'data',
        data: { key: 'value' },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Message Schema', () => {
    it('should validate a simple message', () => {
      const result = A2AMessageSchema.safeParse({
        role: 'agent',
        parts: [{ type: 'text', text: 'Hello' }],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Task State', () => {
    it('should identify terminal states correctly', () => {
      expect(isTerminalState('completed')).toBe(true);
      expect(isTerminalState('failed')).toBe(true);
      expect(isTerminalState('working')).toBe(false);
      expect(isTerminalState('submitted')).toBe(false);
    });

    it('should have correct terminal states', () => {
      expect(TERMINAL_STATES).toEqual(['completed', 'failed', 'canceled', 'rejected']);
      expect(NON_TERMINAL_STATES).toEqual(['submitted', 'working', 'input-required', 'auth-required']);
    });
  });

  describe('Task Schema', () => {
    it('should validate a complete task', () => {
      const result = A2ATaskSchema.safeParse({
        id: 'task-123',
        contextId: 'ctx-456',
        status: {
          state: 'working',
          timestamp: Date.now(),
        },
      });

      expect(result.success).toBe(true);
    });
  });
});
/**
 * A2A Protocol Type Definitions
 * Based on Google A2A v0.3 Specification
 * @see https://github.com/google/A2A
 */

import { z } from 'zod';

// ============================================
// Part Types - Message content parts
// ============================================

export const PartTypeSchema = z.enum(['text', 'file', 'data']);
export type PartType = z.infer<typeof PartTypeSchema>;

export const TextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const FilePartSchema = z.object({
  type: z.literal('file'),
  file: z.object({
    name: z.string(),
    mimeType: z.string(),
    bytes: z.string().optional(), // Base64 encoded
    uri: z.string().optional(),
  }),
});

export const DataPartSchema = z.object({
  type: z.literal('data'),
  data: z.record(z.unknown()),
});

export const PartSchema = z.discriminatedUnion('type', [
  TextPartSchema,
  FilePartSchema,
  DataPartSchema,
]);

export type Part = z.infer<typeof PartSchema>;
export type TextPart = z.infer<typeof TextPartSchema>;
export type FilePart = z.infer<typeof FilePartSchema>;
export type DataPart = z.infer<typeof DataPartSchema>;

// ============================================
// Message Types
// ============================================

export const MessageRoleSchema = z.enum(['user', 'agent']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const A2AMessageSchema = z.object({
  role: MessageRoleSchema,
  parts: z.array(PartSchema),
  contextId: z.string().optional(),
  taskId: z.string().optional(),
  timestamp: z.number().optional(),
});

export type A2AMessage = z.infer<typeof A2AMessageSchema>;

// ============================================
// Artifact Types
// ============================================

export const ArtifactSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parts: z.array(PartSchema),
  index: z.number().optional(),
  append: z.boolean().optional(),
  lastChunk: z.boolean().optional(),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

// ============================================
// Task Types
// ============================================

export const TaskStateSchema = z.enum([
  'submitted',
  'working',
  'input-required',
  'auth-required',
  'completed',
  'failed',
  'canceled',
  'rejected',
]);

export type TaskState = z.infer<typeof TaskStateSchema>;

export const TaskStatusSchema = z.object({
  state: TaskStateSchema,
  timestamp: z.number(),
  message: A2AMessageSchema.optional(),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const A2ATaskSchema = z.object({
  id: z.string(),
  contextId: z.string(),
  status: TaskStatusSchema,
  history: z.array(A2AMessageSchema).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  metadata: z.record(z.string()).optional(),
});

export type A2ATask = z.infer<typeof A2ATaskSchema>;

// Terminal vs Non-terminal states
export const TERMINAL_STATES: TaskState[] = ['completed', 'failed', 'canceled', 'rejected'];
export const NON_TERMINAL_STATES: TaskState[] = ['submitted', 'working', 'input-required', 'auth-required'];

export function isTerminalState(state: TaskState): boolean {
  return TERMINAL_STATES.includes(state);
}

// ============================================
// JSON-RPC Types
// ============================================

export const A2AMethodSchema = z.enum([
  'message/send',
  'message/stream',
  'task/get',
  'task/list',
  'task/cancel',
  'task/subscribe',
  'task/pushNotificationConfig/set',
  'task/pushNotificationConfig/get',
  'agent/card/extended',
]);

export type A2AMethod = z.infer<typeof A2AMethodSchema>;

export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: A2AMethodSchema,
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
});

export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;

export const JSONRPCResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

export type JSONRPCResponse = z.infer<typeof JSONRPCResponseSchema>;

export const JSONRPCErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type JSONRPCError = z.infer<typeof JSONRPCErrorSchema>;

// Standard JSON-RPC error codes
export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
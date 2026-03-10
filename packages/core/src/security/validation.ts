/**
 * Input validation and sanitization utilities
 */

import { z } from 'zod';

// Common validation schemas
export const schemas = {
  publicKey: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Invalid public key format'),
  privateKey: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Invalid private key format'),
  agentId: z.string().min(1).max(256),
  taskId: z.string().uuid(),
  message: z.string().max(100000), // 100KB max message size
  url: z.string().url(),
  timestamp: z.number().int().positive(),
  jsonRpcId: z.union([z.string(), z.number(), z.null()]),
};

// A2A Message schema
export const A2AMessageSchema = z.object({
  role: z.enum(['user', 'agent']),
  parts: z
    .array(
      z.union([
        z.object({
          type: z.literal('text'),
          text: z.string().max(100000),
        }),
        z.object({
          type: z.literal('file'),
          file: z.object({
            name: z.string().max(256),
            mimeType: z.string().max(128),
            bytes: z.string().optional(),
            uri: z.string().url().optional(),
          }),
        }),
        z.object({
          type: z.literal('data'),
          data: z.record(z.unknown()),
        }),
      ])
    )
    .min(1)
    .max(100),
  contextId: z.string().optional(),
  taskId: z.string().optional(),
});

// A2A Task schema
export const A2ATaskSchema = z.object({
  id: z.string(),
  contextId: z.string().optional(),
  status: z.object({
    state: z.enum([
      'submitted',
      'working',
      'input-required',
      'auth-required',
      'completed',
      'failed',
      'canceled',
      'rejected',
    ]),
    message: A2AMessageSchema.optional(),
    timestamp: z.number().optional(),
  }),
  history: z.array(A2AMessageSchema).optional(),
  artifacts: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        parts: z.array(z.unknown()),
      })
    )
    .optional(),
});

// Agent Card schema
export const AgentCardSchema = z.object({
  identity: z.object({
    name: z.string().min(1).max(256),
    description: z.string().max(1000),
    url: z.string().url(),
    version: z.string().max(32),
    documentationUrl: z.string().url().optional(),
    provider: z
      .object({
        organization: z.string(),
        url: z.string().url(),
      })
      .optional(),
  }),
  capabilities: z.object({
    streaming: z.boolean(),
    pushNotifications: z.boolean(),
    extendedAgentCard: z.boolean(),
  }),
  securitySchemes: z.array(z.unknown()).optional(),
  skills: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
      })
    )
    .optional(),
});

// JSON-RPC Request schema
export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1).max(256),
  params: z.record(z.unknown()).optional(),
  id: schemas.jsonRpcId,
});

// JSON-RPC Response schema
export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number().int(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
  id: schemas.jsonRpcId,
});

/**
 * Sanitize string input
 */
export function sanitizeString(input: string, maxLength: number = 10000): string {
  // Remove control characters except newline and tab
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize object by removing dangerous keys
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  dangerousKeys: string[] = ['__proto__', 'constructor', 'prototype']
): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (dangerousKeys.includes(key)) {
      continue;
    }

    if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>, dangerousKeys);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Validate and parse JSON safely
 */
export function safeParseJson<T>(
  input: string,
  schema: z.ZodSchema<T>,
  maxLength: number = 1000000 // 1MB default
): { success: true; data: T } | { success: false; error: string } {
  // Check length
  if (input.length > maxLength) {
    return { success: false, error: 'Input exceeds maximum length' };
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }

  // Validate with schema
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Validate hex string
 */
export function isValidHex(input: string, expectedLength?: number): boolean {
  const regex = expectedLength
    ? new RegExp(`^[a-fA-F0-9]{${expectedLength}}$`)
    : /^[a-fA-F0-9]+$/;
  return regex.test(input);
}

/**
 * Validate base64 string
 */
export function isValidBase64(input: string): boolean {
  try {
    return Buffer.from(input, 'base64').toString('base64') === input;
  } catch {
    return false;
  }
}

/**
 * Validate URL with allowed protocols
 */
export function isValidUrl(
  input: string,
  allowedProtocols: string[] = ['http:', 'https:']
): boolean {
  try {
    const url = new URL(input);
    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Check for SQL injection patterns
 */
export function hasSqlInjectionPatterns(input: string): boolean {
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b)/i,
    /(--)|(\/\*)|(\*\/)/,
    /(\bOR\b|\bAND\b)\s*['"]?\d+['"]?\s*=\s*['"]?\d+/i,
    /['"];\s*(SELECT|INSERT|UPDATE|DELETE|DROP)/i,
    /\bUNION\b.*\bSELECT\b/i,
  ];

  return patterns.some((pattern) => pattern.test(input));
}

/**
 * Check for XSS patterns
 */
export function hasXssPatterns(input: string): boolean {
  const patterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
  ];

  return patterns.some((pattern) => pattern.test(input));
}

/**
 * Comprehensive input validator
 */
export class InputValidator {
  private maxStringLength: number;
  private maxObjectDepth: number;
  private maxArrayLength: number;

  constructor(options?: {
    maxStringLength?: number;
    maxObjectDepth?: number;
    maxArrayLength?: number;
  }) {
    this.maxStringLength = options?.maxStringLength ?? 100000;
    this.maxObjectDepth = options?.maxObjectDepth ?? 10;
    this.maxArrayLength = options?.maxArrayLength ?? 1000;
  }

  validate(input: unknown, depth: number = 0): { valid: boolean; error?: string } {
    // Check depth
    if (depth > this.maxObjectDepth) {
      return { valid: false, error: 'Object depth exceeds maximum' };
    }

    // Handle strings
    if (typeof input === 'string') {
      if (input.length > this.maxStringLength) {
        return { valid: false, error: 'String exceeds maximum length' };
      }
      if (hasSqlInjectionPatterns(input)) {
        return { valid: false, error: 'Potential SQL injection detected' };
      }
      if (hasXssPatterns(input)) {
        return { valid: false, error: 'Potential XSS detected' };
      }
      return { valid: true };
    }

    // Handle arrays
    if (Array.isArray(input)) {
      if (input.length > this.maxArrayLength) {
        return { valid: false, error: 'Array exceeds maximum length' };
      }
      for (const item of input) {
        const result = this.validate(item, depth + 1);
        if (!result.valid) {
          return result;
        }
      }
      return { valid: true };
    }

    // Handle objects
    if (typeof input === 'object' && input !== null) {
      const entries = Object.entries(input);

      // Check for dangerous keys
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      for (const key of dangerousKeys) {
        if (key in input) {
          return { valid: false, error: `Dangerous key detected: ${key}` };
        }
      }

      for (const [, value] of entries) {
        const result = this.validate(value, depth + 1);
        if (!result.valid) {
          return result;
        }
      }
      return { valid: true };
    }

    return { valid: true };
  }
}
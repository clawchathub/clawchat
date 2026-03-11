/**
 * Security Types for Intervention Module
 * Defines types for authentication, authorization, and audit logging
 */

import { z } from 'zod';
import {
  type InterventionAction,
  type InterventionRole,
  InterventionActionSchema,
  InterventionRoleSchema,
} from '../types.js';

// Re-export types from parent module
export type { InterventionAction, InterventionRole } from '../types.js';

// ============================================
// Authentication Types
// ============================================

/**
 * JWT token payload structure
 */
export const JwtPayloadSchema = z.object({
  sub: z.string(),           // Subject (user ID)
  iss: z.string().optional(), // Issuer
  aud: z.string().optional(), // Audience
  exp: z.number().optional(), // Expiration timestamp
  iat: z.number().optional(), // Issued at timestamp
  roles: z.array(z.string()).default([]), // User roles
  permissions: z.array(z.string()).optional(), // Fine-grained permissions
  metadata: z.record(z.unknown()).optional(), // Additional metadata
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

/**
 * Authentication result
 */
export const AuthResultSchema = z.object({
  success: z.boolean(),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  error: z.string().optional(),
  tokenExpired: z.boolean().optional(),
});
export type AuthResult = z.infer<typeof AuthResultSchema>;

/**
 * Authentication provider interface
 */
export interface AuthProvider {
  /** Provider name for identification */
  readonly name: string;

  /** Validate a JWT token and return the payload */
  validateToken(token: string): Promise<JwtPayload | null>;

  /** Extract user identity from token */
  extractIdentity(token: string): Promise<UserIdentity | null>;

  /** Verify token is not revoked */
  isTokenValid(token: string): Promise<boolean>;
}

/**
 * User identity extracted from token
 */
export const UserIdentitySchema = z.object({
  id: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UserIdentity = z.infer<typeof UserIdentitySchema>;

// ============================================
// Authorization Types
// ============================================

/**
 * Permission definition
 */
export const PermissionSchema = z.object({
  resource: z.string(),       // Resource type (e.g., 'conversation', 'message')
  action: z.string(),         // Action (e.g., 'read', 'write', 'delete')
  conditions: z.record(z.unknown()).optional(), // Optional conditions
});
export type Permission = z.infer<typeof PermissionSchema>;

/**
 * Role definition with permissions
 */
export const RoleDefinitionSchema = z.object({
  name: z.string(),
  permissions: z.array(PermissionSchema),
  inherits: z.array(z.string()).optional(), // Parent roles to inherit from
  description: z.string().optional(),
});
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;

/**
 * Authorization check result
 */
export const AuthorizationResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  requiredPermissions: z.array(z.string()).optional(),
  missingPermissions: z.array(z.string()).optional(),
});
export type AuthorizationResult = z.infer<typeof AuthorizationResultSchema>;

/**
 * Resource context for authorization checks
 */
export const ResourceContextSchema = z.object({
  resourceType: z.string(),
  resourceId: z.string().optional(),
  ownerId: z.string().optional(),
  conversationId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ResourceContext = z.infer<typeof ResourceContextSchema>;

/**
 * Sensitive operation that requires confirmation
 */
export const SENSITIVE_OPERATIONS: readonly InterventionAction[] = [
  'terminate',
  'delegate',
] as const;

/**
 * Confirmation request for sensitive operations
 */
export const ConfirmationRequestSchema = z.object({
  id: z.string(),
  userId: z.string(),
  operation: z.string(),
  resourceContext: ResourceContextSchema,
  expiresAt: z.number(),
  createdAt: z.number(),
  confirmed: z.boolean().optional(),
  confirmedAt: z.number().optional(),
});
export type ConfirmationRequest = z.infer<typeof ConfirmationRequestSchema>;

// ============================================
// Audit Log Types
// ============================================

/**
 * Audit log entry
 */
export const AuditLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  userId: z.string(),
  sessionId: z.string().optional(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().optional(),
  conversationId: z.string().optional(),
  result: z.enum(['success', 'failure', 'denied']),
  errorMessage: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  correlationId: z.string().optional(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

/**
 * Audit log storage backend type
 */
export const AuditStorageTypeSchema = z.enum(['memory', 'file', 'database']);
export type AuditStorageType = z.infer<typeof AuditStorageTypeSchema>;

/**
 * Audit log configuration
 */
export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  storageType: AuditStorageTypeSchema.default('memory'),
  retentionDays: z.number().default(90),
  maxEntries: z.number().optional(), // For memory storage
  filePath: z.string().optional(),   // For file storage
  databaseUrl: z.string().optional(), // For database storage
  logSensitiveData: z.boolean().default(false),
  includeIpAddress: z.boolean().default(true),
});
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

/**
 * Audit query options
 */
export const AuditQueryOptionsSchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  conversationId: z.string().optional(),
  result: z.enum(['success', 'failure', 'denied']).optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  limit: z.number().default(100),
  offset: z.number().default(0),
});
export type AuditQueryOptions = z.infer<typeof AuditQueryOptionsSchema>;

// ============================================
// Security Configuration
// ============================================

/**
 * Security configuration for the intervention module
 */
export const SecurityConfigSchema = z.object({
  authentication: z.object({
    enabled: z.boolean().default(true),
    tokenExpiryMs: z.number().default(3600000), // 1 hour
    requireConfirmationForSensitive: z.boolean().default(true),
    confirmationExpiryMs: z.number().default(300000), // 5 minutes
  }),
  authorization: z.object({
    enabled: z.boolean().default(true),
    strictMode: z.boolean().default(false), // Deny by default if no policy
  }),
  audit: AuditConfigSchema,
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  authentication: {
    enabled: true,
    tokenExpiryMs: 3600000,
    requireConfirmationForSensitive: true,
    confirmationExpiryMs: 300000,
  },
  authorization: {
    enabled: true,
    strictMode: false,
  },
  audit: {
    enabled: true,
    storageType: 'memory',
    retentionDays: 90,
    logSensitiveData: false,
    includeIpAddress: true,
  },
};

// ============================================
// Intervention Action to Permission Mapping
// ============================================

/**
 * Maps intervention actions to required permissions
 */
export const ACTION_PERMISSION_MAP: Record<InterventionAction, string[]> = {
  send_message: ['conversation:write'],
  request_clarification: ['conversation:write'],
  redirect: ['conversation:moderate'],
  pause: ['conversation:moderate'],
  resume: ['conversation:moderate'],
  terminate: ['conversation:admin'],
  approve: ['conversation:approve'],
  reject: ['conversation:approve'],
  delegate: ['conversation:admin'],
};
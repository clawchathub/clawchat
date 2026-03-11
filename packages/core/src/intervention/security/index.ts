/**
 * Security Module Exports for Intervention
 * Provides authentication, authorization, and audit logging
 */

// Types
export type {
  JwtPayload,
  AuthResult,
  AuthProvider,
  UserIdentity,
  Permission,
  RoleDefinition,
  AuthorizationResult,
  ResourceContext,
  ConfirmationRequest,
  AuditLogEntry,
  AuditStorageType,
  AuditConfig,
  AuditQueryOptions,
  SecurityConfig,
} from './types.js';

export {
  JwtPayloadSchema,
  AuthResultSchema,
  UserIdentitySchema,
  PermissionSchema,
  RoleDefinitionSchema,
  AuthorizationResultSchema,
  ResourceContextSchema,
  ConfirmationRequestSchema,
  AuditLogEntrySchema,
  AuditStorageTypeSchema,
  AuditConfigSchema,
  AuditQueryOptionsSchema,
  SecurityConfigSchema,
  DEFAULT_SECURITY_CONFIG,
  SENSITIVE_OPERATIONS,
  ACTION_PERMISSION_MAP,
} from './types.js';

// Authentication
export {
  DefaultJwtAuthProvider,
  AuthenticationMiddleware,
  ConfirmationManager,
} from './auth.js';

// Authorization
export {
  PermissionChecker,
  AuthorizationMiddleware,
  DEFAULT_ROLE_DEFINITIONS,
} from './authorization.js';

// Audit Logging
export {
  AuditLogger,
  MemoryAuditStorage,
  FileAuditStorage,
  DatabaseAuditStorage,
  type AuditStorage,
} from './audit.js';
/**
 * Authorization Module for Intervention
 * Provides role-based access control (RBAC) and permission checking
 */

import type {
  AuthorizationResult,
  RoleDefinition,
  Permission,
  ResourceContext,
  UserIdentity,
  SecurityConfig,
  InterventionRole,
  InterventionAction,
} from './types.js';
import { SENSITIVE_OPERATIONS, ACTION_PERMISSION_MAP } from './types.js';

// ============================================
// Default Role Definitions
// ============================================

/**
 * Default role definitions for intervention system
 */
export const DEFAULT_ROLE_DEFINITIONS: Record<InterventionRole, RoleDefinition> = {
  observer: {
    name: 'observer',
    description: 'Can view but not intervene',
    permissions: [
      { resource: 'conversation', action: 'read' },
      { resource: 'message', action: 'read' },
    ],
  },
  participant: {
    name: 'participant',
    description: 'Can send messages and request clarification',
    permissions: [
      { resource: 'conversation', action: 'read' },
      { resource: 'conversation', action: 'write' },
      { resource: 'message', action: 'read' },
      { resource: 'message', action: 'write' },
    ],
  },
  moderator: {
    name: 'moderator',
    description: 'Can guide, pause, and redirect conversations',
    permissions: [
      { resource: 'conversation', action: 'read' },
      { resource: 'conversation', action: 'write' },
      { resource: 'conversation', action: 'moderate' },
      { resource: 'message', action: 'read' },
      { resource: 'message', action: 'write' },
      { resource: 'message', action: 'delete' },
    ],
    inherits: ['participant'],
  },
  admin: {
    name: 'admin',
    description: 'Full control including termination',
    permissions: [
      { resource: 'conversation', action: 'read' },
      { resource: 'conversation', action: 'write' },
      { resource: 'conversation', action: 'moderate' },
      { resource: 'conversation', action: 'admin' },
      { resource: 'message', action: 'read' },
      { resource: 'message', action: 'write' },
      { resource: 'message', action: 'delete' },
      { resource: 'audit', action: 'read' },
    ],
    inherits: ['moderator'],
  },
};

// ============================================
// Permission Checker
// ============================================

/**
 * Permission string format: "resource:action" or "resource:action:subaction"
 */
export class PermissionChecker {
  private roleDefinitions: Map<string, RoleDefinition> = new Map();
  private config: SecurityConfig;

  constructor(config: SecurityConfig, customRoles?: Record<string, RoleDefinition>) {
    this.config = config;

    // Load default roles
    for (const [name, definition] of Object.entries(DEFAULT_ROLE_DEFINITIONS)) {
      this.roleDefinitions.set(name, definition);
    }

    // Override or add custom roles
    if (customRoles) {
      for (const [name, definition] of Object.entries(customRoles)) {
        this.roleDefinitions.set(name, definition);
      }
    }
  }

  /**
   * Check if a user has permission to perform an action
   */
  checkPermission(
    identity: UserIdentity,
    permission: string,
    context?: ResourceContext
  ): AuthorizationResult {
    if (!this.config.authorization.enabled) {
      return { allowed: true };
    }

    const userPermissions = this.getUserPermissions(identity);

    // Check if user has the required permission
    const hasPermission = this.matchesPermission(userPermissions, permission);

    if (hasPermission) {
      // Additional context-based checks
      if (context) {
        const contextResult = this.checkContext(identity, permission, context);
        if (!contextResult.allowed) {
          return contextResult;
        }
      }

      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Missing permission: ${permission}`,
      missingPermissions: [permission],
    };
  }

  /**
   * Check if a user can perform an intervention action
   */
  checkInterventionAction(
    identity: UserIdentity,
    action: InterventionAction,
    context?: ResourceContext
  ): AuthorizationResult {
    const actionPermissionMap = this.getActionPermissionMap();
    const requiredPermissions = actionPermissionMap[action] || [];

    if (requiredPermissions.length === 0) {
      // No specific permission required
      return { allowed: true };
    }

    const userPermissions = this.getUserPermissions(identity);
    const missingPermissions: string[] = [];

    for (const required of requiredPermissions) {
      if (!this.matchesPermission(userPermissions, required)) {
        missingPermissions.push(required);
      }
    }

    if (missingPermissions.length > 0) {
      return {
        allowed: false,
        reason: `Missing permissions for action: ${action}`,
        requiredPermissions,
        missingPermissions,
      };
    }

    // Check context-based authorization
    if (context) {
      return this.checkContext(identity, `intervention:${action}`, context);
    }

    return { allowed: true };
  }

  /**
   * Check if an action requires confirmation
   */
  requiresConfirmation(action: InterventionAction): boolean {
    return SENSITIVE_OPERATIONS.includes(action as typeof SENSITIVE_OPERATIONS[number]) &&
      this.config.authentication.requireConfirmationForSensitive;
  }

  /**
   * Get all permissions for a user based on their roles
   */
  private getUserPermissions(identity: UserIdentity): Set<string> {
    const permissions = new Set<string>();

    // Add direct permissions
    if (identity.permissions) {
      for (const perm of identity.permissions) {
        permissions.add(perm);
      }
    }

    // Add role-based permissions (with inheritance)
    for (const roleName of identity.roles) {
      this.addRolePermissions(roleName, permissions, new Set());
    }

    return permissions;
  }

  /**
   * Recursively add permissions from a role and its parents
   */
  private addRolePermissions(
    roleName: string,
    permissions: Set<string>,
    visited: Set<string>
  ): void {
    if (visited.has(roleName)) {
      return; // Prevent circular inheritance
    }
    visited.add(roleName);

    const role = this.roleDefinitions.get(roleName);
    if (!role) {
      return;
    }

    // Add inherited permissions first
    if (role.inherits) {
      for (const parentRole of role.inherits) {
        this.addRolePermissions(parentRole, permissions, visited);
      }
    }

    // Add role's own permissions
    for (const perm of role.permissions) {
      permissions.add(`${perm.resource}:${perm.action}`);
    }
  }

  /**
   * Check if any of the user's permissions match the required permission
   */
  private matchesPermission(userPermissions: Set<string>, required: string): boolean {
    // Direct match
    if (userPermissions.has(required)) {
      return true;
    }

    // Wildcard match (e.g., "conversation:*" matches "conversation:write")
    const [resource, action] = required.split(':');
    if (userPermissions.has(`${resource}:*`)) {
      return true;
    }
    if (userPermissions.has('*:*')) {
      return true;
    }

    // Prefix match (e.g., "conversation:admin" implies "conversation:moderate")
    const impliedPermissions = this.getImpliedPermissions(required);
    for (const implied of impliedPermissions) {
      if (userPermissions.has(implied)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get permissions implied by a higher-level permission
   */
  private getImpliedPermissions(permission: string): string[] {
    const implied: string[] = [];
    const [resource, action] = permission.split(':');

    // Admin implies moderate and write
    if (action === 'admin') {
      implied.push(`${resource}:moderate`);
      implied.push(`${resource}:write`);
      implied.push(`${resource}:read`);
    }

    // Moderate implies write
    if (action === 'moderate') {
      implied.push(`${resource}:write`);
      implied.push(`${resource}:read`);
    }

    // Write implies read
    if (action === 'write') {
      implied.push(`${resource}:read`);
    }

    return implied;
  }

  /**
   * Context-based authorization checks
   */
  private checkContext(
    identity: UserIdentity,
    permission: string,
    context: ResourceContext
  ): AuthorizationResult {
    // Check if user owns the resource
    if (context.ownerId && context.ownerId === identity.id) {
      return { allowed: true };
    }

    // Check conversation membership
    if (context.conversationId) {
      // In a real implementation, check if user is a participant
      // For now, we allow if they have the permission
    }

    // Check custom conditions in metadata
    if (context.metadata?.restrictedTo) {
      const restrictedTo = context.metadata.restrictedTo as string[];
      if (!restrictedTo.includes(identity.id)) {
        return {
          allowed: false,
          reason: 'Access restricted to specific users',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get action to permission mapping
   */
  private getActionPermissionMap(): Record<InterventionAction, string[]> {
    return {
      send_message: ['conversation:write'],
      request_clarification: ['conversation:write'],
      redirect: ['conversation:moderate'],
      pause: ['conversation:moderate'],
      resume: ['conversation:moderate'],
      terminate: ['conversation:admin'],
      approve: ['conversation:moderate'],
      reject: ['conversation:moderate'],
      delegate: ['conversation:admin'],
    };
  }

  /**
   * Add or update a role definition
   */
  defineRole(definition: RoleDefinition): void {
    this.roleDefinitions.set(definition.name, definition);
  }

  /**
   * Get a role definition
   */
  getRole(name: string): RoleDefinition | undefined {
    return this.roleDefinitions.get(name);
  }

  /**
   * List all defined roles
   */
  listRoles(): string[] {
    return Array.from(this.roleDefinitions.keys());
  }
}

// ============================================
// Authorization Middleware
// ============================================

/**
 * Authorization middleware for intervention operations
 */
export class AuthorizationMiddleware {
  private permissionChecker: PermissionChecker;
  private config: SecurityConfig;

  constructor(config: SecurityConfig, customRoles?: Record<string, RoleDefinition>) {
    this.config = config;
    this.permissionChecker = new PermissionChecker(config, customRoles);
  }

  /**
   * Authorize an intervention action
   */
  authorize(
    identity: UserIdentity,
    action: InterventionAction,
    context?: ResourceContext
  ): AuthorizationResult {
    return this.permissionChecker.checkInterventionAction(identity, action, context);
  }

  /**
   * Check if action requires confirmation
   */
  requiresConfirmation(action: InterventionAction): boolean {
    return this.permissionChecker.requiresConfirmation(action);
  }

  /**
   * Get the permission checker for advanced use cases
   */
  getPermissionChecker(): PermissionChecker {
    return this.permissionChecker;
  }

  /**
   * Define a custom role
   */
  defineRole(definition: RoleDefinition): void {
    this.permissionChecker.defineRole(definition);
  }
}
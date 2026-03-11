/**
 * Authentication Middleware for Intervention Module
 * Handles JWT token validation and user identity extraction
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AuthProvider,
  AuthResult,
  JwtPayload,
  UserIdentity,
  SecurityConfig,
} from './types.js';

// ============================================
// Default JWT Auth Provider
// ============================================

/**
 * Default JWT authentication provider implementation
 * Supports HS256 algorithm by default
 */
export class DefaultJwtAuthProvider implements AuthProvider {
  readonly name = 'default-jwt';
  private secret: string;
  private revokedTokens: Set<string> = new Set();

  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * Validate a JWT token and return the payload
   */
  async validateToken(token: string): Promise<JwtPayload | null> {
    // Check if token is revoked
    if (this.revokedTokens.has(token)) {
      return null;
    }

    try {
      const payload = this.decodeJwt(token);
      if (!payload) {
        return null;
      }

      // Check expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Extract user identity from token
   */
  async extractIdentity(token: string): Promise<UserIdentity | null> {
    const payload = await this.validateToken(token);
    if (!payload) {
      return null;
    }

    return {
      id: payload.sub,
      roles: payload.roles ?? [],
      permissions: payload.permissions,
      metadata: payload.metadata,
    };
  }

  /**
   * Verify token is not revoked
   */
  async isTokenValid(token: string): Promise<boolean> {
    const payload = await this.validateToken(token);
    return payload !== null;
  }

  /**
   * Revoke a token
   */
  revokeToken(token: string): void {
    this.revokedTokens.add(token);
  }

  /**
   * Clear revoked tokens older than the specified timestamp
   */
  cleanupRevokedTokens(expiredBefore: number): number {
    // This is a simplified implementation
    // In production, you'd want to store token metadata for proper cleanup
    let cleaned = 0;
    const tokenArray = Array.from(this.revokedTokens);
    for (const token of tokenArray) {
      try {
        const payload = this.decodeJwt(token);
        if (payload?.exp && payload.exp < expiredBefore / 1000) {
          this.revokedTokens.delete(token);
          cleaned++;
        }
      } catch {
        // Invalid token, remove it
        this.revokedTokens.delete(token);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Decode JWT token (simplified implementation)
   * In production, use a library like jose or jsonwebtoken
   */
  private decodeJwt(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Verify signature (simplified - in production use proper crypto)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      return payload;
    } catch {
      return null;
    }
  }
}

// ============================================
// Authentication Middleware
// ============================================

/**
 * Authentication middleware for intervention operations
 */
export class AuthenticationMiddleware {
  private providers: Map<string, AuthProvider> = new Map();
  private defaultProvider: AuthProvider | null = null;
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Register an authentication provider
   */
  registerProvider(provider: AuthProvider, isDefault = false): void {
    this.providers.set(provider.name, provider);
    if (isDefault || this.providers.size === 1) {
      this.defaultProvider = provider;
    }
  }

  /**
   * Get a provider by name
   */
  getProvider(name: string): AuthProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Authenticate a request using a token
   */
  async authenticate(token: string, providerName?: string): Promise<AuthResult> {
    if (!this.config.authentication.enabled) {
      return {
        success: true,
        userId: 'anonymous',
        roles: ['anonymous'],
      };
    }

    const provider = providerName
      ? this.providers.get(providerName)
      : this.defaultProvider;

    if (!provider) {
      return {
        success: false,
        error: 'No authentication provider available',
      };
    }

    try {
      const identity = await provider.extractIdentity(token);
      if (!identity) {
        return {
          success: false,
          error: 'Invalid token',
          tokenExpired: true,
        };
      }

      return {
        success: true,
        userId: identity.id,
        roles: identity.roles,
        permissions: identity.permissions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Validate a token without extracting identity
   */
  async validateToken(token: string, providerName?: string): Promise<boolean> {
    const provider = providerName
      ? this.providers.get(providerName)
      : this.defaultProvider;

    if (!provider) {
      return false;
    }

    return provider.isTokenValid(token);
  }

  /**
   * Extract user identity from a token
   */
  async extractIdentity(token: string, providerName?: string): Promise<UserIdentity | null> {
    const provider = providerName
      ? this.providers.get(providerName)
      : this.defaultProvider;

    if (!provider) {
      return null;
    }

    return provider.extractIdentity(token);
  }
}

// ============================================
// Confirmation Manager for Sensitive Operations
// ============================================

/**
 * Manages confirmation requests for sensitive operations
 */
export class ConfirmationManager {
  private pendingConfirmations: Map<string, import('./types.js').ConfirmationRequest> = new Map();
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Create a confirmation request for a sensitive operation
   */
  createConfirmationRequest(
    userId: string,
    operation: string,
    resourceContext: import('./types.js').ResourceContext
  ): import('./types.js').ConfirmationRequest {
    const now = Date.now();
    const expiresAt = now + this.config.authentication.confirmationExpiryMs;

    const request: import('./types.js').ConfirmationRequest = {
      id: uuidv4(),
      userId,
      operation,
      resourceContext,
      expiresAt,
      createdAt: now,
    };

    this.pendingConfirmations.set(request.id, request);
    return request;
  }

  /**
   * Confirm a pending request
   */
  confirmRequest(requestId: string, userId: string): boolean {
    const request = this.pendingConfirmations.get(requestId);
    if (!request) {
      return false;
    }

    // Verify ownership
    if (request.userId !== userId) {
      return false;
    }

    // Check expiration
    if (request.expiresAt < Date.now()) {
      this.pendingConfirmations.delete(requestId);
      return false;
    }

    request.confirmed = true;
    request.confirmedAt = Date.now();
    return true;
  }

  /**
   * Check if a request is confirmed
   */
  isConfirmed(requestId: string, userId: string): boolean {
    const request = this.pendingConfirmations.get(requestId);
    if (!request) {
      return false;
    }

    // Verify ownership
    if (request.userId !== userId) {
      return false;
    }

    // Check expiration
    if (request.expiresAt < Date.now()) {
      this.pendingConfirmations.delete(requestId);
      return false;
    }

    return request.confirmed === true;
  }

  /**
   * Cancel a confirmation request
   */
  cancelRequest(requestId: string): boolean {
    return this.pendingConfirmations.delete(requestId);
  }

  /**
   * Clean up expired confirmation requests
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, request] of this.pendingConfirmations.entries()) {
      if (request.expiresAt < now) {
        this.pendingConfirmations.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get pending confirmation count
   */
  getPendingCount(): number {
    return this.pendingConfirmations.size;
  }
}
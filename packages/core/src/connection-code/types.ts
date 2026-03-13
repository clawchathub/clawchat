/**
 * Connection Code Types
 * Types for Claw connection codes
 */

// ============================================
// Types
// ============================================

/**
 * Connection code format: CLAW-XXXX-XXXX-XXXX
 * Used to easily share connection information
 */
export interface ConnectionCode {
  code: string;
  nodeId: string;
  publicKey: string;
  endpoints?: Array<{ ip: string; port: number }>;
  createdAt: number;
  signature: string;
}

/**
 * Parsed connection code payload
 */
export interface ConnectionCodePayload {
  version: number;
  nodeId: string;
  publicKey: string;
  endpoints?: Array<{ ip: string; port: number }>;
  timestamp: number;
  checksum: string;
}

/**
 * Connection code configuration
 */
export interface ConnectionCodeConfig {
  /**
   * Code version (default: 1)
   */
  version?: number;

  /**
   * Include endpoints in the code (default: false)
   */
  includeEndpoints?: boolean;

  /**
   * Code validity duration in ms (default: 24 hours)
   */
  validityDuration?: number;
}

/**
 * Validation result
 */
export interface ConnectionCodeValidation {
  valid: boolean;
  expired?: boolean;
  error?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Connection code prefix
 */
export const CODE_PREFIX = 'CLAW';

/**
 * Base32 alphabet (excludes confusing characters: 0, O, I, 1)
 */
export const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Default validity duration: 24 hours
 */
export const DEFAULT_VALIDITY = 24 * 60 * 60 * 1000;
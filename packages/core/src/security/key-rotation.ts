/**
 * Key rotation support with grace period
 *
 * Allows smooth transition from old to new keys
 */

import { generateKeyPair, type KeyPair } from '../crypto/index.js';

export interface KeyRotationConfig {
  /** Grace period in milliseconds where both keys are valid */
  gracePeriodMs: number;
  /** Minimum time between rotations */
  minRotationIntervalMs: number;
}

export interface KeyHistory {
  keyId: string;
  publicKey: string;
  privateKey?: string;
  createdAt: number;
  expiresAt: number | null;
  status: 'active' | 'grace' | 'expired';
}

export interface RotationState {
  currentKeyId: string;
  currentKey: KeyPair;
  previousKeyId: string | null;
  previousPublicKey: string | null;
  gracePeriodEnds: number | null;
  lastRotation: number;
  history: KeyHistory[];
}

export const DEFAULT_ROTATION_CONFIG: KeyRotationConfig = {
  gracePeriodMs: 24 * 60 * 60 * 1000, // 24 hours
  minRotationIntervalMs: 60 * 60 * 1000, // 1 hour
};

export class KeyRotationManager {
  private state: RotationState;
  private config: KeyRotationConfig;

  constructor(
    initialKey: KeyPair,
    config: Partial<KeyRotationConfig> = {}
  ) {
    this.config = { ...DEFAULT_ROTATION_CONFIG, ...config };

    const now = Date.now();
    const keyId = this.generateKeyId(initialKey.publicKey);

    this.state = {
      currentKeyId: keyId,
      currentKey: initialKey,
      previousKeyId: null,
      previousPublicKey: null,
      gracePeriodEnds: null,
      lastRotation: now,
      history: [
        {
          keyId,
          publicKey: initialKey.publicKey,
          privateKey: initialKey.privateKey,
          createdAt: now,
          expiresAt: null,
          status: 'active',
        },
      ],
    };
  }

  /**
   * Rotate to a new key
   */
  async rotate(): Promise<{ success: boolean; newKeyId: string; error?: string }> {
    const now = Date.now();

    // Check minimum interval
    if (now - this.state.lastRotation < this.config.minRotationIntervalMs) {
      return {
        success: false,
        newKeyId: this.state.currentKeyId,
        error: 'Minimum rotation interval not reached',
      };
    }

    // Generate new key
    const newKey = await generateKeyPair();
    const newKeyId = this.generateKeyId(newKey.publicKey);

    // Update previous key status
    if (this.state.previousKeyId) {
      const prevEntry = this.state.history.find(
        (h) => h.keyId === this.state.previousKeyId
      );
      if (prevEntry) {
        prevEntry.status = 'expired';
        prevEntry.expiresAt = now;
      }
    }

    // Move current to previous
    const currentEntry = this.state.history.find(
      (h) => h.keyId === this.state.currentKeyId
    );
    if (currentEntry) {
      currentEntry.status = 'grace';
      currentEntry.expiresAt = now + this.config.gracePeriodMs;
    }

    // Add new key to history
    this.state.history.push({
      keyId: newKeyId,
      publicKey: newKey.publicKey,
      privateKey: newKey.privateKey,
      createdAt: now,
      expiresAt: null,
      status: 'active',
    });

    // Update state
    this.state.previousKeyId = this.state.currentKeyId;
    this.state.previousPublicKey = this.state.currentKey.publicKey;
    this.state.gracePeriodEnds = now + this.config.gracePeriodMs;
    this.state.currentKeyId = newKeyId;
    this.state.currentKey = newKey;
    this.state.lastRotation = now;

    return { success: true, newKeyId };
  }

  /**
   * Check if a public key is currently valid
   */
  isValidKey(publicKey: string): boolean {
    // Check current key
    if (publicKey === this.state.currentKey.publicKey) {
      return true;
    }

    // Check previous key during grace period
    if (this.state.previousPublicKey && this.state.gracePeriodEnds) {
      const now = Date.now();
      if (
        publicKey === this.state.previousPublicKey &&
        now < this.state.gracePeriodEnds
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get key status
   */
  getKeyStatus(publicKey: string): 'active' | 'grace' | 'expired' | 'unknown' {
    const entry = this.state.history.find((h) => h.publicKey === publicKey);

    if (!entry) {
      return 'unknown';
    }

    // Update status based on time
    if (entry.status === 'grace' && entry.expiresAt) {
      if (Date.now() >= entry.expiresAt) {
        return 'expired';
      }
    }

    return entry.status;
  }

  /**
   * Get current key pair
   */
  getCurrentKey(): KeyPair {
    return this.state.currentKey;
  }

  /**
   * Get current key ID
   */
  getCurrentKeyId(): string {
    return this.state.currentKeyId;
  }

  /**
   * Get previous public key (if in grace period)
   */
  getPreviousPublicKey(): string | null {
    if (this.state.gracePeriodEnds && Date.now() < this.state.gracePeriodEnds) {
      return this.state.previousPublicKey;
    }
    return null;
  }

  /**
   * Get all valid public keys (for verification)
   */
  getValidPublicKeys(): string[] {
    const keys = [this.state.currentKey.publicKey];
    const prevKey = this.getPreviousPublicKey();
    if (prevKey) {
      keys.push(prevKey);
    }
    return keys;
  }

  /**
   * Get rotation state (for persistence)
   */
  getState(): RotationState {
    return { ...this.state };
  }

  /**
   * Restore from saved state
   */
  static fromState(state: RotationState, config?: Partial<KeyRotationConfig>): KeyRotationManager {
    const manager = Object.create(KeyRotationManager.prototype);
    manager.config = { ...DEFAULT_ROTATION_CONFIG, ...config };
    manager.state = state;
    return manager;
  }

  /**
   * Check if rotation is needed
   */
  needsRotation(maxKeyAgeMs: number): boolean {
    const now = Date.now();
    const keyAge = now - this.state.lastRotation;
    return keyAge > maxKeyAgeMs;
  }

  /**
   * Get time until next allowed rotation
   */
  timeUntilNextRotation(): number {
    const elapsed = Date.now() - this.state.lastRotation;
    return Math.max(0, this.config.minRotationIntervalMs - elapsed);
  }

  /**
   * Get time until grace period ends
   */
  timeUntilGraceEnds(): number | null {
    if (!this.state.gracePeriodEnds) {
      return null;
    }
    return Math.max(0, this.state.gracePeriodEnds - Date.now());
  }

  /**
   * Prune expired keys from history
   */
  pruneExpired(): number {
    const now = Date.now();
    const originalLength = this.state.history.length;

    this.state.history = this.state.history.filter(
      (h) => h.status !== 'expired' || (h.expiresAt && h.expiresAt > now - 86400000) // Keep for 1 day after expiry
    );

    return originalLength - this.state.history.length;
  }

  private generateKeyId(publicKey: string): string {
    // Create a short ID from the public key
    return publicKey.slice(0, 16);
  }
}
/**
 * Identity Management Module
 * Ed25519 keypair generation, signing, and Agent Card management
 */

import * as ed from '@noble/ed25519';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { AgentCard, AgentIdentity, AgentSkill } from '../types/index.js';

// ============================================
// Key Types
// ============================================

export const ClawIdentitySchema = z.object({
  publicKey: z.string(), // hex-encoded Ed25519 public key
  privateKey: z.string().optional(), // hex-encoded, encrypted at rest
  agentCard: z.any(), // AgentCard
  createdAt: z.number(),
  updatedAt: z.number(),
  version: z.number(),
});

export type ClawIdentity = z.infer<typeof ClawIdentitySchema>;

// ============================================
// Identity Manager
// ============================================

export class IdentityManager {
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  private identity: ClawIdentity | null = null;

  /**
   * Generate a new Ed25519 keypair
   */
  async generateKeypair(): Promise<{ publicKey: string; privateKey: string }> {
    // Generate random private key
    this.privateKey = ed.utils.randomPrivateKey();
    this.publicKey = await ed.getPublicKeyAsync(this.privateKey);

    return {
      publicKey: this.toHex(this.publicKey),
      privateKey: this.toHex(this.privateKey),
    };
  }

  /**
   * Load existing keypair from hex strings
   */
  async loadKeypair(privateKeyHex: string): Promise<string> {
    const privateKeyBytes = IdentityManager.fromHex(privateKeyHex);
    this.privateKey = privateKeyBytes;
    this.publicKey = await ed.getPublicKeyAsync(privateKeyBytes);
    return this.toHex(this.publicKey);
  }

  /**
   * Sign a message using Ed25519
   */
  async sign(message: string | Uint8Array): Promise<string> {
    if (!this.privateKey) {
      throw new Error('No private key loaded');
    }

    const messageBytes = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : message;

    const signature = await ed.signAsync(messageBytes, this.privateKey);
    return this.toHex(signature);
  }

  /**
   * Verify a signature
   */
  static async verify(
    message: string | Uint8Array,
    signature: string,
    publicKeyHex: string
  ): Promise<boolean> {
    const messageBytes = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : message;

    const signatureBytes = IdentityManager.fromHex(signature);
    const publicKeyBytes = IdentityManager.fromHex(publicKeyHex);

    return ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
  }

  /**
   * Create a new Claw identity with Agent Card
   */
  async createIdentity(options: {
    name: string;
    description: string;
    url: string;
    version?: string;
    skills?: AgentSkill[];
    documentationUrl?: string;
    provider?: {
      organization: string;
      url: string;
    };
  }): Promise<ClawIdentity> {
    // Generate keypair
    const { publicKey, privateKey } = await this.generateKeypair();

    const now = Date.now();

    const identity: AgentIdentity = {
      name: options.name,
      description: options.description,
      url: options.url,
      version: options.version ?? '1.0.0',
      documentationUrl: options.documentationUrl,
      provider: options.provider,
    };

    const agentCard: AgentCard = {
      identity,
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extendedAgentCard: true,
      },
      skills: options.skills ?? [],
      interfaces: [
        {
          protocol: 'a2a',
          url: options.url,
          version: '0.3',
        },
      ],
    };

    this.identity = {
      publicKey,
      privateKey, // Should be encrypted in production
      agentCard,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    return this.identity;
  }

  /**
   * Get current identity
   */
  getIdentity(): ClawIdentity | null {
    return this.identity;
  }

  /**
   * Get public key
   */
  getPublicKey(): string | null {
    return this.publicKey ? this.toHex(this.publicKey) : null;
  }

  /**
   * Export identity to JSON (for storage)
   */
  exportIdentity(): string | null {
    if (!this.identity) return null;
    return JSON.stringify(this.identity, null, 2);
  }

  /**
   * Import identity from JSON
   */
  async importIdentity(json: string): Promise<ClawIdentity> {
    const parsed = JSON.parse(json) as ClawIdentity;
    this.identity = ClawIdentitySchema.parse(parsed);

    if (parsed.privateKey) {
      await this.loadKeypair(parsed.privateKey);
    }

    return this.identity;
  }

  /**
   * Generate Agent Card JSON for .well-known/agent.json
   */
  getAgentCardJson(): string | null {
    if (!this.identity) return null;
    return JSON.stringify(this.identity.agentCard, null, 2);
  }

  /**
   * Update Agent Card
   */
  updateAgentCard(updates: Partial<AgentCard>): void {
    if (!this.identity) {
      throw new Error('No identity loaded');
    }

    this.identity.agentCard = {
      ...this.identity.agentCard,
      ...updates,
    };
    this.identity.updatedAt = Date.now();
  }

  // ============================================
  // Utility Methods
  // ============================================

  private toHex(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('hex');
  }

  private static fromHex(hex: string): Uint8Array {
    return Uint8Array.from(Buffer.from(hex, 'hex'));
  }
}

// ============================================
// Identity Utilities
// ============================================

/**
 * Generate a unique agent ID
 */
export function generateAgentId(): string {
  return `claw_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Derive agent ID from public key
 */
export function deriveAgentId(publicKeyHex: string): string {
  // Take first 16 chars of public key as ID
  return `claw_${publicKeyHex.slice(0, 16)}`;
}
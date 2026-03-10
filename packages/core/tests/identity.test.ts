import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityManager, generateAgentId, deriveAgentId } from '../src/identity/index.js';

describe('IdentityManager', () => {
  let manager: IdentityManager;

  beforeEach(() => {
    manager = new IdentityManager();
  });

  describe('generateKeypair', () => {
    it('should generate a valid Ed25519 keypair', async () => {
      const { publicKey, privateKey } = await manager.generateKeypair();

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
      expect(publicKey).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(privateKey).toHaveLength(64);
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify a message', async () => {
      const { publicKey } = await manager.generateKeypair();
      const message = 'Hello, ClawChat!';
      const signature = await manager.sign(message);

      expect(signature).toBeDefined();
      expect(signature).toHaveLength(128); // 64 bytes = 128 hex chars

      const isValid = await IdentityManager.verify(message, signature, publicKey);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong message', async () => {
      const { publicKey } = await manager.generateKeypair();
      const signature = await manager.sign('Original message');

      const isValid = await IdentityManager.verify('Different message', signature, publicKey);
      expect(isValid).toBe(false);
    });
  });

  describe('createIdentity', () => {
    it('should create a valid Claw identity', async () => {
      const identity = await manager.createIdentity({
        name: 'TestAgent',
        description: 'A test agent',
        url: 'http://localhost:18789',
      });

      expect(identity).toBeDefined();
      expect(identity.publicKey).toBeDefined();
      expect(identity.agentCard.identity.name).toBe('TestAgent');
      expect(identity.agentCard.capabilities.streaming).toBe(true);
    });
  });
});

describe('Agent ID utilities', () => {
  it('should generate unique agent IDs', () => {
    const id1 = generateAgentId();
    const id2 = generateAgentId();

    expect(id1).toMatch(/^claw_[a-f0-9]{16}$/);
    expect(id2).toMatch(/^claw_[a-f0-9]{16}$/);
    expect(id1).not.toBe(id2);
  });

  it('should derive agent ID from public key', () => {
    const publicKey = 'a'.repeat(64);
    const agentId = deriveAgentId(publicKey);

    expect(agentId).toBe(`claw_${publicKey.slice(0, 16)}`);
  });
});
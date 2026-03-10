import { describe, it, expect, beforeEach } from 'vitest';
import { KeyRotationManager, DEFAULT_ROTATION_CONFIG } from '../src/security/key-rotation.js';
import { generateKeyPair } from '../src/crypto/index.js';

describe('KeyRotationManager', () => {
  let manager: KeyRotationManager;
  let initialKey: { publicKey: string; privateKey: string };

  beforeEach(async () => {
    initialKey = await generateKeyPair();
    manager = new KeyRotationManager(initialKey, {
      gracePeriodMs: 1000,
      minRotationIntervalMs: 100,
    });
  });

  it('should initialize with current key', () => {
    const key = manager.getCurrentKey();
    expect(key.publicKey).toBe(initialKey.publicKey);
    expect(key.privateKey).toBe(initialKey.privateKey);
  });

  it('should validate current key', () => {
    expect(manager.isValidKey(initialKey.publicKey)).toBe(true);
  });

  it('should reject unknown key', async () => {
    const otherKey = await generateKeyPair();
    expect(manager.isValidKey(otherKey.publicKey)).toBe(false);
  });

  it('should reject rotation before min interval', async () => {
    const result = await manager.rotate();
    expect(result.success).toBe(false);
    expect(result.error).toContain('interval');
  });

  it('should return valid public keys', () => {
    const keys = manager.getValidPublicKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(initialKey.publicKey);
  });

  it('should report time until next rotation', () => {
    const time = manager.timeUntilNextRotation();
    expect(time).toBeGreaterThan(0);
  });

  it('should get key status', () => {
    expect(manager.getKeyStatus(initialKey.publicKey)).toBe('active');
  });

  it('should get current key ID', () => {
    const keyId = manager.getCurrentKeyId();
    expect(keyId).toBeTruthy();
    expect(typeof keyId).toBe('string');
  });

  it('should get state for persistence', () => {
    const state = manager.getState();
    expect(state.currentKeyId).toBeTruthy();
    expect(state.currentKey).toBeTruthy();
  });

  it('should return null for previous key initially', () => {
    expect(manager.getPreviousPublicKey()).toBeNull();
  });

  it('should return null for grace period end initially', () => {
    expect(manager.timeUntilGraceEnds()).toBeNull();
  });
});
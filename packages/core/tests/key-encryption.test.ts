import { describe, it, expect } from 'vitest';
import { encryptPrivateKey, decryptPrivateKey } from '../src/crypto/key-encryption.js';

describe('Key Encryption', () => {
  const testPrivateKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const password = 'test-password';

  it('should encrypt and decrypt a private key', () => {
    const encrypted = encryptPrivateKey(testPrivateKey, password);
    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.salt).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = decryptPrivateKey(encrypted, password);
    expect(decrypted).toBe(testPrivateKey);
  });

  it('should produce different ciphertext on each encryption', () => {
    const encrypted1 = encryptPrivateKey(testPrivateKey, password);
    const encrypted2 = encryptPrivateKey(testPrivateKey, password);
    // Random IV and salt should produce different ciphertext
    expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    expect(encrypted1.salt).not.toBe(encrypted2.salt);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it('should fail to decrypt with wrong password', () => {
    const encrypted = encryptPrivateKey(testPrivateKey, password);
    expect(() => decryptPrivateKey(encrypted, 'wrong-password')).toThrow();
  });

  it('should handle long private keys', () => {
    const longKey = 'a'.repeat(128);
    const encrypted = encryptPrivateKey(longKey, password);
    const decrypted = decryptPrivateKey(encrypted, password);
    expect(decrypted).toBe(longKey);
  });
});

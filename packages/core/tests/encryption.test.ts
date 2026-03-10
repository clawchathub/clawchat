import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  encrypt,
  decrypt,
  encryptJSON,
  decryptJSON,
} from '../src/crypto/encryption.js';

describe('Encryption Module', () => {
  describe('generateKeyPair', () => {
    it('should generate a valid keypair', () => {
      const keyPair = generateKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).not.toBe(keyPair.privateKey);
    });

    it('should generate different keypairs each time', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a message', () => {
      const keyPair = generateKeyPair();
      const plaintext = 'Hello, ClawChat!';

      const encrypted = encrypt(plaintext, keyPair.publicKey);
      const decrypted = decrypt(encrypted, keyPair.privateKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same message', () => {
      const keyPair = generateKeyPair();
      const plaintext = 'Same message';

      const encrypted1 = encrypt(plaintext, keyPair.publicKey);
      const encrypted2 = encrypt(plaintext, keyPair.publicKey);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
    });

    it('should fail decryption with wrong private key', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();
      const plaintext = 'Secret message';

      const encrypted = encrypt(plaintext, keyPair1.publicKey);

      expect(() => decrypt(encrypted, keyPair2.privateKey)).toThrow();
    });
  });

  describe('encryptJSON and decryptJSON', () => {
    it('should encrypt and decrypt JSON data', () => {
      const keyPair = generateKeyPair();
      const data = { name: 'TestAgent', version: '1.0.0' };

      const encrypted = encryptJSON(data, keyPair.publicKey);
      const decrypted = decryptJSON<typeof data>(encrypted, keyPair.privateKey);

      expect(decrypted).toEqual(data);
    });
  });
});
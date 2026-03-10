/**
 * End-to-End Encryption Module
 * Using NaCl box for secure messaging
 */

import * as nacl from 'tweetnacl';
import { z } from 'zod';

// ============================================
// Types
// ============================================

export const EncryptedMessageSchema = z.object({
  ciphertext: z.string(), // Base64 encoded
  ephemeralPublicKey: z.string(), // Base64 encoded
  nonce: z.string(), // Base64 encoded
});

export type EncryptedMessage = z.infer<typeof EncryptedMessageSchema>;

export const KeyPairSchema = z.object({
  publicKey: z.string(), // Base64 encoded
  privateKey: z.string(), // Base64 encoded
});

export type KeyPair = z.infer<typeof KeyPairSchema>;

// ============================================
// Encryption Utilities
// ============================================

/**
 * Generate a new keypair for encryption
 */
export function generateKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
    privateKey: Buffer.from(keyPair.secretKey).toString('base64'),
  };
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/**
 * Convert Uint8Array to base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Encrypt a message using NaCl box
 * Only the recipient with the private key can decrypt
 */
export function encrypt(plaintext: string, recipientPublicKey: string): EncryptedMessage {
  const ephemeralKeyPair = nacl.box.keyPair();
  const recipientPublicKeyBytes = base64ToBytes(recipientPublicKey);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  const messageBytes = new TextEncoder().encode(plaintext);

  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKeyBytes,
    ephemeralKeyPair.secretKey
  );

  return {
    ciphertext: bytesToBase64(ciphertext),
    ephemeralPublicKey: bytesToBase64(ephemeralKeyPair.publicKey),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt a message using NaCl box
 * Requires the recipient's private key
 */
export function decrypt(
  encrypted: EncryptedMessage,
  privateKey: string
): string {
  const privateKeyBytes = base64ToBytes(privateKey);
  const ephemeralPublicKeyBytes = base64ToBytes(encrypted.ephemeralPublicKey);
  const nonceBytes = base64ToBytes(encrypted.nonce);
  const ciphertextBytes = base64ToBytes(encrypted.ciphertext);

  const decrypted = nacl.box.open(
    ciphertextBytes,
    nonceBytes,
    ephemeralPublicKeyBytes,
    privateKeyBytes
  );

  if (!decrypted) {
    throw new Error('Decryption failed: invalid ciphertext or wrong key');
  }

  return new TextDecoder().decode(decrypted);
}

// ============================================
// Message Encryption Helper
// ============================================

/**
 * Encrypt JSON message
 */
export function encryptJSON(data: unknown, recipientPublicKey: string): EncryptedMessage {
  return encrypt(JSON.stringify(data), recipientPublicKey);
}

/**
 * Decrypt JSON message with runtime validation
 * @param encrypted - The encrypted message
 * @param privateKey - The recipient's private key
 * @param schema - Optional Zod schema for runtime validation
 * @returns The decrypted and validated data
 * @throws Error if decryption fails or validation fails
 */
export function decryptJSON<T>(
  encrypted: EncryptedMessage,
  privateKey: string,
  schema?: z.ZodSchema<T>
): T {
  const plaintext = decrypt(encrypted, privateKey);

  let data: unknown;
  try {
    data = JSON.parse(plaintext);
  } catch {
    throw new Error('Decryption failed: invalid JSON');
  }

  // Validate with schema if provided
  if (schema) {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new Error(`Validation failed: ${result.error.message}`);
    }
    return result.data;
  }

  return data as T;
}
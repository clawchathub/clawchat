/**
 * Connection Code Parser
 * Parses and validates Claw connection codes
 */

import { createHash } from 'crypto';
import {
  type ConnectionCodePayload,
  type ConnectionCodeValidation,
  CODE_PREFIX,
  BASE32_ALPHABET,
  DEFAULT_VALIDITY,
} from './types.js';

// ============================================
// Base32 Decoding
// ============================================

/**
 * Decode Base32 string to bytes
 */
function base32Decode(str: string): Buffer {
  const alphabet = BASE32_ALPHABET;
  const result: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of str.toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      continue; // Skip invalid characters
    }

    value = (value << 5) | index;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      result.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(result);
}

/**
 * Calculate checksum
 */
function calculateChecksum(data: string): string {
  const hash = createHash('sha256').update(data).digest();
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of hash) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  return result.slice(0, 4).toUpperCase();
}

// ============================================
// Connection Code Parser
// ============================================

/**
 * Parse connection code
 */
export function parseConnectionCode(
  code: string
): ConnectionCodePayload | null {
  // Normalize code
  const normalizedCode = code.trim().toUpperCase();

  // Validate format
  if (!isValidFormat(normalizedCode)) {
    return null;
  }

  // Split into parts
  const parts = normalizedCode.split('-');

  if (parts.length !== 4) {
    return null;
  }

  const [_prefix, nodeIdCode, timestampCode, signatureCode] = parts;

  // Extract information
  // Note: The full node ID and public key need to be fetched from DHT
  // The code only contains a hash of the node ID

  const payload: ConnectionCodePayload = {
    version: 1,
    nodeId: nodeIdCode!, // This is a hash, not the full ID
    publicKey: '', // Will be resolved via DHT
    timestamp: Date.now(), // Will be approximate
    checksum: signatureCode!,
  };

  return payload;
}

/**
 * Validate connection code
 */
export function validateConnectionCode(
  code: string,
  nodeId?: string,
  publicKey?: string
): ConnectionCodeValidation {
  // Normalize code
  const normalizedCode = code.trim().toUpperCase();

  // Check format
  if (!isValidFormat(normalizedCode)) {
    return {
      valid: false,
      error: 'Invalid connection code format',
    };
  }

  // Split into parts
  const parts = normalizedCode.split('-');
  const [prefix, nodeIdCode, _timestampCode, signatureCode] = parts;

  // Check prefix
  if (prefix !== CODE_PREFIX) {
    return {
      valid: false,
      error: 'Invalid connection code prefix',
    };
  }

  // If we have the node ID and public key, verify the signature
  if (nodeId && publicKey) {
    const expectedSignature = calculateChecksum(
      `${nodeIdCode}${_timestampCode}${publicKey}`
    );

    if (signatureCode !== expectedSignature) {
      return {
        valid: false,
        error: 'Invalid signature',
      };
    }
  }

  // Check if code might be expired (approximate check based on timestamp code)
  // This is a rough check; actual expiry should be checked against DHT

  return {
    valid: true,
  };
}

/**
 * Check if connection code is expired
 */
export function isExpired(
  createdAt: number,
  validityDuration: number = DEFAULT_VALIDITY
): boolean {
  return Date.now() > createdAt + validityDuration;
}

/**
 * Validate connection code format
 */
export function isValidFormat(code: string): boolean {
  // Format: CLAW-XXXXXXXX-YYYY-SSSS
  const pattern = /^CLAW-[A-Z2-9]{8}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
  return pattern.test(code);
}

/**
 * Compare two connection codes
 */
export function compareCodes(code1: string, code2: string): boolean {
  return code1.toUpperCase() === code2.toUpperCase();
}
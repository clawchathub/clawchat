/**
 * Connection Code Generator
 * Generates easy-to-share connection codes for Claw
 */

import { createHash, randomBytes } from 'crypto';
import {
  type ConnectionCode,
  type ConnectionCodePayload,
  type ConnectionCodeConfig,
  CODE_PREFIX,
  BASE32_ALPHABET,
  DEFAULT_VALIDITY,
} from './types.js';

// ============================================
// Base32 Encoding
// ============================================

/**
 * Encode bytes to Base32 string
 */
function base32Encode(buffer: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * Generate random Base32 string
 */
function randomBase32(length: number): string {
  const bytes = randomBytes(Math.ceil((length * 5) / 8));
  return base32Encode(bytes).slice(0, length);
}

/**
 * Calculate checksum
 */
function calculateChecksum(data: string): string {
  const hash = createHash('sha256').update(data).digest();
  return base32Encode(hash).slice(0, 4);
}

// ============================================
// Connection Code Generator
// ============================================

/**
 * Generate a connection code for a Claw node
 */
export function generateConnectionCode(
  nodeId: string,
  publicKey: string,
  endpoints?: Array<{ ip: string; port: number }>,
  config: ConnectionCodeConfig = {}
): ConnectionCode {
  const version = config.version ?? 1;
  const includeEndpoints = config.includeEndpoints ?? false;
  const validityDuration = config.validityDuration ?? DEFAULT_VALIDITY;
  const createdAt = Date.now();

  // Create payload
  const payload: ConnectionCodePayload = {
    version,
    nodeId,
    publicKey,
    timestamp: createdAt,
    checksum: '',
  };

  if (includeEndpoints && endpoints && endpoints.length > 0) {
    payload.endpoints = endpoints;
  }

  // Calculate checksum
  const payloadStr = JSON.stringify({
    version: payload.version,
    nodeId: payload.nodeId,
    publicKey: payload.publicKey,
    timestamp: payload.timestamp,
    endpoints: payload.endpoints,
  });
  payload.checksum = calculateChecksum(payloadStr);

  // Generate code parts
  // Format: CLAW-XXXXXXXX-YYYY-SSSS
  // - XXXXXXXX: Node ID hash (8 chars)
  // - YYYY: Timestamp code (4 chars)
  // - SSSS: Signature/checksum (4 chars)

  const nodeIdCode = base32Encode(
    createHash('sha256').update(nodeId).digest()
  ).slice(0, 8).toUpperCase();

  const timestampCode = base32Encode(
    Buffer.from(Math.floor(createdAt / 60000).toString())
  ).slice(0, 4).toUpperCase();

  const signatureCode = calculateChecksum(
    `${nodeIdCode}${timestampCode}${publicKey}`
  ).toUpperCase();

  // Assemble code
  const code = `${CODE_PREFIX}-${nodeIdCode}-${timestampCode}-${signatureCode}`;

  return {
    code,
    nodeId,
    publicKey,
    endpoints: includeEndpoints ? endpoints : undefined,
    createdAt,
    signature: signatureCode,
  };
}

/**
 * Generate a short connection code (easier to type)
 */
export function generateShortCode(): string {
  const part1 = randomBase32(4).toUpperCase();
  const part2 = randomBase32(4).toUpperCase();
  return `${CODE_PREFIX}-${part1}-${part2}`;
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
 * Extract node ID from connection code
 */
export function extractNodeId(code: string): string | null {
  if (!isValidFormat(code)) {
    return null;
  }

  // The node ID code part is the second segment
  const parts = code.split('-');
  return parts[1] ?? null;
}
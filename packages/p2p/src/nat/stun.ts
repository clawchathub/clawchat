/**
 * STUN Client for NAT Type Detection
 * Based on RFC 5389 (STUN) and RFC 3489 (Classic STUN)
 *
 * @platform Node.js - Uses dgram for UDP sockets
 * @note This implementation is Node.js-only. For browser environments,
 * use WebRTC RTCPeerConnection with ICE gathering for NAT detection.
 * Browser support is not included in this module.
 */

import * as dgram from 'dgram';
import { randomBytes } from 'crypto';

// Platform detection
const isNodeJS = typeof process !== 'undefined' && process.versions?.node !== undefined;

// ============================================
// Types
// ============================================

export type NATType =
  | 'public'           // No NAT, public IP
  | 'full_cone'        // Full Cone NAT (easy)
  | 'restricted_cone'  // Restricted Cone NAT
  | 'port_restricted'  // Port Restricted Cone NAT
  | 'symmetric';       // Symmetric NAT (hardest)

export interface STUNResult {
  natType: NATType;
  publicIP: string | null;
  publicPort: number | null;
  localIP: string;
  localPort: number;
  canDirectConnect: boolean;
  detectionTime: number;
}

export interface STUNServer {
  host: string;
  port: number;
}

// STUN Message Types (RFC 5389)
const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_RESPONSE = 0x0101;
const STUN_MAGIC_COOKIE = 0x2112A442;

// STUN Attribute Types
const STUN_ATTR_MAPPED_ADDRESS = 0x0001;
const STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020;

// ============================================
// STUN Client
// ============================================

export class STUNClient {
  private servers: STUNServer[];
  private timeout: number;

  constructor(servers: STUNServer[] = [
    { host: 'stun.l.google.com', port: 19302 },
    { host: 'stun1.l.google.com', port: 19302 },
  ]) {
    this.servers = servers;
    this.timeout = 5000; // 5 seconds
  }

  /**
   * Detect NAT type using STUN protocol
   * @throws Error if called in non-Node.js environment
   */
  async detectNATType(): Promise<STUNResult> {
    // Platform check
    if (!isNodeJS) {
      throw new Error(
        'STUN client is only available in Node.js environments. ' +
        'For browser NAT detection, use WebRTC RTCPeerConnection with ICE gathering.'
      );
    }

    const startTime = Date.now();
    const socket = dgram.createSocket('udp4');

    try {
      // Get local address
      const localAddress = await this.getLocalAddress(socket);

      // Test 1: Get mapped address from first STUN server
      const server1 = this.servers[0]!;
      const mapped1 = await this.getMappedAddress(socket, server1);

      if (!mapped1) {
        return {
          natType: 'public',
          publicIP: null,
          publicPort: null,
          localIP: localAddress.ip,
          localPort: localAddress.port,
          canDirectConnect: false,
          detectionTime: Date.now() - startTime,
        };
      }

      // If mapped address equals local address, no NAT
      if (mapped1.ip === localAddress.ip && mapped1.port === localAddress.port) {
        return {
          natType: 'public',
          publicIP: mapped1.ip,
          publicPort: mapped1.port,
          localIP: localAddress.ip,
          localPort: localAddress.port,
          canDirectConnect: true,
          detectionTime: Date.now() - startTime,
        };
      }

      // Test 2: Check if NAT mapping is consistent (Symmetric NAT test)
      let mapped2: { ip: string; port: number } | null = null;
      if (this.servers.length > 1) {
        mapped2 = await this.getMappedAddress(socket, this.servers[1]!);
      }

      // If different STUN servers return different mappings, it's symmetric NAT
      if (mapped2 && (mapped2.ip !== mapped1.ip || mapped2.port !== mapped1.port)) {
        return {
          natType: 'symmetric',
          publicIP: mapped1.ip,
          publicPort: mapped1.port,
          localIP: localAddress.ip,
          localPort: localAddress.port,
          canDirectConnect: false, // Symmetric NAT requires relay
          detectionTime: Date.now() - startTime,
        };
      }

      // For other NAT types, we assume they can do direct P2P with hole punching
      // Full cone, restricted cone, and port restricted can work with coordination
      return {
        natType: 'port_restricted', // Conservative assumption
        publicIP: mapped1.ip,
        publicPort: mapped1.port,
        localIP: localAddress.ip,
        localPort: localAddress.port,
        canDirectConnect: true, // May require hole punching
        detectionTime: Date.now() - startTime,
      };
    } finally {
      socket.close();
    }
  }

  /**
   * Get local IP and port
   */
  private getLocalAddress(socket: dgram.Socket): Promise<{ ip: string; port: number }> {
    return new Promise((resolve) => {
      socket.bind(() => {
        const address = socket.address();
        resolve({ ip: address.address, port: address.port });
      });
    });
  }

  /**
   * Get mapped address from STUN server
   */
  private getMappedAddress(
    socket: dgram.Socket,
    server: STUNServer
  ): Promise<{ ip: string; port: number } | null> {
    return new Promise((resolve) => {
      const transactionId = randomBytes(12);
      const request = this.createBindingRequest(transactionId);

      const timer = setTimeout(() => resolve(null), this.timeout);

      socket.on('message', (data) => {
        clearTimeout(timer);
        const mapped = this.parseBindingResponse(data, transactionId);
        resolve(mapped);
      });

      socket.send(request, server.port, server.host, (err) => {
        if (err) {
          clearTimeout(timer);
          resolve(null);
        }
      });
    });
  }

  /**
   * Create STUN Binding Request
   */
  private createBindingRequest(transactionId: Buffer): Buffer {
    const buffer = Buffer.alloc(20);

    // Message Type (Binding Request)
    buffer.writeUInt16BE(STUN_BINDING_REQUEST, 0);

    // Message Length (0 attributes)
    buffer.writeUInt16BE(0, 2);

    // Magic Cookie
    buffer.writeUInt32BE(STUN_MAGIC_COOKIE, 4);

    // Transaction ID
    transactionId.copy(buffer, 8);

    return buffer;
  }

  /**
   * Parse STUN Binding Response
   */
  private parseBindingResponse(
    data: Buffer,
    expectedTransactionId: Buffer
  ): { ip: string; port: number } | null {
    if (data.length < 20) return null;

    // Check message type
    const messageType = data.readUInt16BE(0);
    if (messageType !== STUN_BINDING_RESPONSE) return null;

    // Check magic cookie
    const magicCookie = data.readUInt32BE(4);
    if (magicCookie !== STUN_MAGIC_COOKIE) return null;

    // Check transaction ID
    const transactionId = data.subarray(8, 20);
    if (!transactionId.equals(expectedTransactionId)) return null;

    // Parse attributes
    let offset = 20;
    while (offset + 4 <= data.length) {
      const attrType = data.readUInt16BE(offset);
      const attrLength = data.readUInt16BE(offset + 2);

      if (offset + 4 + attrLength > data.length) break;

      // XOR-MAPPED-ADDRESS (preferred)
      if (attrType === STUN_ATTR_XOR_MAPPED_ADDRESS && attrLength >= 8) {
        const attrData = data.subarray(offset + 4, offset + 4 + attrLength);
        return this.parseXorMappedAddress(attrData, transactionId);
      }

      // MAPPED-ADDRESS (legacy)
      if (attrType === STUN_ATTR_MAPPED_ADDRESS && attrLength >= 8) {
        const attrData = data.subarray(offset + 4, offset + 4 + attrLength);
        return this.parseMappedAddress(attrData);
      }

      // Move to next attribute (with padding)
      offset += 4 + Math.ceil(attrLength / 4) * 4;
    }

    return null;
  }

  /**
   * Parse XOR-MAPPED-ADDRESS attribute
   */
  private parseXorMappedAddress(
    data: Buffer,
    _transactionId: Buffer
  ): { ip: string; port: number } | null {
    const family = data[1];
    const xport = data.readUInt16BE(2);
    const port = xport ^ (STUN_MAGIC_COOKIE >> 16);

    if (family === 0x01) {
      // IPv4
      const xip = data.subarray(4, 8);
      const magicCookieBuffer = Buffer.alloc(4);
      magicCookieBuffer.writeUInt32BE(STUN_MAGIC_COOKIE);
      const ip = [
        xip[0]! ^ magicCookieBuffer[0]!,
        xip[1]! ^ magicCookieBuffer[1]!,
        xip[2]! ^ magicCookieBuffer[2]!,
        xip[3]! ^ magicCookieBuffer[3]!,
      ].join('.');
      return { ip, port };
    }

    // IPv6 not supported in this implementation
    return null;
  }

  /**
   * Parse MAPPED-ADDRESS attribute (legacy)
   */
  private parseMappedAddress(data: Buffer): { ip: string; port: number } | null {
    const family = data[1];
    const port = data.readUInt16BE(2);

    if (family === 0x01) {
      // IPv4
      const ip = [data[4], data[5], data[6], data[7]].join('.');
      return { ip, port };
    }

    return null;
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Quick NAT detection with default servers
 */
export async function detectNAT(): Promise<STUNResult> {
  const client = new STUNClient();
  return client.detectNATType();
}

/**
 * Check if direct P2P is possible
 */
export async function canDirectP2P(): Promise<boolean> {
  const result = await detectNAT();
  return result.canDirectConnect;
}
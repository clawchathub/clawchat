import { describe, it, expect, beforeEach } from 'vitest';
import { STUNClient, type NATType } from '../src/nat/stun.js';

describe('STUNClient', () => {
  let client: STUNClient;

  beforeEach(() => {
    // Use mock server for unit tests
    client = new STUNClient([
      { host: 'stun.l.google.com', port: 19302 },
    ]);
  });

  describe('NAT type detection', () => {
    it('should have correct NAT type values', () => {
      const natTypes: NATType[] = [
        'public',
        'full_cone',
        'restricted_cone',
        'port_restricted',
        'symmetric',
      ];

      for (const type of natTypes) {
        expect(typeof type).toBe('string');
      }
    });

    it('should create STUN client with default servers', () => {
      const defaultClient = new STUNClient();
      expect(defaultClient).toBeDefined();
    });

    it('should create STUN client with custom servers', () => {
      const customClient = new STUNClient([
        { host: 'custom.stun.server', port: 3478 },
      ]);
      expect(customClient).toBeDefined();
    });
  });

  describe('STUN message building', () => {
    it('should create binding request buffer', () => {
      // Access private method via type assertion
      const createRequest = (client as any).createBindingRequest.bind(client);
      const transactionId = Buffer.alloc(12, 0x42);
      const request = createRequest(transactionId);

      expect(request).toBeInstanceOf(Buffer);
      expect(request.length).toBe(20);

      // Check message type (Binding Request = 0x0001)
      expect(request.readUInt16BE(0)).toBe(0x0001);

      // Check magic cookie
      expect(request.readUInt32BE(4)).toBe(0x2112A442);
    });
  });

  describe('response parsing', () => {
    it('should return null for invalid response', () => {
      const parseResponse = (client as any).parseBindingResponse.bind(client);
      const invalidData = Buffer.from('invalid');
      const transactionId = Buffer.alloc(12, 0x42);

      const result = parseResponse(invalidData, transactionId);
      expect(result).toBeNull();
    });

    it('should return null for short response', () => {
      const parseResponse = (client as any).parseBindingResponse.bind(client);
      const shortData = Buffer.alloc(10);
      const transactionId = Buffer.alloc(12, 0x42);

      const result = parseResponse(shortData, transactionId);
      expect(result).toBeNull();
    });
  });
});
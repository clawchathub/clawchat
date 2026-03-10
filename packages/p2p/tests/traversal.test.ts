import { describe, it, expect, beforeEach } from 'vitest';
import { NATTraversal, type ICECandidate } from '../src/nat/traversal.js';
import type { STUNResult } from '../src/nat/stun.js';

describe('NATTraversal', () => {
  let traversal: NATTraversal;

  beforeEach(() => {
    traversal = new NATTraversal();
  });

  describe('candidate generation', () => {
    it('should generate candidates from NAT info', () => {
      const natInfo: STUNResult = {
        natType: 'port_restricted',
        publicIP: '203.0.113.1',
        publicPort: 12345,
        localIP: '192.168.1.100',
        localPort: 54321,
        canDirectConnect: true,
        detectionTime: 100,
      };

      traversal.setLocalNATInfo(natInfo);
      const candidates = traversal.generateCandidates();

      expect(candidates.length).toBeGreaterThanOrEqual(1);

      // Host candidate should be present
      const hostCandidate = candidates.find((c) => c.type === 'host');
      expect(hostCandidate).toBeDefined();
      expect(hostCandidate?.ip).toBe('192.168.1.100');
      expect(hostCandidate?.port).toBe(54321);

      // SRFLX candidate should be present
      const srflxCandidate = candidates.find((c) => c.type === 'srflx');
      expect(srflxCandidate).toBeDefined();
      expect(srflxCandidate?.ip).toBe('203.0.113.1');
      expect(srflxCandidate?.port).toBe(12345);
    });

    it('should generate only host candidate without NAT info', () => {
      const candidates = traversal.generateCandidates();
      expect(candidates.length).toBe(0);
    });
  });

  describe('direct connection check', () => {
    it('should allow direct connection with public IP', () => {
      expect(traversal.canAttemptDirect('public', 'symmetric')).toBe(true);
      expect(traversal.canAttemptDirect('symmetric', 'public')).toBe(true);
    });

    it('should deny direct connection with symmetric on both sides', () => {
      expect(traversal.canAttemptDirect('symmetric', 'symmetric')).toBe(false);
    });

    it('should allow direct connection with cone NATs', () => {
      expect(traversal.canAttemptDirect('full_cone', 'port_restricted')).toBe(true);
      expect(traversal.canAttemptDirect('restricted_cone', 'full_cone')).toBe(true);
    });

    it('should deny direct with one symmetric NAT', () => {
      expect(traversal.canAttemptDirect('symmetric', 'full_cone')).toBe(false);
      expect(traversal.canAttemptDirect('restricted_cone', 'symmetric')).toBe(false);
    });
  });

  describe('path selection', () => {
    it('should select highest priority candidates', () => {
      const localCandidates: ICECandidate[] = [
        { type: 'srflx', ip: '203.0.113.1', port: 12345, priority: 100 },
        { type: 'host', ip: '192.168.1.100', port: 54321, priority: 126 },
      ];

      const remoteCandidates: ICECandidate[] = [
        { type: 'srflx', ip: '203.0.113.2', port: 12346, priority: 100 },
        { type: 'host', ip: '192.168.1.101', port: 54322, priority: 126 },
      ];

      const result = traversal.selectBestPath(localCandidates, remoteCandidates);

      expect(result).not.toBeNull();
      expect(result?.local.type).toBe('host');
      expect(result?.remote.type).toBe('host');
    });

    it('should return null with empty candidates', () => {
      const result = traversal.selectBestPath([], []);
      expect(result).toBeNull();
    });

    it('should prefer direct candidates over relay', () => {
      const localCandidates: ICECandidate[] = [
        { type: 'relay', ip: 'relay.example.com', port: 3478, priority: 50 },
        { type: 'host', ip: '192.168.1.100', port: 54321, priority: 126 },
      ];

      const remoteCandidates: ICECandidate[] = [
        { type: 'relay', ip: 'relay.example.com', port: 3478, priority: 50 },
      ];

      // Should skip direct and return null since remote only has relay
      const result = traversal.selectBestPath(localCandidates, remoteCandidates);
      expect(result).not.toBeNull();
      expect(result?.local.type).toBe('host');
    });
  });
});
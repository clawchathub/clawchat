import { describe, it, expect, beforeEach } from 'vitest';
import {
  BootstrapConfigManager,
  getBootstrapManager,
  DEFAULT_BOOTSTRAP_CONFIG,
  type BootstrapNode,
} from '../src/bootstrap/config.js';

describe('BootstrapConfigManager', () => {
  let manager: BootstrapConfigManager;

  beforeEach(() => {
    manager = new BootstrapConfigManager();
  });

  describe('node management', () => {
    it('should start with default nodes', () => {
      const nodes = manager.getNodes();
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('should add custom nodes', () => {
      const node: BootstrapNode = {
        publicKey: 'test-pubkey-001',
        endpoints: ['wss://test.example.com:18790'],
        reliability: 0.9,
        region: 'us-west',
      };

      manager.addNode(node);

      const nodes = manager.getNodes();
      const found = nodes.find((n) => n.publicKey === 'test-pubkey-001');

      expect(found).toBeDefined();
      expect(found?.endpoints).toContain('wss://test.example.com:18790');
    });

    it('should remove custom nodes', () => {
      const node: BootstrapNode = {
        publicKey: 'test-pubkey-002',
        endpoints: ['wss://test.example.com:18790'],
        reliability: 0.9,
      };

      manager.addNode(node);
      expect(manager.getNodes().find((n) => n.publicKey === 'test-pubkey-002')).toBeDefined();

      const removed = manager.removeNode('test-pubkey-002');
      expect(removed).toBe(true);
      expect(manager.getNodes().find((n) => n.publicKey === 'test-pubkey-002')).toBeUndefined();
    });
  });

  describe('reliability tracking', () => {
    it('should update reliability on success', () => {
      const node: BootstrapNode = {
        publicKey: 'test-pubkey-003',
        endpoints: ['wss://test.example.com:18790'],
        reliability: 0.5,
      };

      manager.addNode(node);

      // Simulate success
      manager.updateReliability('test-pubkey-003', true);

      const found = manager.getNodes().find((n) => n.publicKey === 'test-pubkey-003');
      expect(found?.reliability).toBeGreaterThan(0.5);
    });

    it('should update reliability on failure', () => {
      const node: BootstrapNode = {
        publicKey: 'test-pubkey-004',
        endpoints: ['wss://test.example.com:18790'],
        reliability: 0.9,
      };

      manager.addNode(node);

      // Simulate failure
      manager.updateReliability('test-pubkey-004', false);

      const found = manager.getNodes().find((n) => n.publicKey === 'test-pubkey-004');
      expect(found?.reliability).toBeLessThan(0.9);
    });
  });

  describe('sorting and filtering', () => {
    it('should return nodes sorted by reliability', () => {
      manager.addNode({
        publicKey: 'low-reliability',
        endpoints: ['wss://low.example.com'],
        reliability: 0.3,
      });

      manager.addNode({
        publicKey: 'high-reliability',
        endpoints: ['wss://high.example.com'],
        reliability: 0.99,
      });

      const sorted = manager.getNodesByReliability();
      expect(sorted[0]?.publicKey).toBe('high-reliability');
    });

    it('should filter nodes by region', () => {
      manager.addNode({
        publicKey: 'us-east-node',
        endpoints: ['wss://us-east.example.com'],
        reliability: 0.9,
        region: 'us-east',
      });

      manager.addNode({
        publicKey: 'eu-west-node',
        endpoints: ['wss://eu-west.example.com'],
        reliability: 0.9,
        region: 'eu-west',
      });

      const usNodes = manager.getNodesByRegion('us-east');
      expect(usNodes.length).toBe(1);
      expect(usNodes[0]?.publicKey).toBe('us-east-node');
    });
  });

  describe('persistence', () => {
    it('should export and import configuration', () => {
      manager.addNode({
        publicKey: 'persistent-node',
        endpoints: ['wss://persistent.example.com'],
        reliability: 0.85,
      });

      const exported = manager.export();
      expect(exported.customNodes.length).toBe(1);

      const newManager = new BootstrapConfigManager();
      newManager.import(exported);

      const nodes = newManager.getNodes();
      expect(nodes.find((n) => n.publicKey === 'persistent-node')).toBeDefined();
    });
  });

  describe('singleton', () => {
    it('should return singleton instance', () => {
      const instance1 = getBootstrapManager();
      const instance2 = getBootstrapManager();
      expect(instance1).toBe(instance2);
    });
  });
});

describe('DEFAULT_BOOTSTRAP_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_BOOTSTRAP_CONFIG.discoveryTimeout).toBe(30000);
    expect(DEFAULT_BOOTSTRAP_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_BOOTSTRAP_CONFIG.minNodes).toBe(1);
    expect(DEFAULT_BOOTSTRAP_CONFIG.refreshInterval).toBe(60 * 60 * 1000);
  });
});
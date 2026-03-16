import { describe, it, expect, beforeEach } from 'vitest';
import { KademliaNode } from '../src/kademlia/node.js';
import { generateNodeId } from '../src/kademlia/node.js';

describe('KademliaNode - Stop Tests', () => {
  let node: KademliaNode;

  beforeEach(() => {
    // Create a new node for each test
    node = new KademliaNode({
      nodeId: generateNodeId(),
      port: 0, // Use random available port
      address: '127.0.0.1',
    });
  });

  it('should clear all timers when stopped', async () => {
    await node.start();

    // Store some data to trigger maintenance tasks
    const key = generateNodeId();
    const value = new Uint8Array([1, 2, 3, 4]);
    await node.store(key, value);

    // Stop the node
    await node.stop();

    // Verify node is stopped
    expect(node['running']).toBe(false);

    // Verify timers are cleared
    expect(node['refreshTimer']).toBe(null);
    expect(node['cleanupTimer']).toBe(null);
    expect(node['replicateTimer']).toBe(null);
  });

  it('should clear storage when stopped', async () => {
    await node.start();

    // Store data directly via internal storage (bypass store() which needs other nodes)
    const key = generateNodeId();
    const keyHex = Buffer.from(key).toString('hex');
    const value = new Uint8Array([1, 2, 3, 4]);
    node['storage'].set(keyHex, {
      key,
      value,
      createdAt: Date.now(),
      publisherId: generateNodeId(),
    });

    // Verify storage has data
    expect(node.getStorageStats().count).toBeGreaterThan(0);

    // Stop the node
    await node.stop();

    // Verify storage is cleared
    expect(node.getStorageStats().count).toBe(0);
  });

  it('should be safe to call stop multiple times', async () => {
    await node.start();

    // First stop
    await node.stop();
    expect(node['running']).toBe(false);

    // Second stop should not throw
    await expect(node.stop()).resolves.not.toThrow();

    // Third stop
    await expect(node.stop()).resolves.not.toThrow();
  });

  it('should be safe to call stop when not started', async () => {
    // Node not started, stop should be safe
    await expect(node.stop()).resolves.not.toThrow();
    expect(node['running']).toBe(false);
  });

  it('should be safe to call stop while maintenance tasks are running', async () => {
    await node.start();

    // Store data to ensure maintenance tasks have work
    const key = generateNodeId();
    const value = new Uint8Array([1, 2, 3, 4]);
    await node.store(key, value);

    // Stop immediately while tasks might be running
    await node.stop();

    // All timers should be cleared
    expect(node['refreshTimer']).toBe(null);
    expect(node['cleanupTimer']).toBe(null);
    expect(node['replicateTimer']).toBe(null);
  });
});

import { KademliaNode } from '@clawchat/dht';
import * as crypto from 'crypto';

function generateNodeId(): Uint8Array {
  return crypto.randomBytes(20);
}

describe('DHT Basic E2E', () => {
  let node1: KademliaNode;
  let node2: KademliaNode;
  const port1 = 19100;
  const port2 = 19101;
  const id1 = generateNodeId();
  const id2 = generateNodeId();

  beforeAll(async () => {
    node1 = new KademliaNode({
      nodeId: id1,
      port: port1,
    });
    node2 = new KademliaNode({
      nodeId: id2,
      port: port2,
    });

    await node1.start();
    await node2.start();

    // Add node2 to node1's routing table so store can find it
    node1.addNode({ id: id2, address: '127.0.0.1', port: port2 });
  });

  afterAll(async () => {
    await node1.stop();
    await node2.stop();
  });

  it('should start two Kademlia nodes', () => {
    expect(node1.getNodeId()).toBe(id1);
    expect(node2.getNodeId()).toBe(id2);
  });

  it('should have node2 in node1 routing table', () => {
    const stats = node1.getRoutingTableStats();
    expect(stats.totalNodes).toBeGreaterThanOrEqual(1);
  });

  it('should have local storage stats', () => {
    const stats = node1.getStorageStats();
    expect(stats).toBeDefined();
    expect(typeof stats.count).toBe('number');
  });
});

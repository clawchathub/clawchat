/**
 * Kademlia DHT 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RoutingTable,
  calculateDistance,
  findBucketIndex,
  nodeIdEquals,
  nodeIdToHex,
  hexToNodeId,
  KademliaNode,
  generateNodeId,
  nodeIdFromPublicKey,
  PeerDiscovery
} from '../src/index.js';
import type { NodeID, NodeInfo, ClawPeerInfo } from '../src/index.js';

describe('路由表工具函数', () => {
  describe('nodeIdToHex / hexToNodeId', () => {
    it('应该正确转换NodeID到十六进制字符串', () => {
      const id = generateNodeId();
      const hex = nodeIdToHex(id);
      expect(hex).toHaveLength(40);
      expect(hex).toMatch(/^[0-9a-f]{40}$/);
    });

    it('应该正确从十六进制字符串创建NodeID', () => {
      const originalId = generateNodeId();
      const hex = nodeIdToHex(originalId);
      const recoveredId = hexToNodeId(hex);
      expect(nodeIdEquals(originalId, recoveredId)).toBe(true);
    });
  });

  describe('calculateDistance', () => {
    it('应该正确计算XOR距离', () => {
      const id1 = new Uint8Array(20).fill(0);
      const id2 = new Uint8Array(20).fill(0);
      id2[19] = 1; // 最后一个字节为1

      const distance = calculateDistance(id1, id2);
      expect(distance).toBe(BigInt(1));
    });

    it('相同ID的距离应为0', () => {
      const id = generateNodeId();
      const distance = calculateDistance(id, id);
      expect(distance).toBe(BigInt(0));
    });
  });

  describe('findBucketIndex', () => {
    it('距离为0时应返回bucket 0', () => {
      const index = findBucketIndex(BigInt(0));
      expect(index).toBe(0);
    });

    it('距离为1时应返回正确的bucket', () => {
      const index = findBucketIndex(BigInt(1));
      // 距离1的最高位在第160位(从右数),bucket索引为159
      expect(index).toBe(159);
    });
  });

  describe('nodeIdEquals', () => {
    it('相同ID应返回true', () => {
      const id = generateNodeId();
      expect(nodeIdEquals(id, id)).toBe(true);
    });

    it('不同ID应返回false', () => {
      const id1 = generateNodeId();
      const id2 = generateNodeId();
      expect(nodeIdEquals(id1, id2)).toBe(false);
    });

    it('不同长度的ID应返回false', () => {
      const id1 = new Uint8Array(20);
      const id2 = new Uint8Array(19);
      expect(nodeIdEquals(id1, id2)).toBe(false);
    });
  });
});

describe('RoutingTable', () => {
  let routingTable: RoutingTable;
  let localNodeId: NodeID;

  beforeEach(() => {
    localNodeId = generateNodeId();
    routingTable = new RoutingTable({
      localNodeId,
      k: 20
    });
  });

  describe('addNode', () => {
    it('应该成功添加节点', () => {
      const node: NodeInfo = {
        id: generateNodeId(),
        address: '127.0.0.1',
        port: 3000
      };

      const result = routingTable.addNode(node);
      expect(result).toBe(true);

      const found = routingTable.findNode(node.id);
      expect(found).toBeDefined();
      expect(found?.address).toBe('127.0.0.1');
    });

    it('更新已存在的节点', () => {
      const node: NodeInfo = {
        id: generateNodeId(),
        address: '127.0.0.1',
        port: 3000
      };

      routingTable.addNode(node);

      // 更新节点
      const updatedNode: NodeInfo = {
        ...node,
        port: 3001
      };

      const result = routingTable.addNode(updatedNode);
      expect(result).toBe(true);

      const found = routingTable.findNode(node.id);
      expect(found?.port).toBe(3001);
    });
  });

  describe('removeNode', () => {
    it('应该成功移除节点', () => {
      const node: NodeInfo = {
        id: generateNodeId(),
        address: '127.0.0.1',
        port: 3000
      };

      routingTable.addNode(node);
      const result = routingTable.removeNode(node.id);
      expect(result).toBe(true);

      const found = routingTable.findNode(node.id);
      expect(found).toBeUndefined();
    });

    it('移除不存在的节点应返回false', () => {
      const result = routingTable.removeNode(generateNodeId());
      expect(result).toBe(false);
    });
  });

  describe('findClosestNodes', () => {
    it('应该返回按距离排序的节点', () => {
      // 添加多个节点
      for (let i = 0; i < 10; i++) {
        const node: NodeInfo = {
          id: generateNodeId(),
          address: `127.0.0.${i}`,
          port: 3000 + i
        };
        routingTable.addNode(node);
      }

      const targetId = generateNodeId();
      const closest = routingTable.findClosestNodes(targetId, 5);

      expect(closest.length).toBeLessThanOrEqual(5);

      // 验证排序
      for (let i = 1; i < closest.length; i++) {
        const dist1 = calculateDistance(closest[i - 1].id, targetId);
        const dist2 = calculateDistance(closest[i].id, targetId);
        expect(dist1 <= dist2).toBe(true);
      }
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      for (let i = 0; i < 5; i++) {
        const node: NodeInfo = {
          id: generateNodeId(),
          address: `127.0.0.${i}`,
          port: 3000 + i
        };
        routingTable.addNode(node);
      }

      const stats = routingTable.getStats();
      expect(stats.totalNodes).toBe(5);
    });
  });
});

describe('KademliaNode', () => {
  describe('generateNodeId', () => {
    it('应该生成20字节的NodeID', () => {
      const id = generateNodeId();
      expect(id.length).toBe(20);
    });

    it('应该生成唯一的NodeID', () => {
      const id1 = generateNodeId();
      const id2 = generateNodeId();
      expect(nodeIdEquals(id1, id2)).toBe(false);
    });
  });

  describe('nodeIdFromPublicKey', () => {
    it('应该从公钥生成一致的NodeID', () => {
      const publicKey = new Uint8Array(32);
      crypto.getRandomValues(publicKey);

      const id1 = nodeIdFromPublicKey(publicKey);
      const id2 = nodeIdFromPublicKey(publicKey);

      expect(id1.length).toBe(20);
      expect(nodeIdEquals(id1, id2)).toBe(true);
    });
  });

  describe('节点生命周期', () => {
    let node: KademliaNode;

    beforeEach(() => {
      node = new KademliaNode({
        port: 0 // 使用随机端口
      });
    });

    afterEach(async () => {
      await node.stop();
    });

    it('应该成功启动和停止', async () => {
      await node.start();
      const nodeId = node.getNodeId();
      expect(nodeId.length).toBe(20);

      const nodeInfo = node.getNodeInfo();
      expect(nodeInfo.id.length).toBe(20);
      expect(nodeInfo.port).toBeGreaterThan(0);

      await node.stop();
    });

    it('应该返回路由表统计信息', async () => {
      await node.start();
      const stats = node.getRoutingTableStats();
      expect(stats).toHaveProperty('totalNodes');
      expect(stats).toHaveProperty('bucketCount');
    });

    it('应该返回存储统计信息', async () => {
      await node.start();
      const stats = node.getStorageStats();
      expect(stats).toHaveProperty('count');
      expect(stats).toHaveProperty('size');
    });
  });
});

describe('PeerDiscovery', () => {
  let discovery: PeerDiscovery;
  let localNodeId: NodeID;

  beforeEach(() => {
    localNodeId = generateNodeId();
    discovery = new PeerDiscovery({
      localNodeId,
      port: 0 // 随机端口
    });
  });

  afterEach(async () => {
    await discovery.stop();
  });

  describe('生命周期', () => {
    it('应该成功启动和停止', async () => {
      await discovery.start();
      expect(discovery.getLocalNodeId()).toBeDefined();

      await discovery.stop();
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', async () => {
      await discovery.start();
      const stats = discovery.getStats();

      expect(stats).toHaveProperty('routingTable');
      expect(stats).toHaveProperty('storage');
    });
  });

  describe('节点信息管理', () => {
    it('应该能获取本地节点ID', async () => {
      await discovery.start();
      const nodeId = discovery.getLocalNodeId();
      expect(nodeIdEquals(nodeId, localNodeId)).toBe(true);
    });

    it('应该能添加已知节点', async () => {
      await discovery.start();

      const node: NodeInfo = {
        id: generateNodeId(),
        address: '127.0.0.1',
        port: 3000
      };

      discovery.addKnownNode(node);
      // 不抛出错误即为成功
    });
  });
});

describe('节点信息序列化', () => {
  it('应该正确处理ClawPeerInfo', () => {
    const peerInfo: ClawPeerInfo = {
      nodeId: generateNodeId(),
      publicKey: new Uint8Array(32),
      wsAddress: 'ws://127.0.0.1:8080',
      tcpAddress: 'tcp://127.0.0.1:9000',
      capabilities: ['chat', 'file-transfer'],
      metadata: { version: '1.0.0' }
    };

    // 填充公钥
    crypto.getRandomValues(peerInfo.publicKey);

    // 验证结构
    expect(peerInfo.nodeId.length).toBe(20);
    expect(peerInfo.publicKey.length).toBe(32);
    expect(peerInfo.capabilities).toContain('chat');
  });
});

describe('距离计算和排序', () => {
  it('应该正确计算多个节点的距离', () => {
    const targetId = generateNodeId();
    const nodes: { id: NodeID; distance: bigint }[] = [];

    for (let i = 0; i < 10; i++) {
      const id = generateNodeId();
      nodes.push({
        id,
        distance: calculateDistance(targetId, id)
      });
    }

    // 按距离排序
    nodes.sort((a, b) => (a.distance < b.distance ? -1 : 1));

    // 验证排序正确
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].distance <= nodes[i].distance).toBe(true);
    }
  });
});
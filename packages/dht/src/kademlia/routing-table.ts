/**
 * Kademlia 路由表实现
 * 管理K-Bucket结构,实现节点查找和存储
 */

import type {
  NodeID,
  NodeInfo,
  KBucket,
  KBucketEntry,
  RoutingTableConfig
} from './types.js';

/** K值默认为20 */
const DEFAULT_K = 20;

/** 节点超时时间默认15分钟 */
const DEFAULT_TIMEOUT = 15 * 60 * 1000;

/** NodeID位数 (160位) */
const NODE_ID_BITS = 160;

/**
 * 计算两个节点ID之间的XOR距离
 * @param id1 第一个节点ID
 * @param id2 第二个节点ID
 * @returns XOR距离 (bigint)
 */
export function calculateDistance(id1: NodeID, id2: NodeID): bigint {
  if (id1.length !== id2.length) {
    throw new Error('节点ID长度不匹配');
  }

  let distance = BigInt(0);
  for (let i = 0; i < id1.length; i++) {
    distance = (distance << BigInt(8)) | BigInt(id1[i] ^ id2[i]);
  }
  return distance;
}

/**
 * 找到距离目标节点最近的bucket索引
 * @param distance XOR距离
 * @returns bucket索引 (0-159)
 */
export function findBucketIndex(distance: bigint): number {
  if (distance === BigInt(0)) {
    return 0;
  }

  // 找到最高位的位置
  let index = 0;
  let d = distance;
  while (d > BigInt(0)) {
    d = d >> BigInt(1);
    index++;
  }
  return NODE_ID_BITS - index;
}

/**
 * 将NodeID转换为bigint
 */
function nodeIdToBigInt(id: NodeID): bigint {
  let result = BigInt(0);
  for (let i = 0; i < id.length; i++) {
    result = (result << BigInt(8)) | BigInt(id[i]);
  }
  return result;
}

/**
 * 比较两个NodeID是否相等
 */
export function nodeIdEquals(id1: NodeID, id2: NodeID): boolean {
  if (id1.length !== id2.length) return false;
  for (let i = 0; i < id1.length; i++) {
    if (id1[i] !== id2[i]) return false;
  }
  return true;
}

/**
 * 将NodeID转换为十六进制字符串
 */
export function nodeIdToHex(id: NodeID): string {
  return Array.from(id)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 从十六进制字符串创建NodeID
 */
export function hexToNodeId(hex: string): NodeID {
  if (hex.length !== 40) {
    throw new Error('NodeID十六进制字符串必须为40个字符');
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Kademlia 路由表
 */
export class RoutingTable {
  private localNodeId: NodeID;
  private localNodeIdBigInt: bigint;
  private k: number;
  private timeout: number;
  private buckets: Map<number, KBucket> = new Map();

  constructor(config: RoutingTableConfig) {
    this.localNodeId = config.localNodeId;
    this.localNodeIdBigInt = nodeIdToBigInt(config.localNodeId);
    this.k = config.k ?? DEFAULT_K;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;

    // 初始化第一个bucket覆盖整个ID空间
    this.initializeBuckets();
  }

  /**
   * 初始化bucket结构
   */
  private initializeBuckets(): void {
    // 创建初始bucket
    this.buckets.set(0, {
      index: 0,
      entries: [],
      capacity: this.k,
      minDistance: BigInt(0),
      maxDistance: (BigInt(1) << BigInt(NODE_ID_BITS)) - BigInt(1)
    });
  }

  /**
   * 添加节点到路由表
   * @param node 要添加的节点
   * @returns 是否成功添加
   */
  addNode(node: NodeInfo): boolean {
    const distance = calculateDistance(this.localNodeId, node.id);
    const bucketIndex = findBucketIndex(distance);
    const bucket = this.getOrCreateBucket(bucketIndex);

    // 检查节点是否已存在
    const existingIndex = bucket.entries.findIndex(
      entry => nodeIdEquals(entry.node.id, node.id)
    );

    if (existingIndex >= 0) {
      // 更新现有条目
      bucket.entries[existingIndex] = {
        node,
        lastUpdated: Date.now(),
        verified: true
      };
      return true;
    }

    // 检查bucket是否已满
    if (bucket.entries.length < bucket.capacity) {
      bucket.entries.push({
        node,
        lastUpdated: Date.now(),
        verified: false
      });
      return true;
    }

    // Bucket已满,不添加(可以根据策略替换不活跃节点)
    return false;
  }

  /**
   * 从路由表移除节点
   * @param nodeId 要移除的节点ID
   * @returns 是否成功移除
   */
  removeNode(nodeId: NodeID): boolean {
    const distance = calculateDistance(this.localNodeId, nodeId);
    const bucketIndex = findBucketIndex(distance);
    const bucket = this.buckets.get(bucketIndex);

    if (!bucket) return false;

    const index = bucket.entries.findIndex(
      entry => nodeIdEquals(entry.node.id, nodeId)
    );

    if (index >= 0) {
      bucket.entries.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * 查找节点
   */
  findNode(nodeId: NodeID): NodeInfo | undefined {
    const distance = calculateDistance(this.localNodeId, nodeId);
    const bucketIndex = findBucketIndex(distance);
    const bucket = this.buckets.get(bucketIndex);

    if (!bucket) return undefined;

    const entry = bucket.entries.find(
      e => nodeIdEquals(e.node.id, nodeId)
    );

    return entry?.node;
  }

  /**
   * 查找距离目标最近的K个节点
   * @param targetId 目标节点ID
   * @param count 返回节点数量 (默认为K)
   * @returns 排序后的节点列表
   */
  findClosestNodes(targetId: NodeID, count: number = this.k): NodeInfo[] {
    const distance = calculateDistance(this.localNodeId, targetId);
    const centerBucketIndex = findBucketIndex(distance);

    const candidates: { node: NodeInfo; distance: bigint }[] = [];

    // 从中心bucket开始收集节点
    for (let i = 0; i < NODE_ID_BITS; i++) {
      // 先检查中心bucket,然后向两边扩展
      const bucketIndex = i === 0
        ? centerBucketIndex
        : (i % 2 === 0
            ? centerBucketIndex + Math.floor(i / 2)
            : centerBucketIndex - Math.floor(i / 2));

      if (bucketIndex < 0 || bucketIndex >= NODE_ID_BITS) continue;

      const bucket = this.buckets.get(bucketIndex);
      if (bucket) {
        for (const entry of bucket.entries) {
          const entryDistance = calculateDistance(entry.node.id, targetId);
          candidates.push({
            node: entry.node,
            distance: entryDistance
          });
        }
      }

      // 如果已收集足够多的节点,可以提前结束
      if (candidates.length >= count * 2) break;
    }

    // 按距离排序并返回前K个
    candidates.sort((a, b) => {
      if (a.distance < b.distance) return -1;
      if (a.distance > b.distance) return 1;
      return 0;
    });

    return candidates.slice(0, count).map(c => c.node);
  }

  /**
   * 获取或创建指定索引的bucket
   */
  private getOrCreateBucket(index: number): KBucket {
    let bucket = this.buckets.get(index);
    if (!bucket) {
      // 计算bucket的距离范围
      const minDistance = index === 0
        ? BigInt(0)
        : BigInt(1) << BigInt(NODE_ID_BITS - index);
      const maxDistance = index === NODE_ID_BITS - 1
        ? (BigInt(1) << BigInt(NODE_ID_BITS)) - BigInt(1)
        : (BigInt(1) << BigInt(NODE_ID_BITS - index - 1)) - BigInt(1);

      bucket = {
        index,
        entries: [],
        capacity: this.k,
        minDistance,
        maxDistance
      };
      this.buckets.set(index, bucket);
    }
    return bucket;
  }

  /**
   * 更新节点的最后活跃时间
   */
  updateNodeLastSeen(nodeId: NodeID): boolean {
    const distance = calculateDistance(this.localNodeId, nodeId);
    const bucketIndex = findBucketIndex(distance);
    const bucket = this.buckets.get(bucketIndex);

    if (!bucket) return false;

    const entry = bucket.entries.find(
      e => nodeIdEquals(e.node.id, nodeId)
    );

    if (entry) {
      entry.lastUpdated = Date.now();
      entry.verified = true;
      return true;
    }

    return false;
  }

  /**
   * 清理过期节点
   */
  removeStaleNodes(): number {
    const now = Date.now();
    let removed = 0;

    for (const bucket of this.buckets.values()) {
      const initialLength = bucket.entries.length;
      bucket.entries = bucket.entries.filter(entry => {
        return now - entry.lastUpdated < this.timeout;
      });
      removed += initialLength - bucket.entries.length;
    }

    return removed;
  }

  /**
   * 获取路由表中所有节点
   */
  getAllNodes(): NodeInfo[] {
    const nodes: NodeInfo[] = [];
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket.entries) {
        nodes.push(entry.node);
      }
    }
    return nodes;
  }

  /**
   * 获取路由表统计信息
   */
  getStats(): {
    totalNodes: number;
    bucketCount: number;
    buckets: { index: number; count: number }[];
  } {
    const buckets = Array.from(this.buckets.entries())
      .filter(([_, bucket]) => bucket.entries.length > 0)
      .map(([index, bucket]) => ({
        index,
        count: bucket.entries.length
      }));

    return {
      totalNodes: this.getAllNodes().length,
      bucketCount: this.buckets.size,
      buckets
    };
  }

  /**
   * 获取本地节点ID
   */
  getLocalNodeId(): NodeID {
    return this.localNodeId;
  }

  /**
   * 获取K值
   */
  getK(): number {
    return this.k;
  }
}
/**
 * 对等节点发现服务
 * 通过DHT查找和存储Claw节点信息
 */

import * as crypto from 'crypto';
import type {
  NodeID,
  NodeInfo,
  ClawPeerInfo,
  PeerDiscoveryConfig
} from '../kademlia/types.js';
import { KademliaNode, nodeIdFromPublicKey } from '../kademlia/node.js';
import { nodeIdToHex, hexToNodeId } from '../kademlia/routing-table.js';

/** Claw节点信息的键前缀 */
const CLAW_PEER_PREFIX = 'claw:peer:';

/** 默认Bootstrap节点 (可以配置) */
const DEFAULT_BOOTSTRAP_NODES: NodeInfo[] = [];

/**
 * 简单日志记录器
 */
interface Logger {
  info: (msg: string) => void;
  debug: (msg: string) => void;
  error: (msg: string) => void;
  warn: (msg: string) => void;
}

/**
 * 对等节点发现服务
 */
export class PeerDiscovery {
  private dht: KademliaNode;
  private localPeerInfo?: ClawPeerInfo;
  private logger: Logger;
  private bootstrapNodes: NodeInfo[];
  private running: boolean = false;

  constructor(config: PeerDiscoveryConfig & { logger?: Logger }) {
    this.logger = config.logger ?? {
      info: (msg: string) => console.log(`[PeerDiscovery] ${msg}`),
      debug: (msg: string) => console.debug(`[PeerDiscovery] ${msg}`),
      error: (msg: string) => console.error(`[PeerDiscovery] ${msg}`),
      warn: (msg: string) => console.warn(`[PeerDiscovery] ${msg}`)
    };
    this.bootstrapNodes = config.bootstrapNodes ?? DEFAULT_BOOTSTRAP_NODES;

    // 创建Kademlia节点 (传递 logger)
    this.dht = new KademliaNode({
      nodeId: config.localNodeId,
      port: config.port,
      k: config.k,
      alpha: config.alpha,
      bootstrapNodes: this.bootstrapNodes,
      logger: this.logger
    });
  }

  /**
   * 启动发现服务
   */
  async start(peerInfo?: ClawPeerInfo): Promise<void> {
    if (this.running) return;

    await this.dht.start();
    this.running = true;

    // 如果提供了本地节点信息,将其发布到DHT
    if (peerInfo) {
      this.localPeerInfo = peerInfo;
      await this.announce(peerInfo);
    }

    this.logger.info(`对等节点发现服务已启动`);
  }

  /**
   * 停止发现服务
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    await this.dht.stop();
    this.logger.info(`对等节点发现服务已停止`);
  }

  /**
   * 宣布本节点到DHT
   * @param peerInfo 节点信息
   */
  async announce(peerInfo: ClawPeerInfo): Promise<void> {
    // 使用公钥生成存储键
    const key = this.getPeerKey(peerInfo.nodeId);

    // 序列化节点信息
    const value = this.serializePeerInfo(peerInfo);

    // 存储到DHT
    const success = await this.dht.store(key, value, 3600); // 1小时TTL

    if (success) {
      this.logger.debug(`节点信息已发布到DHT nodeId=${nodeIdToHex(peerInfo.nodeId)}`);
    } else {
      this.logger.warn(`节点信息发布失败`);
    }
  }

  /**
   * 查找节点
   * @param nodeId 要查找的节点ID
   * @returns 节点信息,如果未找到则返回undefined
   */
  async findPeer(nodeId: NodeID): Promise<ClawPeerInfo | undefined> {
    const key = this.getPeerKey(nodeId);
    const value = await this.dht.findValue(key);

    if (!value) {
      this.logger.debug(`未找到节点 nodeId=${nodeIdToHex(nodeId)}`);
      return undefined;
    }

    try {
      const peerInfo = this.deserializePeerInfo(value);
      this.logger.debug(`找到节点 nodeId=${nodeIdToHex(nodeId)}`);
      return peerInfo;
    } catch (error) {
      this.logger.error(`解析节点信息失败: ${error}`);
      return undefined;
    }
  }

  /**
   * 查找最近的节点
   * @param limit 返回数量限制
   * @returns 节点信息列表
   */
  async findClosestPeers(limit: number = 20): Promise<ClawPeerInfo[]> {
    // 使用本地节点ID进行查找
    const localId = this.dht.getNodeId();
    const nodes = await this.dht.lookupNode(localId);

    const peers: ClawPeerInfo[] = [];

    for (const node of nodes.slice(0, limit)) {
      // 尝试从DHT获取详细节点信息
      const peerInfo = await this.findPeer(node.id);
      if (peerInfo) {
        peers.push(peerInfo);
      }
    }

    return peers;
  }

  /**
   * 通过公钥查找节点
   * @param publicKey 公钥
   * @returns 节点信息
   */
  async findPeerByPublicKey(publicKey: Uint8Array): Promise<ClawPeerInfo | undefined> {
    const nodeId = nodeIdFromPublicKey(publicKey);
    return this.findPeer(nodeId);
  }

  /**
   * 发现特定能力的节点
   * @param capability 能力标识
   * @param limit 返回数量限制
   * @returns 具有该能力的节点列表
   */
  async discoverByCapability(capability: string, limit: number = 10): Promise<ClawPeerInfo[]> {
    // 使用能力标识作为键
    const key = this.getCapabilityKey(capability);
    const value = await this.dht.findValue(key);

    if (!value) {
      return [];
    }

    try {
      // 解析节点ID列表
      const nodeIds = JSON.parse(new TextDecoder().decode(value)) as string[];
      const peers: ClawPeerInfo[] = [];

      for (const idHex of nodeIds.slice(0, limit)) {
        const nodeId = hexToNodeId(idHex);
        const peerInfo = await this.findPeer(nodeId);
        if (peerInfo) {
          peers.push(peerInfo);
        }
      }

      return peers;
    } catch (error) {
      this.logger.error(`解析能力索引失败: ${error}`);
      return [];
    }
  }

  /**
   * 注册节点能力
   * @param capability 能力标识
   */
  async registerCapability(capability: string): Promise<void> {
    if (!this.localPeerInfo) {
      this.logger.warn('无法注册能力:本地节点信息未设置');
      return;
    }

    const key = this.getCapabilityKey(capability);
    const localIdHex = nodeIdToHex(this.localPeerInfo.nodeId);

    // 获取现有的节点列表
    let nodeIds: string[] = [];
    const existing = await this.dht.findValue(key);

    if (existing) {
      try {
        nodeIds = JSON.parse(new TextDecoder().decode(existing)) as string[];
      } catch {
        nodeIds = [];
      }
    }

    // 添加本地节点ID (如果不存在)
    if (!nodeIds.includes(localIdHex)) {
      nodeIds.push(localIdHex);

      // 限制列表大小
      if (nodeIds.length > 100) {
        nodeIds = nodeIds.slice(-100);
      }

      // 存储更新后的列表
      const value = new TextEncoder().encode(JSON.stringify(nodeIds));
      await this.dht.store(key, value, 3600);
    }
  }

  /**
   * 获取DHT节点
   */
  getDHT(): KademliaNode {
    return this.dht;
  }

  /**
   * 获取本地节点ID
   */
  getLocalNodeId(): NodeID {
    return this.dht.getNodeId();
  }

  /**
   * 获取本地节点信息
   */
  getLocalPeerInfo(): ClawPeerInfo | undefined {
    return this.localPeerInfo;
  }

  /**
   * 获取路由表统计信息
   */
  getStats(): {
    routingTable: ReturnType<KademliaNode['getRoutingTableStats']>;
    storage: ReturnType<KademliaNode['getStorageStats']>;
  } {
    return {
      routingTable: this.dht.getRoutingTableStats(),
      storage: this.dht.getStorageStats()
    };
  }

  /**
   * 添加已知节点
   */
  addKnownNode(node: NodeInfo): void {
    this.dht.addNode(node);
  }

  // ============== 私有方法 ==============

  /**
   * 生成节点存储键
   */
  private getPeerKey(nodeId: NodeID): NodeID {
    // 将前缀和节点ID组合
    const prefix = new TextEncoder().encode(CLAW_PEER_PREFIX);

    // 使用简单哈希生成20字节的键
    const combined = new Uint8Array(prefix.length + nodeId.length);
    combined.set(prefix);
    combined.set(nodeId, prefix.length);

    // SHA-256哈希后取前20字节
    const hash = crypto.createHash('sha256').update(combined).digest();
    return new Uint8Array(hash.slice(0, 20));
  }

  /**
   * 生成能力存储键
   */
  private getCapabilityKey(capability: string): NodeID {
    const data = new TextEncoder().encode(`claw:capability:${capability}`);
    const hash = crypto.createHash('sha256').update(data).digest();
    return new Uint8Array(hash.slice(0, 20));
  }

  /**
   * 序列化节点信息
   */
  private serializePeerInfo(peerInfo: ClawPeerInfo): Uint8Array {
    const obj = {
      nodeId: nodeIdToHex(peerInfo.nodeId),
      publicKey: Buffer.from(peerInfo.publicKey).toString('base64'),
      wsAddress: peerInfo.wsAddress,
      tcpAddress: peerInfo.tcpAddress,
      capabilities: peerInfo.capabilities,
      metadata: peerInfo.metadata
    };

    return new TextEncoder().encode(JSON.stringify(obj));
  }

  /**
   * 反序列化节点信息
   */
  private deserializePeerInfo(data: Uint8Array): ClawPeerInfo {
    const obj = JSON.parse(new TextDecoder().decode(data));

    return {
      nodeId: hexToNodeId(obj.nodeId),
      publicKey: new Uint8Array(Buffer.from(obj.publicKey, 'base64')),
      wsAddress: obj.wsAddress,
      tcpAddress: obj.tcpAddress,
      capabilities: obj.capabilities,
      metadata: obj.metadata
    };
  }
}
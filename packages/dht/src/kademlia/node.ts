/**
 * Kademlia 节点实现
 * 实现完整的Kademlia DHT协议
 */

import * as crypto from 'crypto';
import type {
  NodeID,
  NodeInfo,
  DHTEntry,
  KademliaNodeConfig
} from './types.js';
import { RPCMessageType } from './types.js';
import { RoutingTable, calculateDistance, nodeIdEquals, nodeIdToHex } from './routing-table.js';
import { KademliaRPC } from './rpc.js';

/** 默认K值 */
const DEFAULT_K = 20;

/** 默认Alpha值 (并发查询数) */
const DEFAULT_ALPHA = 3;

/** 默认存储过期时间 (24小时) */
const DEFAULT_TTL = 24 * 60 * 60;

/**
 * 生成随机节点ID (20字节)
 */
export function generateNodeId(): NodeID {
  const id = new Uint8Array(20);
  crypto.getRandomValues(id);
  return id;
}

/**
 * 从公钥生成节点ID
 * 使用SHA-256哈希公钥,然后取前20字节
 */
export function nodeIdFromPublicKey(publicKey: Uint8Array): NodeID {
  const hash = crypto.createHash('sha256').update(publicKey).digest();
  return new Uint8Array(hash.slice(0, 20));
}

/**
 * 查找状态
 */
interface LookupState {
  targetId: NodeID;
  contacted: Set<string>;
  pending: Set<string>;
  closest: { node: NodeInfo; distance: bigint }[];
  alpha: number;
}

/**
 * Kademlia 节点
 */
export class KademliaNode {
  private nodeId: NodeID;
  private publicKey?: Uint8Array;
  private routingTable: RoutingTable;
  private rpc: KademliaRPC;
  private storage: Map<string, DHTEntry> = new Map();
  private alpha: number;
  private bootstrapNodes: NodeInfo[];
  private running: boolean = false;

  constructor(config: KademliaNodeConfig) {
    // 生成或使用提供的节点ID
    if (config.nodeId) {
      this.nodeId = config.nodeId;
    } else {
      this.nodeId = generateNodeId();
    }

    this.alpha = config.alpha ?? DEFAULT_ALPHA;
    this.bootstrapNodes = config.bootstrapNodes ?? [];

    // 初始化路由表
    this.routingTable = new RoutingTable({
      localNodeId: this.nodeId,
      k: config.k ?? DEFAULT_K
    });

    // 初始化RPC
    this.rpc = new KademliaRPC(this.nodeId, {
      port: config.port,
      address: config.address
    });

    // 注册RPC处理器
    this.setupRPCHandlers();
  }

  /**
   * 简单日志方法
   */
  private log(level: string, msg: string): void {
    console.log(`[KademliaNode][${level}] ${msg}`);
  }

  /**
   * 设置RPC消息处理器
   */
  private setupRPCHandlers(): void {
    // 处理PING请求
    this.rpc.on(RPCMessageType.PING, async (message, sender) => {
      this.log('debug', `收到PING from ${nodeIdToHex(sender.id)}`);
      // 更新路由表
      this.routingTable.addNode(sender);
      return this.rpc.createPong(message.messageId);
    });

    // 处理FIND_NODE请求
    this.rpc.on(RPCMessageType.FIND_NODE, async (message, sender) => {
      this.log('debug', `收到FIND_NODE from ${nodeIdToHex(sender.id)}`);
      // 更新路由表
      this.routingTable.addNode(sender);

      // 查找距离目标最近的节点
      const targetId = (message as { targetId: NodeID }).targetId;
      const nodes = this.routingTable.findClosestNodes(targetId);

      return this.rpc.createFindNodeResponse(message.messageId, nodes);
    });

    // 处理FIND_VALUE请求
    this.rpc.on(RPCMessageType.FIND_VALUE, async (message, sender) => {
      this.log('debug', `收到FIND_VALUE from ${nodeIdToHex(sender.id)}`);
      // 更新路由表
      this.routingTable.addNode(sender);

      const key = (message as { key: NodeID }).key;
      const keyHex = nodeIdToHex(key);

      // 检查本地存储
      const entry = this.storage.get(keyHex);
      if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) {
        return this.rpc.createFindValueResponse(message.messageId, entry.value);
      }

      // 未找到值,返回更近的节点
      const nodes = this.routingTable.findClosestNodes(key);
      return this.rpc.createFindValueResponse(message.messageId, nodes);
    });

    // 处理STORE请求
    this.rpc.on(RPCMessageType.STORE, async (message, sender) => {
      this.log('debug', `收到STORE from ${nodeIdToHex(sender.id)}`);
      // 更新路由表
      this.routingTable.addNode(sender);

      const storeMsg = message as { key: NodeID; value: Uint8Array; ttl?: number };
      const keyHex = nodeIdToHex(storeMsg.key);

      // 存储值
      this.storage.set(keyHex, {
        key: storeMsg.key,
        value: storeMsg.value,
        expiresAt: storeMsg.ttl ? Date.now() + storeMsg.ttl * 1000 : undefined,
        createdAt: Date.now(),
        publisherId: sender.id
      });

      return this.rpc.createStoreResponse(message.messageId, true);
    });
  }

  /**
   * 启动节点
   */
  async start(): Promise<void> {
    if (this.running) return;

    await this.rpc.start();
    this.running = true;
    this.log('info', `Kademlia节点已启动: ${nodeIdToHex(this.nodeId)}`);

    // 连接Bootstrap节点
    if (this.bootstrapNodes.length > 0) {
      await this.bootstrap();
    }

    // 启动周期性任务
    this.startMaintenanceTasks();
  }

  /**
   * 停止节点
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    await this.rpc.stop();
    this.log('info', 'Kademlia节点已停止');
  }

  /**
   * Bootstrap过程 - 加入DHT网络
   */
  async bootstrap(): Promise<void> {
    this.log('info', '开始Bootstrap过程...');

    // 尝试连接Bootstrap节点
    for (const bootstrap of this.bootstrapNodes) {
      try {
        const isAlive = await this.rpc.ping(bootstrap);
        if (isAlive) {
          this.routingTable.addNode(bootstrap);
          this.log('debug', `Bootstrap节点已连接: ${nodeIdToHex(bootstrap.id)}`);
        }
      } catch (error) {
        this.log('warn', `连接Bootstrap节点失败: ${error}`);
      }
    }

    // 执行自查找以填充路由表
    await this.lookupNode(this.nodeId);

    this.log('info', 'Bootstrap完成');
  }

  /**
   * 查找节点
   * @param targetId 目标节点ID
   * @returns 找到的节点列表
   */
  async lookupNode(targetId: NodeID): Promise<NodeInfo[]> {
    const state: LookupState = {
      targetId,
      contacted: new Set(),
      pending: new Set(),
      closest: [],
      alpha: this.alpha
    };

    // 从路由表获取初始节点
    const initialNodes = this.routingTable.findClosestNodes(targetId);
    for (const node of initialNodes) {
      const key = nodeIdToHex(node.id);
      state.closest.push({
        node,
        distance: calculateDistance(targetId, node.id)
      });
    }

    // 排序
    state.closest.sort((a, b) => (a.distance < b.distance ? -1 : 1));

    // 迭代查找
    await this.iterativeLookup(state);

    return state.closest.map(c => c.node);
  }

  /**
   * 迭代查找过程
   */
  private async iterativeLookup(state: LookupState): Promise<void> {
    while (true) {
      // 找出未联系过的最近的alpha个节点
      const toContact: NodeInfo[] = [];
      for (const entry of state.closest) {
        const key = nodeIdToHex(entry.node.id);
        if (!state.contacted.has(key) && !state.pending.has(key)) {
          toContact.push(entry.node);
          if (toContact.length >= state.alpha) break;
        }
      }

      if (toContact.length === 0 && state.pending.size === 0) {
        // 查找完成
        break;
      }

      // 并发发送请求
      const promises: Promise<void>[] = [];

      for (const node of toContact) {
        const key = nodeIdToHex(node.id);
        state.pending.add(key);

        promises.push(
          (async () => {
            try {
              const nodes = await this.rpc.findNode(state.targetId, node);
              state.contacted.add(key);

              // 添加新发现的节点
              for (const newNode of nodes) {
                if (!nodeIdEquals(newNode.id, this.nodeId)) {
                  this.routingTable.addNode(newNode);

                  const distance = calculateDistance(state.targetId, newNode.id);
                  const newEntry = { node: newNode, distance };

                  // 检查是否需要更新closest列表
                  const existingIndex = state.closest.findIndex(
                    c => nodeIdEquals(c.node.id, newNode.id)
                  );

                  if (existingIndex < 0) {
                    state.closest.push(newEntry);
                  }
                }
              }

              // 重新排序
              state.closest.sort((a, b) => (a.distance < b.distance ? -1 : 1));

              // 保持最多K个结果
              if (state.closest.length > this.routingTable.getK()) {
                state.closest = state.closest.slice(0, this.routingTable.getK());
              }
            } catch (error) {
              this.log('debug', `FIND_NODE请求失败: ${key} - ${error}`);
            } finally {
              state.pending.delete(key);
            }
          })()
        );
      }

      await Promise.all(promises);
    }
  }

  /**
   * 存储值到DHT
   * @param key 键
   * @param value 值
   * @param ttl 过期时间(秒)
   */
  async store(key: NodeID, value: Uint8Array, ttl?: number): Promise<boolean> {
    // 找到距离key最近的k个节点
    const nodes = await this.lookupNode(key);

    if (nodes.length === 0) {
      this.log('warn', '没有可用节点来存储数据');
      return false;
    }

    // 向这些节点发送STORE请求
    const storeTtl = ttl ?? DEFAULT_TTL;
    let successCount = 0;

    const promises = nodes.map(async (node) => {
      try {
        const success = await this.rpc.store(key, value, node, storeTtl);
        if (success) {
          successCount++;
          this.routingTable.addNode(node);
        }
        return success;
      } catch (error) {
        this.log('debug', `STORE请求失败: ${error}`);
        return false;
      }
    });

    await Promise.all(promises);

    // 大多数节点成功即认为成功
    return successCount >= Math.ceil(nodes.length / 2);
  }

  /**
   * 从DHT查找值
   * @param key 键
   * @returns 找到的值,或undefined
   */
  async findValue(key: NodeID): Promise<Uint8Array | undefined> {
    const state: LookupState = {
      targetId: key,
      contacted: new Set(),
      pending: new Set(),
      closest: [],
      alpha: this.alpha
    };

    // 从路由表获取初始节点
    const initialNodes = this.routingTable.findClosestNodes(key);
    for (const node of initialNodes) {
      state.closest.push({
        node,
        distance: calculateDistance(key, node.id)
      });
    }

    state.closest.sort((a, b) => (a.distance < b.distance ? -1 : 1));

    // 迭代查找
    while (true) {
      // 找出未联系过的最近的alpha个节点
      const toContact: NodeInfo[] = [];
      for (const entry of state.closest) {
        const keyHex = nodeIdToHex(entry.node.id);
        if (!state.contacted.has(keyHex) && !state.pending.has(keyHex)) {
          toContact.push(entry.node);
          if (toContact.length >= state.alpha) break;
        }
      }

      if (toContact.length === 0 && state.pending.size === 0) {
        // 未找到值
        break;
      }

      // 并发发送FIND_VALUE请求
      const promises: Promise<Uint8Array | NodeInfo[] | null>[] = [];

      for (const node of toContact) {
        const keyHex = nodeIdToHex(node.id);
        state.pending.add(keyHex);

        promises.push(
          (async () => {
            try {
              const result = await this.rpc.findValue(key, node);
              state.contacted.add(keyHex);
              this.routingTable.addNode(node);

              if (result.value) {
                return result.value;
              }

              if (result.nodes) {
                // 添加新发现的节点
                for (const newNode of result.nodes) {
                  if (!nodeIdEquals(newNode.id, this.nodeId)) {
                    this.routingTable.addNode(newNode);
                    const distance = calculateDistance(key, newNode.id);
                    const newEntry = { node: newNode, distance };

                    const existingIndex = state.closest.findIndex(
                      c => nodeIdEquals(c.node.id, newNode.id)
                    );

                    if (existingIndex < 0) {
                      state.closest.push(newEntry);
                    }
                  }
                }

                state.closest.sort((a, b) => (a.distance < b.distance ? -1 : 1));
                if (state.closest.length > this.routingTable.getK()) {
                  state.closest = state.closest.slice(0, this.routingTable.getK());
                }
              }

              return null;
            } catch (error) {
              this.log('debug', `FIND_VALUE请求失败: ${error}`);
              return null;
            } finally {
              state.pending.delete(keyHex);
            }
          })()
        );
      }

      const results = await Promise.all(promises);

      // 检查是否找到了值
      for (const result of results) {
        if (result instanceof Uint8Array) {
          return result;
        }
      }
    }

    return undefined;
  }

  /**
   * 启动维护任务
   */
  private startMaintenanceTasks(): void {
    // 定期刷新bucket
    setInterval(() => {
      this.refreshBuckets();
    }, 60 * 60 * 1000); // 每小时

    // 定期清理过期数据
    setInterval(() => {
      this.cleanupStorage();
    }, 30 * 60 * 1000); // 每30分钟

    // 定期重新发布数据
    setInterval(() => {
      this.replicateData();
    }, 60 * 60 * 1000); // 每小时
  }

  /**
   * 刷新bucket
   */
  private async refreshBuckets(): Promise<void> {
    this.log('debug', '刷新路由表bucket');

    // 清理过期节点
    const removed = this.routingTable.removeStaleNodes();
    this.log('debug', `清理过期节点: ${removed}个`);

    // 对空的bucket进行刷新查找
    // 简化实现:随机生成ID进行查找
    const randomId = generateNodeId();
    await this.lookupNode(randomId);
  }

  /**
   * 清理过期存储数据
   */
  private cleanupStorage(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.storage.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.storage.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.log('debug', `清理过期存储数据: ${removed}个`);
    }
  }

  /**
   * 重新发布数据
   */
  private async replicateData(): Promise<void> {
    this.log('debug', '重新发布存储数据');

    for (const entry of this.storage.values()) {
      // 跳过即将过期的数据
      if (entry.expiresAt && entry.expiresAt < Date.now() + 3600000) {
        continue;
      }

      // 重新存储
      await this.store(entry.key, entry.value);
    }
  }

  /**
   * 获取节点ID
   */
  getNodeId(): NodeID {
    return this.nodeId;
  }

  /**
   * 获取节点信息
   */
  getNodeInfo(): NodeInfo {
    return {
      id: this.nodeId,
      address: this.rpc.getAddress(),
      port: this.rpc.getPort(),
      publicKey: this.publicKey
    };
  }

  /**
   * 获取路由表统计信息
   */
  getRoutingTableStats(): ReturnType<RoutingTable['getStats']> {
    return this.routingTable.getStats();
  }

  /**
   * 获取存储统计信息
   */
  getStorageStats(): { count: number; size: number } {
    let size = 0;
    for (const entry of this.storage.values()) {
      size += entry.value.length;
    }
    return {
      count: this.storage.size,
      size
    };
  }

  /**
   * 设置公钥
   */
  setPublicKey(publicKey: Uint8Array): void {
    this.publicKey = publicKey;
  }

  /**
   * 手动添加节点到路由表
   */
  addNode(node: NodeInfo): void {
    this.routingTable.addNode(node);
  }
}
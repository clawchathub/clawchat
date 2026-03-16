/**
 * Kademlia DHT 类型定义
 * 实现 Kademlia 分布式哈希表协议的核心类型
 */

/**
 * 节点ID - 160位(20字节)标识符
 * 用于在DHT网络中唯一标识节点
 */
export type NodeID = Uint8Array; // 20 bytes = 160 bits

/**
 * 节点信息
 * 包含节点ID和网络地址
 */
export interface NodeInfo {
  /** 节点ID (20字节) */
  id: NodeID;
  /** IP地址 */
  address: string;
  /** UDP端口 */
  port: number;
  /** 公钥 (可选,用于验证) */
  publicKey?: Uint8Array;
  /** 最后活跃时间戳 */
  lastSeen?: number;
}

/**
 * K-Bucket 配置
 */
export interface KBucketConfig {
  /** 每个bucket最大节点数 (通常为20) */
  k: number;
  /** 节点刷新间隔(毫秒) */
  refreshInterval?: number;
}

/**
 * K-Bucket 条目
 */
export interface KBucketEntry {
  /** 节点信息 */
  node: NodeInfo;
  /** 最后更新时间 */
  lastUpdated: number;
  /** 是否已验证 */
  verified: boolean;
}

/**
 * K-Bucket 结构
 * 存储距离在某个范围内的节点
 */
export interface KBucket {
  /** bucket索引 (0-159) */
  index: number;
  /** bucket中的节点列表 */
  entries: KBucketEntry[];
  /** 最大容量 */
  capacity: number;
  /** 最小距离范围 */
  minDistance: bigint;
  /** 最大距离范围 */
  maxDistance: bigint;
}

/**
 * 路由表配置
 */
export interface RoutingTableConfig {
  /** 本节点ID */
  localNodeId: NodeID;
  /** K值 (bucket容量,默认20) */
  k?: number;
  /** 节点超时时间(毫秒,默认15分钟) */
  timeout?: number;
}

/**
 * RPC 消息类型
 */
export enum RPCMessageType {
  /** Ping请求 - 检查节点是否在线 */
  PING = 'PING',
  /** Pong响应 - Ping的响应 */
  PONG = 'PONG',
  /** 查找节点请求 */
  FIND_NODE = 'FIND_NODE',
  /** 查找节点响应 */
  FIND_NODE_RESPONSE = 'FIND_NODE_RESPONSE',
  /** 查找值请求 */
  FIND_VALUE = 'FIND_VALUE',
  /** 查找值响应 - 找到值 */
  FIND_VALUE_RESPONSE = 'FIND_VALUE_RESPONSE',
  /** 存储请求 */
  STORE = 'STORE',
  /** 存储响应 */
  STORE_RESPONSE = 'STORE_RESPONSE',
  /** 错误响应 */
  ERROR = 'ERROR'
}

/**
 * RPC 消息基础结构
 */
export interface RPCMessage {
  /** 消息类型 */
  type: RPCMessageType;
  /** 消息ID (用于匹配请求和响应) */
  messageId: string;
  /** 发送方节点ID */
  senderId: NodeID;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Ping 请求消息
 */
export interface PingMessage extends RPCMessage {
  type: RPCMessageType.PING;
}

/**
 * Pong 响应消息
 */
export interface PongMessage extends RPCMessage {
  type: RPCMessageType.PONG;
  /** 响应的请求消息ID */
  requestMessageId: string;
}

/**
 * FindNode 请求消息
 */
export interface FindNodeMessage extends RPCMessage {
  type: RPCMessageType.FIND_NODE;
  /** 要查找的目标节点ID */
  targetId: NodeID;
}

/**
 * FindNode 响应消息
 */
export interface FindNodeResponseMessage extends RPCMessage {
  type: RPCMessageType.FIND_NODE_RESPONSE;
  /** 响应的请求消息ID */
  requestMessageId: string;
  /** 找到的节点列表 */
  nodes: NodeInfo[];
}

/**
 * FindValue 请求消息
 */
export interface FindValueMessage extends RPCMessage {
  type: RPCMessageType.FIND_VALUE;
  /** 要查找的键 */
  key: NodeID;
}

/**
 * FindValue 响应消息
 */
export interface FindValueResponseMessage extends RPCMessage {
  type: RPCMessageType.FIND_VALUE_RESPONSE;
  /** 响应的请求消息ID */
  requestMessageId: string;
  /** 找到的值 (如果有) */
  value?: Uint8Array;
  /** 更接近目标的节点列表 (如果值未找到) */
  nodes?: NodeInfo[];
}

/**
 * Store 请求消息
 */
export interface StoreMessage extends RPCMessage {
  type: RPCMessageType.STORE;
  /** 存储的键 */
  key: NodeID;
  /** 存储的值 */
  value: Uint8Array;
  /** TTL (秒,可选) */
  ttl?: number;
  /** Ed25519 签名 (可选,用于验证) */
  signature?: string;
  /** 发布者的公钥 (hex编码) */
  publisherKey?: string;
}

/**
 * Store 响应消息
 */
export interface StoreResponseMessage extends RPCMessage {
  type: RPCMessageType.STORE_RESPONSE;
  /** 响应的请求消息ID */
  requestMessageId: string;
  /** 是否成功 */
  success: boolean;
}

/**
 * 错误响应消息
 */
export interface ErrorMessage extends RPCMessage {
  type: RPCMessageType.ERROR;
  /** 响应的请求消息Id */
  requestMessageId?: string;
  /** 错误代码 */
  errorCode: number;
  /** 错误消息 */
  errorMessage: string;
}

/**
 * 所有RPC消息类型联合
 */
export type AnyRPCMessage =
  | PingMessage
  | PongMessage
  | FindNodeMessage
  | FindNodeResponseMessage
  | FindValueMessage
  | FindValueResponseMessage
  | StoreMessage
  | StoreResponseMessage
  | ErrorMessage;

/**
 * RPC 配置
 */
export interface RPCConfig {
  /** 本地端口 */
  port: number;
  /** 本地地址 */
  address?: string;
  /** 请求超时时间(毫秒) */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * DHT 存储条目
 */
export interface DHTEntry {
  /** 键 */
  key: NodeID;
  /** 值 */
  value: Uint8Array;
  /** 过期时间戳 (可选) */
  expiresAt?: number;
  /** 创建时间 */
  createdAt: number;
  /** 发布者节点ID */
  publisherId: NodeID;
  /** 发布者的公钥 (hex编码) */
  publisherKey?: string;
  /** Ed25519 签名 */
  signature?: string;
}

/**
 * 对等节点发现配置
 */
export interface PeerDiscoveryConfig {
  /** 本地节点ID */
  localNodeId: NodeID;
  /** 本地端口 */
  port: number;
  /** Bootstrap节点列表 */
  bootstrapNodes?: NodeInfo[];
  /** K值 */
  k?: number;
  /** 并发查询数 */
  alpha?: number;
  /** 是否启用WebSocket传输 */
  enableWebSocket?: boolean;
}

/**
 * 对等节点信息 (Claw特定)
 */
export interface ClawPeerInfo {
  /** 节点ID */
  nodeId: NodeID;
  /** 公钥 */
  publicKey: Uint8Array;
  /** WebSocket地址 */
  wsAddress?: string;
  /** TCP地址 */
  tcpAddress?: string;
  /** 节点能力 */
  capabilities?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Kademlia 节点配置
 */
export interface KademliaNodeConfig {
  /** 本地节点ID (可选,自动生成) */
  nodeId?: NodeID;
  /** 本地端口 */
  port: number;
  /** 本地地址 */
  address?: string;
  /** K值 */
  k?: number;
  /** Alpha值 (并发查询数) */
  alpha?: number;
  /** Bootstrap节点 */
  bootstrapNodes?: NodeInfo[];
  /** 是否启用WebSocket */
  enableWebSocket?: boolean;
}
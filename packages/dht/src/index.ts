/**
 * @clawchat/dht - 去中心化发现模块
 * 实现Kademlia DHT协议的节点发现和路由
 */

// 类型定义
export type {
  NodeID,
  NodeInfo,
  KBucket,
  KBucketConfig,
  KBucketEntry,
  RoutingTableConfig,
  RPCMessage,
  PingMessage,
  PongMessage,
  FindNodeMessage,
  FindNodeResponseMessage,
  FindValueMessage,
  FindValueResponseMessage,
  StoreMessage,
  StoreResponseMessage,
  ErrorMessage,
  AnyRPCMessage,
  RPCConfig,
  DHTEntry,
  PeerDiscoveryConfig,
  ClawPeerInfo,
  KademliaNodeConfig
} from './kademlia/types.js';

// 枚举导出
export { RPCMessageType } from './kademlia/types.js';

// 路由表
export {
  RoutingTable,
  calculateDistance,
  findBucketIndex,
  nodeIdEquals,
  nodeIdToHex,
  hexToNodeId
} from './kademlia/routing-table.js';

// RPC通信
export { KademliaRPC, type MessageHandler } from './kademlia/rpc.js';

// Kademlia节点
export {
  KademliaNode,
  generateNodeId,
  nodeIdFromPublicKey
} from './kademlia/node.js';

// 对等节点发现
export { PeerDiscovery } from './discovery/peer-discovery.js';
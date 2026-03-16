/**
 * Kademlia RPC 通信实现
 * 使用UDP进行节点间消息传递
 */

import * as dgram from 'dgram';
import type { Socket, RemoteInfo } from 'dgram';
import type {
  NodeID,
  NodeInfo,
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
  RPCConfig
} from './types.js';
import { RPCMessageType } from './types.js';
import { nodeIdToHex } from './routing-table.js';

/** 默认超时时间 5秒 */
const DEFAULT_TIMEOUT = 5000;

/** 默认最大重试次数 */
const DEFAULT_MAX_RETRIES = 3;

/** 消息解码器 */
const decoder = new TextDecoder();

/**
 * 生成随机消息ID
 */
function generateMessageId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将Uint8Array转换为Base64字符串
 */
function uint8ArrayToBase64(arr: Uint8Array): string {
  return Buffer.from(arr).toString('base64');
}

/**
 * 将Base64字符串转换为Uint8Array
 */
function base64ToUint8Array(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

/**
 * 序列化RPC消息
 */
function serializeMessage(message: AnyRPCMessage): Buffer {
  const json: Record<string, unknown> = {
    type: message.type,
    messageId: message.messageId,
    senderId: uint8ArrayToBase64(message.senderId),
    timestamp: message.timestamp
  };

  // 添加特定消息类型的字段
  switch (message.type) {
    case RPCMessageType.PONG:
    case RPCMessageType.FIND_NODE_RESPONSE:
    case RPCMessageType.FIND_VALUE_RESPONSE:
    case RPCMessageType.STORE_RESPONSE:
    case RPCMessageType.ERROR:
      json.requestMessageId = (message as PongMessage).requestMessageId;
      break;
  }

  switch (message.type) {
    case RPCMessageType.FIND_NODE:
      json.targetId = uint8ArrayToBase64((message as FindNodeMessage).targetId);
      break;
    case RPCMessageType.FIND_NODE_RESPONSE:
      json.nodes = (message as FindNodeResponseMessage).nodes.map(n => ({
        id: uint8ArrayToBase64(n.id),
        address: n.address,
        port: n.port,
        publicKey: n.publicKey ? uint8ArrayToBase64(n.publicKey) : undefined
      }));
      break;
    case RPCMessageType.FIND_VALUE:
      json.key = uint8ArrayToBase64((message as FindValueMessage).key);
      break;
    case RPCMessageType.FIND_VALUE_RESPONSE:
      if ((message as FindValueResponseMessage).value) {
        json.value = uint8ArrayToBase64((message as FindValueResponseMessage).value!);
      }
      if ((message as FindValueResponseMessage).nodes) {
        json.nodes = (message as FindValueResponseMessage).nodes!.map(n => ({
          id: uint8ArrayToBase64(n.id),
          address: n.address,
          port: n.port,
          publicKey: n.publicKey ? uint8ArrayToBase64(n.publicKey) : undefined
        }));
      }
      break;
    case RPCMessageType.STORE:
      json.key = uint8ArrayToBase64((message as StoreMessage).key);
      json.value = uint8ArrayToBase64((message as StoreMessage).value);
      if ((message as StoreMessage).ttl) {
        json.ttl = (message as StoreMessage).ttl;
      }
      break;
    case RPCMessageType.STORE_RESPONSE:
      json.success = (message as StoreResponseMessage).success;
      break;
    case RPCMessageType.ERROR:
      json.errorCode = (message as ErrorMessage).errorCode;
      json.errorMessage = (message as ErrorMessage).errorMessage;
      break;
  }

  return Buffer.from(JSON.stringify(json));
}

/**
 * 反序列化RPC消息
 */
function deserializeMessage(data: Buffer): AnyRPCMessage {
  const json = JSON.parse(decoder.decode(data));

  const base: RPCMessage = {
    type: json.type as RPCMessageType,
    messageId: json.messageId,
    senderId: base64ToUint8Array(json.senderId),
    timestamp: json.timestamp
  };

  switch (json.type) {
    case RPCMessageType.PING:
      return base as PingMessage;
    case RPCMessageType.PONG:
      return {
        ...base,
        requestMessageId: json.requestMessageId
      } as PongMessage;
    case RPCMessageType.FIND_NODE:
      return {
        ...base,
        targetId: base64ToUint8Array(json.targetId)
      } as FindNodeMessage;
    case RPCMessageType.FIND_NODE_RESPONSE:
      return {
        ...base,
        requestMessageId: json.requestMessageId,
        nodes: json.nodes.map((n: { id: string; address: string; port: number; publicKey?: string }) => ({
          id: base64ToUint8Array(n.id),
          address: n.address,
          port: n.port,
          publicKey: n.publicKey ? base64ToUint8Array(n.publicKey) : undefined
        }))
      } as FindNodeResponseMessage;
    case RPCMessageType.FIND_VALUE:
      return {
        ...base,
        key: base64ToUint8Array(json.key)
      } as FindValueMessage;
    case RPCMessageType.FIND_VALUE_RESPONSE:
      return {
        ...base,
        requestMessageId: json.requestMessageId,
        value: json.value ? base64ToUint8Array(json.value) : undefined,
        nodes: json.nodes ? json.nodes.map((n: { id: string; address: string; port: number; publicKey?: string }) => ({
          id: base64ToUint8Array(n.id),
          address: n.address,
          port: n.port,
          publicKey: n.publicKey ? base64ToUint8Array(n.publicKey) : undefined
        })) : undefined
      } as FindValueResponseMessage;
    case RPCMessageType.STORE:
      return {
        ...base,
        key: base64ToUint8Array(json.key),
        value: base64ToUint8Array(json.value),
        ttl: json.ttl
      } as StoreMessage;
    case RPCMessageType.STORE_RESPONSE:
      return {
        ...base,
        requestMessageId: json.requestMessageId,
        success: json.success
      } as StoreResponseMessage;
    case RPCMessageType.ERROR:
      return {
        ...base,
        requestMessageId: json.requestMessageId,
        errorCode: json.errorCode,
        errorMessage: json.errorMessage
      } as ErrorMessage;
    default:
      throw new Error(`未知的消息类型: ${json.type}`);
  }
}

/**
 * 待处理请求
 */
interface PendingRequest {
  resolve: (message: AnyRPCMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  retries: number;
  message: AnyRPCMessage;
  target: { address: string; port: number };
}

/**
 * 消息处理器类型
 */
export type MessageHandler = (
  message: AnyRPCMessage,
  sender: NodeInfo
) => Promise<AnyRPCMessage | void>;

/**
 * 简单日志记录器
 */
interface Logger {
  info: (msg: string) => void;
  debug: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
  warn: (msg: string) => void;
}

/**
 * Kademlia RPC 实现
 */
export class KademliaRPC {
  private socket: Socket | null = null;
  private port: number;
  private address: string;
  private timeout: number;
  private maxRetries: number;
  private localNodeId: NodeID;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private messageHandlers: Map<RPCMessageType, MessageHandler[]> = new Map();
  private logger: Logger;

  constructor(localNodeId: NodeID, config: RPCConfig, logger?: Logger) {
    this.localNodeId = localNodeId;
    this.port = config.port;
    this.address = config.address ?? '0.0.0.0';
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.logger = logger ?? {
      info: (msg: string) => console.log(`[KademliaRPC] ${msg}`),
      debug: (obj: object, msg: string) => console.debug(`[KademliaRPC] ${msg}`, obj),
      error: (obj: object, msg: string) => console.error(`[KademliaRPC] ${msg}`, obj),
      warn: (msg: string) => console.warn(`[KademliaRPC] ${msg}`)
    };
  }

  /**
   * 启动RPC服务
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('message', (data, remote) => {
        this.handleMessage(data, remote);
      });

      this.socket.on('error', (error) => {
        this.logger.error({ error }, 'UDP socket error');
      });

      this.socket.bind(this.port, this.address, () => {
        // 获取实际绑定的端口
        const address = this.socket!.address();
        this.port = address.port;
        this.logger.info(`RPC服务启动在 ${this.address}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * 停止RPC服务
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        // 清理所有待处理请求
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('RPC服务已停止'));
        }
        this.pendingRequests.clear();

        this.socket.close(() => {
          this.socket = null;
          this.logger.info('RPC服务已停止');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理接收到的消息
   */
  private async handleMessage(data: Buffer, remote: RemoteInfo): Promise<void> {
    try {
      const message = deserializeMessage(data);
      const sender: NodeInfo = {
        id: message.senderId,
        address: remote.address,
        port: remote.port
      };

      this.logger.debug({
        type: message.type,
        messageId: message.messageId,
        sender: nodeIdToHex(message.senderId)
      }, '收到消息');

      // 检查是否是响应消息
      if ('requestMessageId' in message && message.requestMessageId) {
        const pending = this.pendingRequests.get(message.requestMessageId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.requestMessageId);
          pending.resolve(message);
          return;
        }
      }

      // 调用注册的处理器
      const handlers = this.messageHandlers.get(message.type) ?? [];
      for (const handler of handlers) {
        const response = await handler(message, sender);
        if (response) {
          await this.send(response, sender.address, sender.port);
        }
      }
    } catch (error) {
      this.logger.error({ error }, '处理消息失败');
    }
  }

  /**
   * 发送消息
   */
  private async send(
    message: AnyRPCMessage,
    address: string,
    port: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('RPC服务未启动'));
        return;
      }

      const data = serializeMessage(message);
      this.socket.send(data, port, address, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 发送请求并等待响应
   */
  async request<T extends AnyRPCMessage>(
    message: AnyRPCMessage,
    target: NodeInfo
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: resolve as (message: AnyRPCMessage) => void,
        reject,
        timeout: setTimeout(() => {
          this.handleTimeout(pending);
        }, this.timeout),
        retries: 0,
        message,
        target: { address: target.address, port: target.port }
      };

      this.pendingRequests.set(message.messageId, pending);
      this.sendWithRetry(pending);
    });
  }

  /**
   * 发送消息并支持重试
   */
  private async sendWithRetry(pending: PendingRequest): Promise<void> {
    try {
      await this.send(
        pending.message,
        pending.target.address,
        pending.target.port
      );
    } catch (error) {
      this.logger.error({ error, retries: pending.retries }, '发送消息失败');
      if (pending.retries < this.maxRetries) {
        pending.retries++;
        setTimeout(() => this.sendWithRetry(pending), 1000);
      } else {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(pending.message.messageId);
        pending.reject(new Error('发送失败,已达到最大重试次数'));
      }
    }
  }

  /**
   * 处理超时
   */
  private handleTimeout(pending: PendingRequest): void {
    this.pendingRequests.delete(pending.message.messageId);

    if (pending.retries < this.maxRetries) {
      pending.retries++;
      pending.timeout = setTimeout(() => {
        this.handleTimeout(pending);
      }, this.timeout);
      this.pendingRequests.set(pending.message.messageId, pending);
      this.sendWithRetry(pending);
    } else {
      pending.reject(new Error('请求超时'));
    }
  }

  /**
   * 注册消息处理器
   */
  on(type: RPCMessageType, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type) ?? [];
    handlers.push(handler);
    this.messageHandlers.set(type, handlers);
  }

  /**
   * 移除消息处理器
   */
  off(type: RPCMessageType, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  // ============== 便捷方法 ==============

  /**
   * 发送Ping请求
   */
  async ping(target: NodeInfo): Promise<boolean> {
    const message: PingMessage = {
      type: RPCMessageType.PING,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now()
    };

    try {
      const response = await this.request<PongMessage>(message, target);
      return response.type === RPCMessageType.PONG;
    } catch {
      return false;
    }
  }

  /**
   * 创建Pong响应
   */
  createPong(requestMessageId: string): PongMessage {
    return {
      type: RPCMessageType.PONG,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      requestMessageId
    };
  }

  /**
   * 发送FindNode请求
   */
  async findNode(targetId: NodeID, target: NodeInfo): Promise<NodeInfo[]> {
    const message: FindNodeMessage = {
      type: RPCMessageType.FIND_NODE,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      targetId
    };

    try {
      const response = await this.request<FindNodeResponseMessage>(message, target);
      return response.nodes ?? [];
    } catch {
      return [];
    }
  }

  /**
   * 创建FindNode响应
   */
  createFindNodeResponse(
    requestMessageId: string,
    nodes: NodeInfo[]
  ): FindNodeResponseMessage {
    return {
      type: RPCMessageType.FIND_NODE_RESPONSE,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      requestMessageId,
      nodes
    };
  }

  /**
   * 发送FindValue请求
   */
  async findValue(
    key: NodeID,
    target: NodeInfo
  ): Promise<{ value?: Uint8Array; nodes?: NodeInfo[] }> {
    const message: FindValueMessage = {
      type: RPCMessageType.FIND_VALUE,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      key
    };

    try {
      const response = await this.request<FindValueResponseMessage>(message, target);
      return {
        value: response.value,
        nodes: response.nodes
      };
    } catch {
      return {};
    }
  }

  /**
   * 创建FindValue响应 (找到值)
   */
  createFindValueResponse(
    requestMessageId: string,
    value: Uint8Array
  ): FindValueResponseMessage;
  /**
   * 创建FindValue响应 (未找到值,返回更近的节点)
   */
  createFindValueResponse(
    requestMessageId: string,
    nodes: NodeInfo[]
  ): FindValueResponseMessage;
  createFindValueResponse(
    requestMessageId: string,
    valueOrNodes: Uint8Array | NodeInfo[]
  ): FindValueResponseMessage {
    if (valueOrNodes instanceof Uint8Array) {
      return {
        type: RPCMessageType.FIND_VALUE_RESPONSE,
        messageId: generateMessageId(),
        senderId: this.localNodeId,
        timestamp: Date.now(),
        requestMessageId,
        value: valueOrNodes as Uint8Array
      };
    } else {
      return {
        type: RPCMessageType.FIND_VALUE_RESPONSE,
        messageId: generateMessageId(),
        senderId: this.localNodeId,
        timestamp: Date.now(),
        requestMessageId,
        nodes: valueOrNodes as NodeInfo[]
      };
    }
  }

  /**
   * 发送Store请求
   */
  async store(
    key: NodeID,
    value: Uint8Array,
    target: NodeInfo,
    ttl?: number
  ): Promise<boolean> {
    const message: StoreMessage = {
      type: RPCMessageType.STORE,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      key,
      value,
      ttl
    };

    try {
      const response = await this.request<StoreResponseMessage>(message, target);
      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * 创建Store响应
   */
  createStoreResponse(
    requestMessageId: string,
    success: boolean
  ): StoreResponseMessage {
    return {
      type: RPCMessageType.STORE_RESPONSE,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      requestMessageId,
      success
    };
  }

  /**
   * 创建FindValue响应 (带签名)
   * 用于返回带签名的值
   */
  createFindValueResponseWithSignature(
    requestMessageId: string,
    value: Uint8Array,
    signature: string,
    publisherKey: string
  ): FindValueResponseMessage {
    return {
      type: RPCMessageType.FIND_VALUE_RESPONSE,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      requestMessageId,
      value,
      // 将签名信息附加到响应中 (使用 metadata 字段)
      nodes: [{
        id: new Uint8Array(20), // 占位符
        address: publisherKey, // 使用 address 字段传递 publisherKey
        port: signature.length // 使用 port 字段传递签名长度作为标志
      }]
    };
  }

  /**
   * 创建错误响应
   */
  createError(
    requestMessageId: string | undefined,
    errorCode: number,
    errorMessage: string
  ): ErrorMessage {
    return {
      type: RPCMessageType.ERROR,
      messageId: generateMessageId(),
      senderId: this.localNodeId,
      timestamp: Date.now(),
      requestMessageId,
      errorCode,
      errorMessage
    };
  }

  /**
   * 获取本地端口
   */
  getPort(): number {
    return this.port;
  }

  /**
   * 获取本地地址
   */
  getAddress(): string {
    return this.address;
  }
}
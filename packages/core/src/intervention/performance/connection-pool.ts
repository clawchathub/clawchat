/**
 * WebSocket Connection Pool
 * Manages reusable WebSocket connections with auto-reconnect and heartbeat
 */

// ============================================
// Types
// ============================================

export interface ConnectionConfig {
  maxConnections: number;
  minConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  reconnectAttempts: number;
  reconnectDelay: number;
  reconnectBackoffMultiplier: number;
}

export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  maxConnections: 100,
  minConnections: 5,
  connectionTimeout: 10000,
  idleTimeout: 60000,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  reconnectBackoffMultiplier: 2,
};

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export interface PooledConnection {
  id: string;
  url: string;
  ws: WebSocket | null;
  state: ConnectionState;
  createdAt: number;
  lastUsedAt: number;
  lastHeartbeatAt: number;
  reconnectAttempts: number;
  pendingMessages: unknown[];
  metadata: Record<string, unknown>;
}

export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  pendingConnections: number;
  errorConnections: number;
  totalMessages: number;
  totalErrors: number;
  averageLatency: number;
}

export type MessageHandler = (connection: PooledConnection, data: unknown) => void;
export type ConnectionEventHandler = (connection: PooledConnection, event: string) => void;

// ============================================
// Connection Pool
// ============================================

export class WebSocketConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private urlToConnections: Map<string, Set<string>> = new Map();
  private config: ConnectionConfig;
  private messageHandler?: MessageHandler;
  private eventHandlers: Set<ConnectionEventHandler> = new Set();
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private stats: ConnectionPoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    pendingConnections: 0,
    errorConnections: 0,
    totalMessages: 0,
    totalErrors: 0,
    averageLatency: 0,
  };

  constructor(config: Partial<ConnectionConfig> = {}) {
    this.config = { ...DEFAULT_CONNECTION_CONFIG, ...config };
  }

  /**
   * Set message handler
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Subscribe to connection events
   */
  subscribe(handler: ConnectionEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Acquire a connection for a URL
   */
  async acquire(url: string, metadata?: Record<string, unknown>): Promise<PooledConnection> {
    // Find or create a connection
    let connection = this.findAvailableConnection(url);

    if (!connection) {
      if (this.connections.size >= this.config.maxConnections) {
        // Try to evict idle connections
        this.evictIdleConnections();
      }

      if (this.connections.size < this.config.maxConnections) {
        connection = await this.createConnection(url, metadata);
      } else {
        throw new Error('Connection pool exhausted');
      }
    }

    connection.lastUsedAt = Date.now();
    return connection;
  }

  /**
   * Release a connection back to the pool
   */
  release(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.state === 'connected') {
      connection.lastUsedAt = Date.now();
    }
  }

  /**
   * Send a message through a connection
   */
  async send(connectionId: string, data: unknown): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.state !== 'connected' || !connection.ws) {
      // Queue message for when connection is ready
      connection.pendingMessages.push(data);
      return;
    }

    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      try {
        connection.ws!.send(JSON.stringify(data));
        this.stats.totalMessages++;
        this.updateLatency(Date.now() - startTime);
        resolve();
      } catch (error) {
        this.stats.totalErrors++;
        connection.state = 'error';
        this.emitEvent(connection, 'error');
        reject(error);
      }
    });
  }

  /**
   * Broadcast to all connections for a URL
   */
  async broadcast(url: string, data: unknown): Promise<number> {
    const connectionIds = this.urlToConnections.get(url);
    if (!connectionIds || connectionIds.size === 0) return 0;

    let successCount = 0;
    for (const id of connectionIds) {
      try {
        await this.send(id, data);
        successCount++;
      } catch {
        // Continue with other connections
      }
    }

    return successCount;
  }

  /**
   * Get a connection by ID
   */
  get(connectionId: string): PooledConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections for a URL
   */
  getConnectionsForUrl(url: string): PooledConnection[] {
    const ids = this.urlToConnections.get(url);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.connections.get(id))
      .filter((c): c is PooledConnection => c !== undefined);
  }

  /**
   * Close a specific connection
   */
  async close(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.state = 'disconnecting';
    this.emitEvent(connection, 'disconnecting');

    if (connection.ws) {
      connection.ws.close();
      connection.ws = null;
    }

    this.removeConnection(connection);
    connection.state = 'disconnected';
    this.emitEvent(connection, 'disconnected');
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.connections.keys()).map((id) => this.close(id));
    await Promise.all(closePromises);
    this.stopHeartbeat();
    this.stopCleanup();
  }

  /**
   * Start heartbeat and cleanup intervals
   */
  start(): void {
    this.startHeartbeat();
    this.startCleanup();
  }

  /**
   * Stop heartbeat and cleanup intervals
   */
  stop(): void {
    this.stopHeartbeat();
    this.stopCleanup();
  }

  /**
   * Get pool statistics
   */
  getStats(): ConnectionPoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get pool health status
   */
  getHealth(): {
    healthy: boolean;
    issues: string[];
    connections: number;
    maxConnections: number;
  } {
    const issues: string[] = [];
    const stats = this.getStats();

    if (stats.errorConnections > stats.totalConnections * 0.5) {
      issues.push('High error rate on connections');
    }

    if (stats.totalConnections >= this.config.maxConnections * 0.9) {
      issues.push('Connection pool near capacity');
    }

    return {
      healthy: issues.length === 0,
      issues,
      connections: stats.totalConnections,
      maxConnections: this.config.maxConnections,
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private findAvailableConnection(url: string): PooledConnection | undefined {
    const ids = this.urlToConnections.get(url);
    if (!ids) return undefined;

    for (const id of ids) {
      const connection = this.connections.get(id);
      if (connection && connection.state === 'connected' && connection.ws) {
        return connection;
      }
    }

    return undefined;
  }

  private async createConnection(
    url: string,
    metadata?: Record<string, unknown>
  ): Promise<PooledConnection> {
    const id = this.generateConnectionId();
    const connection: PooledConnection = {
      id,
      url,
      ws: null,
      state: 'connecting',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      reconnectAttempts: 0,
      pendingMessages: [],
      metadata: metadata || {},
    };

    this.connections.set(id, connection);

    // Track URL to connection mapping
    if (!this.urlToConnections.has(url)) {
      this.urlToConnections.set(url, new Set());
    }
    this.urlToConnections.get(url)!.add(id);

    this.stats.totalConnections++;

    await this.connectWebSocket(connection);
    return connection;
  }

  private async connectWebSocket(connection: PooledConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(connection.url);

        const timeout = setTimeout(() => {
          if (connection.state === 'connecting') {
            ws.close();
            connection.state = 'error';
            this.handleReconnect(connection);
            reject(new Error('Connection timeout'));
          }
        }, this.config.connectionTimeout);

        ws.onopen = () => {
          clearTimeout(timeout);
          connection.ws = ws;
          connection.state = 'connected';
          connection.reconnectAttempts = 0;
          this.emitEvent(connection, 'connected');

          // Send pending messages
          this.flushPendingMessages(connection);

          resolve();
        };

        ws.onmessage = (event) => {
          connection.lastUsedAt = Date.now();
          try {
            const data = JSON.parse(event.data as string);

            // Handle heartbeat response
            if (data.type === 'pong') {
              connection.lastHeartbeatAt = Date.now();
              return;
            }

            if (this.messageHandler) {
              this.messageHandler(connection, data);
            }
          } catch {
            if (this.messageHandler) {
              this.messageHandler(connection, event.data);
            }
          }
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          connection.ws = null;
          if (connection.state !== 'disconnecting') {
            connection.state = 'disconnected';
            this.handleReconnect(connection);
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          this.stats.totalErrors++;
          connection.state = 'error';
          this.emitEvent(connection, 'error');
        };
      } catch (error) {
        connection.state = 'error';
        this.handleReconnect(connection);
        reject(error);
      }
    });
  }

  private handleReconnect(connection: PooledConnection): void {
    if (connection.reconnectAttempts >= this.config.reconnectAttempts) {
      this.removeConnection(connection);
      return;
    }

    connection.state = 'reconnecting';
    this.emitEvent(connection, 'reconnecting');

    const delay = this.config.reconnectDelay *
      Math.pow(this.config.reconnectBackoffMultiplier, connection.reconnectAttempts);

    connection.reconnectAttempts++;

    setTimeout(() => {
      if (connection.state === 'reconnecting') {
        this.connectWebSocket(connection).catch(() => {
          // Will trigger another reconnect attempt
        });
      }
    }, delay);
  }

  private flushPendingMessages(connection: PooledConnection): void {
    if (!connection.ws || connection.pendingMessages.length === 0) return;

    const messages = [...connection.pendingMessages];
    connection.pendingMessages = [];

    for (const data of messages) {
      this.send(connection.id, data).catch(() => {
        // Re-queue on failure
        connection.pendingMessages.push(data);
      });
    }
  }

  private removeConnection(connection: PooledConnection): void {
    this.connections.delete(connection.id);

    const urlConnections = this.urlToConnections.get(connection.url);
    if (urlConnections) {
      urlConnections.delete(connection.id);
      if (urlConnections.size === 0) {
        this.urlToConnections.delete(connection.url);
      }
    }

    this.stats.totalConnections--;
  }

  private evictIdleConnections(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [id, connection] of this.connections) {
      if (
        connection.state === 'connected' &&
        now - connection.lastUsedAt > this.config.idleTimeout
      ) {
        this.close(id);
        evicted++;
      }
    }

    return evicted;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private sendHeartbeats(): void {
    const now = Date.now();

    for (const connection of this.connections.values()) {
      if (connection.state === 'connected' && connection.ws) {
        // Check for heartbeat timeout
        if (now - connection.lastHeartbeatAt > this.config.heartbeatTimeout) {
          connection.state = 'error';
          this.handleReconnect(connection);
          continue;
        }

        // Send ping
        try {
          connection.ws.send(JSON.stringify({ type: 'ping', timestamp: now }));
        } catch {
          connection.state = 'error';
          this.handleReconnect(connection);
        }
      }
    }
  }

  private startCleanup(): void {
    this.stopCleanup();
    this.cleanupInterval = setInterval(() => {
      this.evictIdleConnections();
    }, 60000);
  }

  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private updateStats(): void {
    this.stats.activeConnections = 0;
    this.stats.idleConnections = 0;
    this.stats.pendingConnections = 0;
    this.stats.errorConnections = 0;

    for (const connection of this.connections.values()) {
      switch (connection.state) {
        case 'connected':
          if (Date.now() - connection.lastUsedAt < 30000) {
            this.stats.activeConnections++;
          } else {
            this.stats.idleConnections++;
          }
          break;
        case 'connecting':
        case 'reconnecting':
          this.stats.pendingConnections++;
          break;
        case 'error':
          this.stats.errorConnections++;
          break;
      }
    }
  }

  private updateLatency(latency: number): void {
    this.stats.averageLatency = this.stats.averageLatency * 0.9 + latency * 0.1;
  }

  private emitEvent(connection: PooledConnection, event: string): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(connection, event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
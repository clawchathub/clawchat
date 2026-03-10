/**
 * Connection Manager
 * Coordinates connection establishment and lifecycle
 */

import WebSocket from 'ws';
import type { ConnectionCache, ConnectionPath } from './cache.js';
import { getConnectionCache } from './cache.js';
import type { STUNResult, NATType } from '../nat/stun.js';
import { NATTraversal } from '../nat/traversal.js';

// ============================================
// Types
// ============================================

export interface ConnectionOptions {
  preferDirect: boolean;
  timeout: number;
  retries: number;
}

export interface ConnectionResult {
  success: boolean;
  socket?: WebSocket;
  method: 'direct' | 'relay' | 'hole-punch' | null;
  latency: number;
  error?: string;
}

export interface PeerInfo {
  publicKey: string;
  endpoints: Array<{ ip: string; port: number }>;
  natType?: NATType;
  relayUrl?: string;
}

// ============================================
// Connection Manager
// ============================================

export class ConnectionManager {
  private cache: ConnectionCache;
  private traversal: NATTraversal;
  private localNATInfo: STUNResult | null = null;
  private activeConnections: Map<string, WebSocket> = new Map();

  constructor(cache?: ConnectionCache) {
    this.cache = cache ?? getConnectionCache();
    this.traversal = new NATTraversal();
  }

  /**
   * Set local NAT information
   */
  setLocalNATInfo(info: STUNResult): void {
    this.localNATInfo = info;
    this.traversal.setLocalNATInfo(info);
  }

  /**
   * Connect to a peer with automatic path selection
   */
  async connect(
    peer: PeerInfo,
    relayUrl?: string,
    options: Partial<ConnectionOptions> = {}
  ): Promise<ConnectionResult> {
    const opts: ConnectionOptions = {
      preferDirect: options.preferDirect ?? true,
      timeout: options.timeout ?? 30000,
      retries: options.retries ?? 3,
    };

    const startTime = Date.now();

    // Check cache for known good path
    const cachedPath = this.cache.get(peer.publicKey);
    if (cachedPath && cachedPath.successRate > 0.7) {
      const result = await this.tryCachedPath(cachedPath, opts.timeout);
      if (result.success) {
        this.cache.set(peer.publicKey, {
          method: result.method!,
          endpoint: result.method === 'direct' ? cachedPath.endpoint : undefined,
          relayUrl: result.method === 'relay' ? relayUrl : undefined,
          latency: Date.now() - startTime,
        });
        return result;
      }
    }

    // Try direct connection first if preferred and possible
    if (opts.preferDirect && this.canTryDirect(peer.natType)) {
      for (const endpoint of peer.endpoints) {
        const result = await this.tryDirect(endpoint, opts.timeout);
        if (result.success) {
          this.cache.set(peer.publicKey, {
            method: 'direct',
            endpoint,
            latency: result.latency,
          });
          this.activeConnections.set(peer.publicKey, result.socket!);
          return result;
        }
      }
    }

    // Try hole punching if direct failed and NAT types allow
    if (this.canTryHolePunch(peer.natType) && peer.endpoints.length > 0) {
      const result = await this.tryHolePunch(peer, opts);
      if (result.success) {
        this.cache.set(peer.publicKey, {
          method: 'hole-punch',
          endpoint: peer.endpoints[0],
          latency: result.latency,
        });
        this.activeConnections.set(peer.publicKey, result.socket!);
        return result;
      }
    }

    // Fallback to relay
    if (relayUrl) {
      const result = await this.tryRelay(relayUrl, peer.publicKey, opts.timeout);
      if (result.success) {
        this.cache.set(peer.publicKey, {
          method: 'relay',
          relayUrl,
          latency: result.latency,
        });
        this.activeConnections.set(peer.publicKey, result.socket!);
        return result;
      }
    }

    return {
      success: false,
      method: null,
      latency: Date.now() - startTime,
      error: 'All connection methods failed',
    };
  }

  /**
   * Check if direct connection can be attempted
   */
  private canTryDirect(peerNATType?: NATType): boolean {
    if (!this.localNATInfo) return true; // Unknown, try anyway
    return this.traversal.canAttemptDirect(this.localNATInfo.natType, peerNATType);
  }

  /**
   * Check if hole punching can be attempted
   */
  private canTryHolePunch(peerNATType?: NATType): boolean {
    if (!this.localNATInfo) return false;
    if (this.localNATInfo.natType === 'symmetric') return false;
    if (peerNATType === 'symmetric') return false;
    return this.localNATInfo.natType !== 'public';
  }

  /**
   * Try direct WebSocket connection
   */
  private async tryDirect(
    endpoint: { ip: string; port: number },
    timeout: number
  ): Promise<ConnectionResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://${endpoint.ip}:${endpoint.port}`);
      const timer = setTimeout(() => {
        ws.terminate();
        resolve({
          success: false,
          method: 'direct',
          latency: Date.now() - startTime,
          error: 'Connection timeout',
        });
      }, timeout);

      ws.on('open', () => {
        clearTimeout(timer);
        resolve({
          success: true,
          socket: ws,
          method: 'direct',
          latency: Date.now() - startTime,
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          method: 'direct',
          latency: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  /**
   * Try hole punching
   */
  private async tryHolePunch(
    peer: PeerInfo,
    options: ConnectionOptions
  ): Promise<ConnectionResult> {
    if (!this.localNATInfo || peer.endpoints.length === 0) {
      return {
        success: false,
        method: 'hole-punch',
        latency: 0,
        error: 'Missing NAT info or endpoints',
      };
    }

    const result = await this.traversal.attemptHolePunch(
      this.localNATInfo.localPort,
      peer.endpoints[0]!
    );

    return {
      success: result.success,
      socket: result.connection,
      method: result.success ? 'hole-punch' : null,
      latency: 0,
      error: result.error,
    };
  }

  /**
   * Try relay connection
   */
  private async tryRelay(
    relayUrl: string,
    peerPublicKey: string,
    timeout: number
  ): Promise<ConnectionResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const ws = new WebSocket(relayUrl);
      const timer = setTimeout(() => {
        ws.terminate();
        resolve({
          success: false,
          method: 'relay',
          latency: Date.now() - startTime,
          error: 'Relay connection timeout',
        });
      }, timeout);

      ws.on('open', () => {
        // Send message to establish route to peer
        ws.send(JSON.stringify({
          type: 'connect',
          to: peerPublicKey,
        }));

        // Wait for confirmation
        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'connected') {
              clearTimeout(timer);
              resolve({
                success: true,
                socket: ws,
                method: 'relay',
                latency: Date.now() - startTime,
              });
            } else if (msg.type === 'error') {
              clearTimeout(timer);
              ws.terminate();
              resolve({
                success: false,
                method: 'relay',
                latency: Date.now() - startTime,
                error: msg.error,
              });
            }
          } catch {
            // Ignore parse errors
          }
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          method: 'relay',
          latency: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  /**
   * Try cached connection path
   */
  private async tryCachedPath(
    path: ConnectionPath,
    timeout: number
  ): Promise<ConnectionResult> {
    if (path.method === 'direct' && path.endpoint) {
      return this.tryDirect(path.endpoint, timeout);
    }

    if (path.method === 'relay' && path.relayUrl) {
      // Need peer public key from path
      return {
        success: false,
        method: null,
        latency: 0,
        error: 'Cannot use cached relay path without peer key',
      };
    }

    return {
      success: false,
      method: null,
      latency: 0,
      error: 'Unknown cached path type',
    };
  }

  /**
   * Close connection to a peer
   */
  disconnect(peerPublicKey: string): void {
    const ws = this.activeConnections.get(peerPublicKey);
    if (ws) {
      ws.close();
      this.activeConnections.delete(peerPublicKey);
    }
  }

  /**
   * Close all connections
   */
  disconnectAll(): void {
    for (const ws of this.activeConnections.values()) {
      ws.close();
    }
    this.activeConnections.clear();
  }

  /**
   * Get active connection
   */
  getConnection(peerPublicKey: string): WebSocket | undefined {
    return this.activeConnections.get(peerPublicKey);
  }

  /**
   * Check if connected to peer
   */
  isConnected(peerPublicKey: string): boolean {
    const ws = this.activeConnections.get(peerPublicKey);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }
}
/**
 * mDNS Discovery Module
 * Implements local network discovery using mDNS/Bonjour
 */

import { createSocket, Socket } from 'dgram';
import type { AgentCard } from '@clawchat/core';

// ============================================
// Types
// ============================================

export interface DiscoveredClaw {
  nodeId: string;
  name: string;
  ip: string;
  port: number;
  publicKey: string;
  capabilities?: string[];
  discoveredAt: number;
  agentCard?: AgentCard;
}

export interface MDNSConfig {
  /**
   * Service name (default: '_claw._tcp')
   */
  serviceName?: string;

  /**
   * Discovery port (default: 5353)
   */
  port?: number;

  /**
   * Multicast address (default: 224.0.0.251)
   */
  multicastAddress?: string;

  /**
   * How long to remember discovered nodes (ms)
   */
  discoveryTTL?: number;

  /**
   * Announcement interval (ms)
   */
  announceInterval?: number;
}

interface MDNSMessage {
  type: 'announce' | 'discover' | 'response' | 'goodbye';
  nodeId: string;
  name: string;
  port: number;
  publicKey: string;
  capabilities?: string[];
  timestamp: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SERVICE_NAME = '_claw._tcp';
const DEFAULT_PORT = 5353;
const DEFAULT_MULTICAST_ADDRESS = '224.0.0.251';
const DEFAULT_DISCOVERY_TTL = 60000; // 1 minute
const DEFAULT_ANNOUNCE_INTERVAL = 30000; // 30 seconds

// ============================================
// mDNS Discovery Service
// ============================================

export class MDNSDiscovery {
  private config: Required<MDNSConfig>;
  private socket: Socket | null = null;
  private discoveredNodes: Map<string, DiscoveredClaw> = new Map();
  private localNode: {
    nodeId: string;
    name: string;
    port: number;
    publicKey: string;
    capabilities?: string[];
  } | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: MDNSConfig = {}) {
    this.config = {
      serviceName: config.serviceName ?? DEFAULT_SERVICE_NAME,
      port: config.port ?? DEFAULT_PORT,
      multicastAddress: config.multicastAddress ?? DEFAULT_MULTICAST_ADDRESS,
      discoveryTTL: config.discoveryTTL ?? DEFAULT_DISCOVERY_TTL,
      announceInterval: config.announceInterval ?? DEFAULT_ANNOUNCE_INTERVAL,
    };
  }

  /**
   * Start the mDNS discovery service
   */
  async start(
    nodeId: string,
    name: string,
    port: number,
    publicKey: string,
    capabilities?: string[]
  ): Promise<void> {
    if (this.running) {
      return;
    }

    this.localNode = { nodeId, name, port, publicKey, capabilities };
    this.running = true;

    // Create UDP socket
    this.socket = createSocket({ type: 'udp4', reuseAddr: true });

    // Bind to port
    await new Promise<void>((resolve, reject) => {
      this.socket!.bind(this.config.port, () => {
        // Join multicast group
        this.socket!.setBroadcast(true);
        this.socket!.addMembership(this.config.multicastAddress);
        resolve();
      });

      this.socket!.on('error', (err) => {
        reject(err);
      });
    });

    // Handle incoming messages
    this.socket.on('message', (data, remote) => {
      this.handleMessage(data, remote.address);
    });

    // Start announcement timer
    this.announceTimer = setInterval(() => {
      this.announce();
    }, this.config.announceInterval);

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.discoveryTTL);

    // Send initial announce and discover
    this.announce();
    this.discover();
  }

  /**
   * Stop the mDNS discovery service
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    // Send goodbye message
    if (this.localNode) {
      this.sendGoodbye();
    }

    // Clear timers
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close socket
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.running = false;
    this.localNode = null;
  }

  /**
   * Get discovered nodes
   */
  getDiscoveredNodes(): DiscoveredClaw[] {
    return Array.from(this.discoveredNodes.values());
  }

  /**
   * Send announcement
   */
  private announce(): void {
    if (!this.localNode || !this.socket) return;

    const message: MDNSMessage = {
      type: 'announce',
      ...this.localNode,
      timestamp: Date.now(),
    };

    this.send(message);
  }

  /**
   * Send discovery request
   */
  private discover(): void {
    if (!this.socket) return;

    const message: MDNSMessage = {
      type: 'discover',
      nodeId: this.localNode?.nodeId ?? '',
      name: this.localNode?.name ?? '',
      port: this.localNode?.port ?? 0,
      publicKey: this.localNode?.publicKey ?? '',
      timestamp: Date.now(),
    };

    this.send(message);
  }

  /**
   * Send response to discovery
   */
  private sendResponse(): void {
    if (!this.localNode || !this.socket) return;

    const message: MDNSMessage = {
      type: 'response',
      ...this.localNode,
      timestamp: Date.now(),
    };

    this.send(message);
  }

  /**
   * Send goodbye message
   */
  private sendGoodbye(): void {
    if (!this.localNode || !this.socket) return;

    const message: MDNSMessage = {
      type: 'goodbye',
      ...this.localNode,
      timestamp: Date.now(),
    };

    this.send(message);
  }

  /**
   * Send message to multicast group
   */
  private send(message: MDNSMessage): void {
    if (!this.socket) return;

    const data = Buffer.from(JSON.stringify(message));
    this.socket.send(data, this.config.port, this.config.multicastAddress);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: Buffer, remoteIp: string): void {
    try {
      const message = JSON.parse(data.toString()) as MDNSMessage;

      // Ignore our own messages
      if (message.nodeId === this.localNode?.nodeId) {
        return;
      }

      switch (message.type) {
        case 'announce':
        case 'response':
          this.addNode(message, remoteIp);
          break;

        case 'discover':
          // Respond to discovery requests
          this.sendResponse();
          break;

        case 'goodbye':
          // Remove node
          this.discoveredNodes.delete(message.nodeId);
          break;
      }
    } catch {
      // Ignore invalid messages
    }
  }

  /**
   * Add or update discovered node
   */
  private addNode(message: MDNSMessage, ip: string): void {
    // Use the message port, not the remote port
    const node: DiscoveredClaw = {
      nodeId: message.nodeId,
      name: message.name,
      ip,
      port: message.port,
      publicKey: message.publicKey,
      capabilities: message.capabilities,
      discoveredAt: Date.now(),
    };

    this.discoveredNodes.set(message.nodeId, node);
  }

  /**
   * Cleanup expired nodes
   */
  private cleanup(): void {
    const now = Date.now();
    const ttl = this.config.discoveryTTL;

    for (const [nodeId, node] of this.discoveredNodes) {
      if (now - node.discoveredAt > ttl) {
        this.discoveredNodes.delete(nodeId);
      }
    }
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create mDNS discovery service
 */
export function createMDNSDiscovery(config?: MDNSConfig): MDNSDiscovery {
  return new MDNSDiscovery(config);
}
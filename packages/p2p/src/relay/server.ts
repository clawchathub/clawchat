/**
 * A2A Relay Server
 * Handles message routing and store-and-forward for offline agents
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { A2AMessage, AgentCard } from '@clawchat/core';
import * as ed from '@noble/ed25519';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

interface ConnectedAgent {
  id: string;
  publicKey: string;
  socket: WebSocket;
  agentCard: AgentCard;
  connectedAt: number;
}

interface QueuedMessage {
  id: string;
  from: string;
  to: string;
  message: A2AMessage;
  timestamp: number;
  delivered: boolean;
}

interface RelayConfig {
  port: number;
  host: string;
  messageRetentionMs: number; // How long to keep undelivered messages
  maxQueueSize: number;
}

// ============================================
// Relay Server
// ============================================

export class RelayServer {
  private fastify;
  private config: RelayConfig;
  private agents: Map<string, ConnectedAgent> = new Map();
  private messageQueue: Map<string, QueuedMessage[]> = new Map();
  private agentRegistry: Map<string, AgentCard> = new Map();

  constructor(config: Partial<RelayConfig> = {}) {
    this.config = {
      port: config.port ?? 18790,
      host: config.host ?? '0.0.0.0',
      messageRetentionMs: config.messageRetentionMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      maxQueueSize: config.maxQueueSize ?? 1000,
    };

    this.fastify = Fastify({ logger: true });
  }

  /**
   * Start the relay server
   */
  async start(): Promise<void> {
    await this.fastify.register(websocket);

    this.setupRoutes();

    await this.fastify.listen({ port: this.config.port, host: this.config.host });
    console.log(`Relay server listening on ${this.config.host}:${this.config.port}`);
  }

  /**
   * Stop the relay server
   */
  async stop(): Promise<void> {
    await this.fastify.close();
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Agent card endpoint
    this.fastify.get('/.well-known/agent.json', async () => {
      return {
        identity: {
          name: 'ClawChat Relay',
          description: 'A2A Relay Server for message routing',
          url: `http://${this.config.host}:${this.config.port}`,
          version: '0.0.1',
        },
        capabilities: {
          streaming: true,
          pushNotifications: false,
          extendedAgentCard: false,
        },
        skills: [],
        interfaces: [
          {
            protocol: 'a2a-relay',
            url: `ws://${this.config.host}:${this.config.port}/ws`,
            version: '0.3',
          },
        ],
      };
    });

    // WebSocket endpoint for agent connections
    this.fastify.register(async (fastify) => {
      fastify.get('/ws', { websocket: true }, (connection, _req) => {
        // Type the connection properly for fastify-websocket
        const ws = (connection as any).socket as WebSocket;
        this.handleConnection(ws);
      });
    });

    // HTTP JSON-RPC endpoint
    this.fastify.post('/jsonrpc', async (request, _reply) => {
      return this.handleJSONRPC(request.body as any);
    });

    // Agent registry endpoint
    this.fastify.get('/agents', async (_request, _reply) => {
      const agents = Array.from(this.agentRegistry.values());
      return { agents };
    });

    this.fastify.get('/agents/:publicKey', async (request, reply) => {
      const { publicKey } = request.params as { publicKey: string };
      const card = this.agentRegistry.get(publicKey);
      if (!card) {
        reply.code(404);
        return { error: 'Agent not found' };
      }
      return { agentCard: card };
    });
  }

  /**
   * Handle WebSocket connection
   */
  private handleConnection(socket: WebSocket): void {
    const agentId = uuidv4();
    let publicKey: string | null = null;

    socket.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'register') {
          const { publicKey: claimedPublicKey, agentCard, signature, timestamp } = msg;

          // Verify signature to prevent impersonation
          // Signature should be: sign(publicKey + timestamp + agentCardHash)
          if (claimedPublicKey && signature && timestamp) {
            const messageToVerify = `${claimedPublicKey}:${timestamp}:${JSON.stringify(agentCard)}`;
            const isValid = await this.verifySignature(
              messageToVerify,
              signature,
              claimedPublicKey
            );

            if (!isValid) {
              socket.send(JSON.stringify({
                type: 'error',
                error: 'Invalid signature - registration rejected',
              }));
              return;
            }

            // Check timestamp is within 5 minutes to prevent replay attacks
            const now = Date.now();
            if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
              socket.send(JSON.stringify({
                type: 'error',
                error: 'Timestamp expired - registration rejected',
              }));
              return;
            }

            publicKey = claimedPublicKey;
            this.agents.set(claimedPublicKey, {
              id: agentId,
              publicKey: claimedPublicKey,
              socket,
              agentCard,
              connectedAt: Date.now(),
            });

            this.agentRegistry.set(claimedPublicKey, agentCard);
            console.log(`Agent registered: ${claimedPublicKey}`);

            // Deliver queued messages
            this.deliverQueuedMessages(claimedPublicKey);

            socket.send(JSON.stringify({ type: 'registered', agentId }));
          } else {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Missing required fields for registration',
            }));
          }
        } else if (msg.type === 'message' && publicKey) {
          this.routeMessage(msg.to, msg.message, publicKey);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        socket.send(JSON.stringify({
          type: 'error',
          error: 'Internal server error',
        }));
      }
    });

    socket.on('close', () => {
      if (publicKey) {
        this.agents.delete(publicKey);
        console.log(`Agent disconnected: ${publicKey}`);
      }
    });
  }

  /**
   * Verify Ed25519 signature
   */
  private async verifySignature(
    message: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Buffer.from(signature, 'hex');
      const publicKeyBytes = Buffer.from(publicKey, 'hex');

      return await ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
    } catch {
      return false;
    }
  }

  /**
   * Route message to recipient
   */
  private routeMessage(to: string, message: A2AMessage, from: string): void {
    const recipient = this.agents.get(to);

    if (recipient && recipient.socket.readyState === 1) {
      // Recipient is online, deliver immediately
      recipient.socket.send(JSON.stringify({
        type: 'message',
        from,
        message,
        timestamp: Date.now(),
      }));
    } else {
      // Recipient is offline, queue the message
      this.queueMessage(to, message, from);
    }
  }

  /**
   * Queue message for offline recipient
   */
  private queueMessage(to: string, message: A2AMessage, from: string): void {
    if (!this.messageQueue.has(to)) {
      this.messageQueue.set(to, []);
    }

    const queue = this.messageQueue.get(to)!;

    // Check queue size limit
    if (queue.length >= this.config.maxQueueSize) {
      // Remove oldest message
      queue.shift();
    }

    queue.push({
      id: uuidv4(),
      from,
      to,
      message,
      timestamp: Date.now(),
      delivered: false,
    });
  }

  /**
   * Deliver queued messages to newly connected agent
   */
  private deliverQueuedMessages(publicKey: string): void {
    const queue = this.messageQueue.get(publicKey);
    if (!queue || queue.length === 0) return;

    const agent = this.agents.get(publicKey);
    if (!agent || agent.socket.readyState !== 1) return;

    for (const queued of queue) {
      if (!queued.delivered) {
        agent.socket.send(JSON.stringify({
          type: 'message',
          from: queued.from,
          message: queued.message,
          timestamp: queued.timestamp,
          queued: true,
        }));
        queued.delivered = true;
      }
    }

    // Clean up delivered messages older than retention period
    this.cleanupQueue(publicKey);
  }

  /**
   * Clean up old messages from queue
   */
  private cleanupQueue(publicKey: string): void {
    const queue = this.messageQueue.get(publicKey);
    if (!queue) return;

    const cutoff = Date.now() - this.config.messageRetentionMs;
    const filtered = queue.filter(
      (msg) => !msg.delivered || msg.timestamp > cutoff
    );
    this.messageQueue.set(publicKey, filtered);
  }

  /**
   * Handle JSON-RPC request
   */
  private async handleJSONRPC(request: { method: string; params?: any; id?: string | number }): Promise<any> {
    const { method, params, id } = request;

    switch (method) {
      case 'message/send': {
        const { to, message, from } = params;
        this.routeMessage(to, message, from);
        return { jsonrpc: '2.0', result: { delivered: true }, id };
      }

      case 'agent/list': {
        const agents = Array.from(this.agentRegistry.values());
        return { jsonrpc: '2.0', result: { agents }, id };
      }

      case 'agent/get': {
        const { publicKey } = params;
        const card = this.agentRegistry.get(publicKey);
        return { jsonrpc: '2.0', result: { agentCard: card ?? null }, id };
      }

      case 'queue/get': {
        const { publicKey } = params;
        const queue = this.messageQueue.get(publicKey) ?? [];
        return { jsonrpc: '2.0', result: { queue }, id };
      }

      default:
        return {
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        };
    }
  }

  /**
   * Get connected agents
   */
  getConnectedAgents(): ConnectedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent registry
   */
  getAgentRegistry(): Map<string, AgentCard> {
    return this.agentRegistry;
  }
}
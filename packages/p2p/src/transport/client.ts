/**
 * A2A Client
 * Client for connecting to A2A agents and relay servers
 */

import WebSocket from 'ws';
import type { AgentCard, A2AMessage } from '@clawchat/core';
import { IdentityManager } from '@clawchat/core';
import { RATE_LIMITS } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

interface A2AClientConfig {
  relayUrl?: string;
  agentCard: AgentCard;
  publicKey: string;
  privateKey: string;
  connectTimeout?: number;
  maxReconnectAttempts?: number;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
    warn: (msg: string) => void;
    debug: (msg: string) => void;
  };
}

interface MessageCallback {
  (from: string, message: A2AMessage, timestamp: number): void;
}

interface ConnectionChangeCallback {
  (connected: boolean): void;
}

// ============================================
// A2A Client
// ============================================

export class A2AClient {
  private config: A2AClientConfig;
  private ws: WebSocket | null = null;
  private messageCallbacks: Set<MessageCallback> = new Set();
  private connected: boolean = false;
  private agentId: string | null = null;
  private connectTimeout: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect: boolean = false;
  private connectionChangeCallbacks: Set<ConnectionChangeCallback> = new Set();
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;
  private log: {
    info: (msg: string) => void;
    error: (msg: string, err?: unknown) => void;
    warn: (msg: string) => void;
    debug: (msg: string) => void;
  };

  constructor(config: A2AClientConfig) {
    this.config = config;
    this.connectTimeout = config.connectTimeout ?? 10000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 3;
    this.log = config.logger ?? {
      info: (msg: string) => console.log(`[A2AClient] ${msg}`),
      error: (msg: string, err?: unknown) => console.error(`[A2AClient] ${msg}`, err),
      warn: (msg: string) => console.warn(`[A2AClient] ${msg}`),
      debug: (msg: string) => console.debug(`[A2AClient] ${msg}`),
    };
  }

  /**
   * Connect to relay server
   */
  async connect(): Promise<void> {
    if (!this.config.relayUrl) {
      throw new Error('Relay URL not configured');
    }

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    return new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;

      // Set up connection timeout
      const timeoutHandle = setTimeout(() => {
        if (this.connectReject && !this.connected) {
          this.ws?.close();
          this.connectReject(new Error('Connection timeout'));
          this.connectResolve = null;
          this.connectReject = null;
        }
      }, this.connectTimeout);

      this.ws = new WebSocket(this.config.relayUrl!);

      this.ws.on('open', async () => {
        clearTimeout(timeoutHandle);

        try {
          // Generate signature for registration
          const timestamp = Date.now();
          const messageToSign = `${this.config.publicKey}:${timestamp}:${JSON.stringify(this.config.agentCard)}`;
          let signature: string | undefined;

          try {
            const manager = new IdentityManager();
            await manager.loadKeypair(this.config.privateKey);
            signature = await manager.sign(messageToSign);
          } catch {
            // Signing failed, send without signature (backward compat)
            this.log.warn('Failed to generate signature, continuing without signature');
          }

          // Register with relay
          this.ws!.send(JSON.stringify({
            type: 'register',
            publicKey: this.config.publicKey,
            agentCard: this.config.agentCard,
            timestamp,
            signature,
          }));
        } catch (error) {
          if (this.connectReject) {
            this.connectReject(error as Error);
            this.connectResolve = null;
            this.connectReject = null;
          }
        }
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'registered') {
            this.agentId = msg.agentId;
            this.connected = true;
            this.reconnectAttempts = 0;
            this.notifyConnectionChange(true);
            if (this.connectResolve) {
              this.connectResolve();
              this.connectResolve = null;
              this.connectReject = null;
            }
          } else if (msg.type === 'message') {
            this.handleIncomingMessage(msg);
          } else if (msg.type === 'error') {
            this.log.error(`Relay error: ${msg.error}`);
          }
        } catch (error) {
          this.log.error('Error parsing message', error);
        }
      });

      this.ws.on('error', (error) => {
        // Only reject if promise is still pending (not already resolved)
        if (this.connectReject && !this.connected) {
          clearTimeout(timeoutHandle);
          this.connectReject(error);
          this.connectResolve = null;
          this.connectReject = null;
        } else {
          this.log.error('WebSocket error', error);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.notifyConnectionChange(false);

        // Trigger auto-reconnect if not intentional
        if (!this.intentionalDisconnect) {
          this.attemptReconnect();
        }

        this.agentId = null;
      });
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || this.intentionalDisconnect) {
      this.log.warn(`Reconnect stopped. Attempts: ${this.reconnectAttempts}, Max: ${this.maxReconnectAttempts}, Intentional: ${this.intentionalDisconnect}`);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000); // 1s, 2s, 4s, max 8s
    this.log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }

  /**
   * Disconnect from relay server
   */
  disconnect(): void {
    this.intentionalDisconnect = true;

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.agentId = null;
    this.notifyConnectionChange(false);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if currently reconnecting
   */
  isReconnecting(): boolean {
    return this.reconnectTimer !== null || (this.reconnectAttempts > 0 && !this.connected);
  }

  /**
   * Register callback for connection state changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionChangeCallbacks.add(callback);
    return () => this.connectionChangeCallbacks.delete(callback);
  }

  /**
   * Notify all connection change callbacks
   */
  private notifyConnectionChange(connected: boolean): void {
    for (const callback of this.connectionChangeCallbacks) {
      try {
        callback(connected);
      } catch (error) {
        this.log.error('Connection change callback error', error);
      }
    }
  }

  /**
   * Send message to another agent
   */
  async sendMessage(to: string, message: A2AMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to relay');
    }

    // Input validation
    if (!message.parts || message.parts.length === 0) {
      throw new Error('Message must have at least one part');
    }

    const payload = JSON.stringify({
      type: 'message',
      to,
      message,
    });

    if (payload.length > RATE_LIMITS.MAX_MESSAGE_SIZE) {
      throw new Error(`Message too large: ${payload.length} bytes (max ${RATE_LIMITS.MAX_MESSAGE_SIZE})`);
    }

    this.ws!.send(payload);
  }

  /**
   * Send text message to another agent
   */
  async sendText(to: string, text: string): Promise<void> {
    const message: A2AMessage = {
      role: 'agent',
      parts: [{ type: 'text', text }],
      contextId: uuidv4(),
      timestamp: Date.now(),
    };

    return this.sendMessage(to, message);
  }

  /**
   * Register callback for incoming messages
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  /**
   * Handle incoming message
   */
  private handleIncomingMessage(msg: { from: string; message: A2AMessage; timestamp: number }): void {
    for (const callback of this.messageCallbacks) {
      callback(msg.from, msg.message, msg.timestamp);
    }
  }

  /**
   * Discover agents on relay
   */
  async discoverAgents(): Promise<AgentCard[]> {
    if (!this.config.relayUrl) {
      throw new Error('Relay URL not configured');
    }

    const httpUrl = this.config.relayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const response = await fetch(`${httpUrl}/agents`);
    const data = await response.json() as { agents: AgentCard[] };
    return data.agents;
  }

  /**
   * Get agent card for a specific agent
   */
  async getAgentCard(publicKey: string): Promise<AgentCard | null> {
    if (!this.config.relayUrl) {
      throw new Error('Relay URL not configured');
    }

    const httpUrl = this.config.relayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const response = await fetch(`${httpUrl}/agents/${publicKey}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as { agentCard: AgentCard };
    return data.agentCard;
  }

  /**
   * Get agent ID
   */
  getAgentId(): string | null {
    return this.agentId;
  }
}

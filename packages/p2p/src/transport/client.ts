/**
 * A2A Client
 * Client for connecting to A2A agents and relay servers
 */

import WebSocket from 'ws';
import type { AgentCard, A2AMessage } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

interface A2AClientConfig {
  relayUrl?: string;
  agentCard: AgentCard;
  publicKey: string;
  privateKey: string;
}

interface MessageCallback {
  (from: string, message: A2AMessage, timestamp: number): void;
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

  constructor(config: A2AClientConfig) {
    this.config = config;
  }

  /**
   * Connect to relay server
   */
  async connect(): Promise<void> {
    if (!this.config.relayUrl) {
      throw new Error('Relay URL not configured');
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.relayUrl!);

      this.ws.on('open', () => {
        // Register with relay
        this.ws!.send(JSON.stringify({
          type: 'register',
          publicKey: this.config.publicKey,
          agentCard: this.config.agentCard,
        }));
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'registered') {
            this.agentId = msg.agentId;
            this.connected = true;
            resolve();
          } else if (msg.type === 'message') {
            this.handleIncomingMessage(msg);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.agentId = null;
      });
    });
  }

  /**
   * Disconnect from relay server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.agentId = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send message to another agent
   */
  async sendMessage(to: string, message: A2AMessage): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to relay');
    }

    this.ws!.send(JSON.stringify({
      type: 'message',
      to,
      message,
    }));
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
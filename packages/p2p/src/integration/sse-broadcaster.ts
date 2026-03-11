/**
 * SSE Event Broadcaster
 * Pushes intervention events to human participants via Server-Sent Events
 */

import type { ServerResponse } from 'http';
import type { IncomingMessage } from 'http';
import type { InterventionEvent, InterventionSession } from '@clawchat/core';

// ============================================
// Types
// ============================================

export interface SSEClient {
  id: string;
  conversationId: string;
  participantId: string;
  res: ServerResponse;
  lastEventId: number;
  connectedAt: number;
}

export interface SSEEvent {
  id?: number;
  event?: string;
  data: unknown;
  retry?: number;
}

export interface SSEBroadcasterConfig {
  heartbeatInterval: number;
  retryDelay: number;
  maxClients: number;
}

export type SSEConnectionHandler = (client: SSEClient) => void;
export type SSEDisconnectionHandler = (client: SSEClient, reason: string) => void;

// ============================================
// SSE Broadcaster
// ============================================

export class SSEBroadcaster {
  private clients: Map<string, SSEClient> = new Map();
  private eventCounter: number = 0;
  private config: SSEBroadcasterConfig;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private onConnection?: SSEConnectionHandler;
  private onDisconnection?: SSEDisconnectionHandler;

  constructor(config: Partial<SSEBroadcasterConfig> = {}) {
    this.config = {
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      retryDelay: config.retryDelay ?? 3000,
      maxClients: config.maxClients ?? 1000,
    };
  }

  /**
   * Set connection handler
   */
  onConnect(handler: SSEConnectionHandler): void {
    this.onConnection = handler;
  }

  /**
   * Set disconnection handler
   */
  onDisconnect(handler: SSEDisconnectionHandler): void {
    this.onDisconnection = handler;
  }

  /**
   * Handle SSE connection upgrade
   */
  handleConnection(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
    participantId: string
  ): SSEClient | null {
    // Check max clients
    if (this.clients.size >= this.config.maxClients) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Max clients reached' }));
      return null;
    }

    // Generate client ID
    const clientId = `${conversationId}:${participantId}:${Date.now()}`;

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
    });

    // Send retry delay
    res.write(`retry: ${this.config.retryDelay}\n\n`);

    // Create client
    const client: SSEClient = {
      id: clientId,
      conversationId,
      participantId,
      res,
      lastEventId: 0,
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, client);

    // Handle disconnect
    req.on('close', () => {
      this.disconnect(clientId, 'client_closed');
    });

    req.on('error', (error) => {
      this.disconnect(clientId, `error: ${error.message}`);
    });

    // Notify connection
    if (this.onConnection) {
      this.onConnection(client);
    }

    // Send initial connection event
    this.sendToClient(client, {
      event: 'connected',
      data: {
        clientId,
        conversationId,
        participantId,
        timestamp: Date.now(),
      },
    });

    return client;
  }

  /**
   * Disconnect a client
   */
  disconnect(clientId: string, reason: string = 'server_disconnect'): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    this.clients.delete(clientId);

    try {
      client.res.end();
    } catch {
      // Ignore errors on close
    }

    if (this.onDisconnection) {
      this.onDisconnection(client, reason);
    }

    return true;
  }

  /**
   * Send event to specific client
   */
  sendToClient(client: SSEClient, event: SSEEvent): boolean {
    try {
      const eventId = event.id ?? ++this.eventCounter;
      let message = `id: ${eventId}\n`;

      if (event.event) {
        message += `event: ${event.event}\n`;
      }

      if (event.retry) {
        message += `retry: ${event.retry}\n`;
      }

      message += `data: ${JSON.stringify(event.data)}\n\n`;

      client.res.write(message);
      client.lastEventId = eventId;

      return true;
    } catch {
      this.disconnect(client.id, 'write_failed');
      return false;
    }
  }

  /**
   * Broadcast event to all clients in a conversation
   */
  broadcastToConversation(conversationId: string, event: SSEEvent): number {
    let sent = 0;
    const eventId = event.id ?? ++this.eventCounter;

    for (const client of this.clients.values()) {
      if (client.conversationId === conversationId) {
        if (this.sendToClient(client, { ...event, id: eventId })) {
          sent++;
        }
      }
    }

    return sent;
  }

  /**
   * Broadcast intervention event
   */
  broadcastInterventionEvent(conversationId: string, interventionEvent: InterventionEvent): number {
    return this.broadcastToConversation(conversationId, {
      event: interventionEvent.type,
      data: {
        conversationId: interventionEvent.conversationId,
        sessionId: interventionEvent.sessionId,
        data: interventionEvent.data,
        timestamp: interventionEvent.timestamp,
      },
    });
  }

  /**
   * Send intervention request notification
   */
  notifyInterventionRequest(
    conversationId: string,
    session: InterventionSession,
    reason: string
  ): void {
    const clients = this.getClientsByParticipant(conversationId, session.humanParticipantId);

    for (const client of clients) {
      this.sendToClient(client, {
        event: 'intervention_required',
        data: {
          conversationId,
          sessionId: session.id,
          role: session.role,
          reason,
          interventionCount: session.interventionCount,
          timestamp: Date.now(),
        },
      });
    }
  }

  /**
   * Send conversation state update
   */
  notifyStateChange(
    conversationId: string,
    state: string,
    metadata?: Record<string, unknown>
  ): void {
    this.broadcastToConversation(conversationId, {
      event: 'state_changed',
      data: {
        conversationId,
        state,
        ...metadata,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Send message notification
   */
  notifyMessage(conversationId: string, message: unknown): void {
    this.broadcastToConversation(conversationId, {
      event: 'message',
      data: message,
    });
  }

  /**
   * Send hook trigger notification
   */
  notifyHookTrigger(
    conversationId: string,
    hookPoint: string,
    data: unknown
  ): void {
    this.broadcastToConversation(conversationId, {
      event: 'hook_triggered',
      data: {
        hookPoint,
        data,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Get clients for a conversation
   */
  getClientsForConversation(conversationId: string): SSEClient[] {
    return Array.from(this.clients.values()).filter(
      (c) => c.conversationId === conversationId
    );
  }

  /**
   * Get clients by participant ID
   */
  getClientsByParticipant(conversationId: string, participantId: string): SSEClient[] {
    return Array.from(this.clients.values()).filter(
      (c) => c.conversationId === conversationId && c.participantId === participantId
    );
  }

  /**
   * Start heartbeat to keep connections alive
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      const comment = `: heartbeat ${Date.now()}\n\n`;
      for (const client of this.clients.values()) {
        try {
          client.res.write(comment);
        } catch {
          this.disconnect(client.id, 'heartbeat_failed');
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Get broadcaster stats
   */
  getStats(): {
    totalClients: number;
    conversations: number;
    oldestConnection: number | null;
  } {
    const conversations = new Set<string>();
    let oldest: number | null = null;

    for (const client of this.clients.values()) {
      conversations.add(client.conversationId);
      if (oldest === null || client.connectedAt < oldest) {
        oldest = client.connectedAt;
      }
    }

    return {
      totalClients: this.clients.size,
      conversations: conversations.size,
      oldestConnection: oldest,
    };
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(reason: string = 'server_shutdown'): void {
    for (const clientId of this.clients.keys()) {
      this.disconnect(clientId, reason);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHeartbeat();
    this.disconnectAll('destroyed');
  }
}
/**
 * A2A Server Human Intervention Integration
 * Integrates human intervention capabilities into A2A server
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { A2AMessage, JSONRPCResponse } from '@clawchat/core';
import {
  InterventionManager,
  type InterventionEvent,
  type InterventionSession,
  type InterventionRequest,
  type InterventionResult,
  type GuidedConversationConfig,
} from '@clawchat/core';
import { A2AServer } from '../jsonrpc/server.js';
import { InterventionRouter, type AgentConnection } from '../intervention/router.js';
import { SSEBroadcaster, type SSEClient } from './sse-broadcaster.js';
import {
  InterventionJSONRPCProcessor,
  INTERVENTION_METHODS,
  type InterventionMethodHandlers,
  type InterventionJSONRPCRequest,
  type JoinParams,
  type JoinResult,
  type LeaveParams,
  type LeaveResult,
  type SendParams,
  type SendResult,
  type StateChangeParams,
  type StateChangeResult,
  type CreateConversationParams,
  type CreateConversationResult,
} from './jsonrpc-methods.js';

// ============================================
// Types
// ============================================

export interface A2AInterventionConfig {
  enableIntervention: boolean;
  defaultRole: 'observer' | 'participant' | 'moderator' | 'admin';
  maxParticipantsPerConversation: number;
  interventionCooldown: number;
  autoPauseOnConflict: boolean;
  sseHeartbeatInterval: number;
}

export interface AgentRegistry {
  getAgents(conversationId: string): Promise<AgentConnection[]>;
  sendMessage(agentId: string, message: A2AMessage): Promise<void>;
}

// ============================================
// A2A Integration Server
// ============================================

export class A2AIntegationServer {
  private manager: InterventionManager;
  private router: InterventionRouter;
  private sse: SSEBroadcaster;
  private jsonrpc: InterventionJSONRPCProcessor;
  private a2aServer: A2AServer;
  private agentRegistry?: AgentRegistry;
  private config: A2AInterventionConfig;

  constructor(config: Partial<A2AInterventionConfig> = {}) {
    this.config = {
      enableIntervention: config.enableIntervention ?? true,
      defaultRole: config.defaultRole ?? 'participant',
      maxParticipantsPerConversation: config.maxParticipantsPerConversation ?? 5,
      interventionCooldown: config.interventionCooldown ?? 1000,
      autoPauseOnConflict: config.autoPauseOnConflict ?? true,
      sseHeartbeatInterval: config.sseHeartbeatInterval ?? 30000,
    };

    // Initialize components
    this.manager = new InterventionManager();
    this.router = new InterventionRouter(this.manager);
    this.sse = new SSEBroadcaster({
      heartbeatInterval: this.config.sseHeartbeatInterval,
    });
    this.jsonrpc = new InterventionJSONRPCProcessor();
    this.a2aServer = new A2AServer();

    // Setup integrations
    this.setupRouterCallbacks();
    this.setupEventForwarding();
    this.setupJSONRPCHandlers();
    this.setupSSEHandlers();
  }

  /**
   * Set agent registry for routing
   */
  setAgentRegistry(registry: AgentRegistry): void {
    this.agentRegistry = registry;
    this.router.onGetAgents(async (conversationId) => {
      return registry.getAgents(conversationId);
    });
    this.router.onSendMessage(async (agentId, message) => {
      await registry.sendMessage(agentId, message);
    });
  }

  /**
   * Setup router callbacks
   */
  private setupRouterCallbacks(): void {
    this.router.onSendMessage(async (agentId, message) => {
      // This will be overridden by setAgentRegistry
      console.log(`[Router] Sending message to agent ${agentId}`);
    });

    this.router.onGetAgents(async (conversationId) => {
      // This will be overridden by setAgentRegistry
      return [];
    });
  }

  /**
   * Forward intervention events to SSE clients
   */
  private setupEventForwarding(): void {
    this.manager.subscribe((event: InterventionEvent) => {
      this.sse.broadcastInterventionEvent(event.conversationId, event);

      // Handle specific events
      if (event.type === 'state_changed') {
        const state = event.data?.state as string | undefined;
        if (state) {
          this.sse.notifyStateChange(event.conversationId, state, event.data);
        }
      }
    });
  }

  /**
   * Setup JSON-RPC method handlers
   */
  private setupJSONRPCHandlers(): void {
    const handlers: InterventionMethodHandlers = {
      // Session management
      onJoin: async (params: JoinParams): Promise<JoinResult> => {
        const session = this.manager.joinConversation(
          params.conversationId,
          params.participantId,
          params.role,
          params.customPermissions
        );

        if (!session) {
          return { success: false, error: 'Failed to join conversation' };
        }

        return { success: true, session };
      },

      onLeave: async (params: LeaveParams): Promise<LeaveResult> => {
        const success = this.manager.leaveConversation(
          params.conversationId,
          params.sessionId
        );
        return { success, error: success ? undefined : 'Failed to leave conversation' };
      },

      onListSessions: async (params: { conversationId: string }) => {
        return this.manager.getSessions(params.conversationId);
      },

      // Intervention actions
      onSend: async (params: SendParams): Promise<SendResult> => {
        return this.manager.requestIntervention({
          conversationId: params.conversationId,
          participantId: params.participantId,
          action: params.action,
          content: params.content,
          targetAgentId: params.targetAgentId,
          metadata: params.metadata,
        });
      },

      onPause: async (params: StateChangeParams): Promise<StateChangeResult> => {
        const convState = this.manager.getConversationState(params.conversationId);
        const previousState = convState?.state ?? 'unknown';

        const result = await this.manager.requestIntervention({
          conversationId: params.conversationId,
          participantId: params.participantId,
          action: 'pause',
          content: params.reason,
        });

        return {
          success: result.success,
          previousState,
          newState: result.success ? 'paused' : previousState,
          timestamp: result.timestamp,
          error: result.message,
        };
      },

      onResume: async (params: StateChangeParams): Promise<StateChangeResult> => {
        const convState = this.manager.getConversationState(params.conversationId);
        const previousState = convState?.state ?? 'unknown';

        const result = await this.manager.requestIntervention({
          conversationId: params.conversationId,
          participantId: params.participantId,
          action: 'resume',
        });

        return {
          success: result.success,
          previousState,
          newState: result.success ? 'active' : previousState,
          timestamp: result.timestamp,
          error: result.message,
        };
      },

      onTerminate: async (params: StateChangeParams): Promise<StateChangeResult> => {
        const convState = this.manager.getConversationState(params.conversationId);
        const previousState = convState?.state ?? 'unknown';

        const result = await this.manager.requestIntervention({
          conversationId: params.conversationId,
          participantId: params.participantId,
          action: 'terminate',
          content: params.reason,
        });

        return {
          success: result.success,
          previousState,
          newState: result.success ? 'terminated' : previousState,
          timestamp: result.timestamp,
          error: result.message,
        };
      },

      onRedirect: async (params: StateChangeParams & { direction: string }): Promise<StateChangeResult> => {
        const convState = this.manager.getConversationState(params.conversationId);
        const previousState = convState?.state ?? 'unknown';

        const result = await this.manager.requestIntervention({
          conversationId: params.conversationId,
          participantId: params.participantId,
          action: 'redirect',
          content: params.direction,
        });

        return {
          success: result.success,
          previousState,
          newState: result.success ? 'redirected' : previousState,
          timestamp: result.timestamp,
          error: result.message,
        };
      },

      // Conversation management
      onCreateConversation: async (params: CreateConversationParams): Promise<CreateConversationResult> => {
        const state = this.manager.createConversation(params);
        return {
          success: true,
          conversationId: state.conversationId,
        };
      },

      onGetConversation: async (params: { conversationId: string }) => {
        const state = this.manager.getConversationState(params.conversationId);
        if (!state) return null;

        return {
          conversationId: state.conversationId,
          state: state.state,
          messageCount: state.messages.length,
          sessionCount: state.sessions.size,
          pendingCount: state.pendingInterventions.length,
        };
      },

      onListConversations: async () => {
        return this.manager.getActiveConversations();
      },

      onEndConversation: async (params: { conversationId: string }) => {
        const success = this.manager.endConversation(params.conversationId);
        return { success };
      },

      // Query methods
      onGetPending: async (params: { conversationId: string }) => {
        return this.manager.getPendingInterventions(params.conversationId);
      },

      onGetHistory: async (params: { conversationId: string }) => {
        return this.manager.getMessages(params.conversationId);
      },

      onGetState: async (params: { conversationId: string }) => {
        const state = this.manager.getConversationState(params.conversationId);
        if (!state) return null;

        return {
          conversationId: state.conversationId,
          state: state.state,
          pausedAt: state.pausedAt,
          pausedBy: state.pausedBy,
          config: state.config,
        };
      },
    };

    this.jsonrpc.setHandlers(handlers);
  }

  /**
   * Setup SSE connection handlers
   */
  private setupSSEHandlers(): void {
    this.sse.onConnect((client: SSEClient) => {
      console.log(`[SSE] Client connected: ${client.id}`);

      // Send current conversation state
      const state = this.manager.getConversationState(client.conversationId);
      if (state) {
        this.sse.sendToClient(client, {
          event: 'conversation_state',
          data: {
            conversationId: state.conversationId,
            state: state.state,
            messageCount: state.messages.length,
          },
        });
      }
    });

    this.sse.onDisconnect((client: SSEClient, reason: string) => {
      console.log(`[SSE] Client disconnected: ${client.id} (${reason})`);
    });
  }

  /**
   * Handle HTTP request
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // SSE endpoint for real-time events
    if (method === 'GET' && url.startsWith('/intervention/events/')) {
      await this.handleSSEConnection(req, res, url);
      return;
    }

    // JSON-RPC for intervention methods
    if (method === 'POST' && url === '/intervention') {
      await this.handleInterventionJSONRPC(req, res);
      return;
    }

    // Delegate to A2A server for standard methods
    await this.a2aServer.handleRequest(req, res);
  }

  /**
   * Handle SSE connection
   */
  private async handleSSEConnection(
    req: IncomingMessage,
    res: ServerResponse,
    url: string
  ): Promise<void> {
    // Extract conversation and participant from URL
    // Format: /intervention/events/{conversationId}/{participantId}
    const parts = url.replace('/intervention/events/', '').split('/');
    if (parts.length < 2) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid SSE URL format' }));
      return;
    }

    const [conversationId, participantId] = parts;

    // Verify conversation exists
    const state = this.manager.getConversationState(conversationId);
    if (!state) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Conversation not found' }));
      return;
    }

    // Create SSE connection
    this.sse.handleConnection(req, res, conversationId, participantId);
  }

  /**
   * Handle intervention JSON-RPC request
   */
  private async handleInterventionJSONRPC(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      const request = JSON.parse(body) as InterventionJSONRPCRequest;

      // Check if it's an intervention method
      if (this.jsonrpc.isInterventionMethod(request.method)) {
        const response = await this.jsonrpc.processRequest(request);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        return;
      }

      // Unknown method
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not found: ${request.method}` },
        id: request.id ?? null,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      };
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    }
  }

  // ============================================
  // Public API Methods
  // ============================================

  /**
   * Create a new guided conversation
   */
  createConversation(config: GuidedConversationConfig): string {
    const state = this.manager.createConversation(config);
    return state.conversationId;
  }

  /**
   * Process hook trigger from agent conversation
   */
  async processHook(
    conversationId: string,
    hookPoint: 'before_message_send' | 'after_message_receive' | 'before_task_start' | 'after_task_complete' | 'on_error' | 'on_decision_point',
    data: unknown
  ): Promise<boolean> {
    const requiresPause = await this.router.processHook(conversationId, hookPoint, data);

    if (requiresPause) {
      // Notify human participants
      this.sse.notifyHookTrigger(conversationId, hookPoint, data);

      const sessions = this.manager.getSessions(conversationId);
      for (const session of sessions) {
        this.sse.notifyInterventionRequest(
          conversationId,
          session,
          `Hook triggered: ${hookPoint}`
        );
      }
    }

    return requiresPause;
  }

  /**
   * Handle agent message (for hook processing)
   */
  async handleAgentMessage(
    conversationId: string,
    agentId: string,
    message: A2AMessage
  ): Promise<void> {
    // Check for hooks
    await this.processHook(conversationId, 'after_message_receive', { agentId, message });

    // Route to router for intervention handling
    this.router.handleAgentResponse(conversationId, agentId, message);

    // Notify SSE clients
    this.sse.notifyMessage(conversationId, {
      agentId,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Get intervention manager (for advanced usage)
   */
  getManager(): InterventionManager {
    return this.manager;
  }

  /**
   * Get intervention router
   */
  getRouter(): InterventionRouter {
    return this.router;
  }

  /**
   * Get SSE broadcaster
   */
  getSSEBroadcaster(): SSEBroadcaster {
    return this.sse;
  }

  /**
   * Get A2A server
   */
  getA2AServer(): A2AServer {
    return this.a2aServer;
  }

  /**
   * Get server stats
   */
  getStats(): {
    conversations: number;
    activeClients: number;
    pendingInterventions: number;
  } {
    const sseStats = this.sse.getStats();
    const activeConvs = this.manager.getActiveConversations();

    let totalPending = 0;
    for (const convId of activeConvs) {
      totalPending += this.manager.getPendingInterventions(convId).length;
    }

    return {
      conversations: activeConvs.length,
      activeClients: sseStats.totalClients,
      pendingInterventions: totalPending,
    };
  }

  /**
   * Start heartbeat for SSE connections
   */
  startHeartbeat(): void {
    this.sse.startHeartbeat();
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    this.sse.stopHeartbeat();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.sse.destroy();
    this.router.clearPendingResponses();
  }
}
/**
 * Intervention Router
 * Routes human interventions to appropriate agents in conversations
 */

import type { A2AMessage, A2ATask } from '@clawchat/core';
import {
  type InterventionRequest,
  type InterventionResult,
  type InterventionAction,
  type ConversationInterventionState,
  InterventionManager,
} from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface AgentConnection {
  agentId: string;
  endpoint: string;
  capabilities: string[];
  lastSeen: number;
}

export interface RoutingRule {
  action: InterventionAction;
  targetSelector: 'all' | 'originator' | 'specific' | 'capability';
  targetCapability?: string;
  priority: number;
}

export interface InterventionRouterConfig {
  broadcastInterventions: boolean;
  defaultRoutingRules: RoutingRule[];
  timeout: number;
  retryAttempts: number;
}

export type InterventionCallback = (
  agentId: string,
  message: A2AMessage
) => Promise<void>;

export type AgentQueryCallback = (
  conversationId: string
) => Promise<AgentConnection[]>;

// ============================================
// Default Routing Rules
// ============================================

const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  { action: 'send_message', targetSelector: 'all', priority: 10 },
  { action: 'request_clarification', targetSelector: 'originator', priority: 20 },
  { action: 'redirect', targetSelector: 'all', priority: 30 },
  { action: 'pause', targetSelector: 'all', priority: 40 },
  { action: 'resume', targetSelector: 'all', priority: 50 },
  { action: 'terminate', targetSelector: 'all', priority: 60 },
  { action: 'approve', targetSelector: 'originator', priority: 70 },
  { action: 'reject', targetSelector: 'originator', priority: 80 },
  { action: 'delegate', targetSelector: 'specific', priority: 90 },
];

// ============================================
// Intervention Router
// ============================================

export class InterventionRouter {
  private manager: InterventionManager;
  private config: InterventionRouterConfig;
  private sendMessageCallback?: InterventionCallback;
  private getAgentsCallback?: AgentQueryCallback;
  private pendingResponses: Map<string, {
    request: InterventionRequest;
    resolve: (result: InterventionResult) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();

  constructor(
    manager: InterventionManager,
    config: Partial<InterventionRouterConfig> = {}
  ) {
    this.manager = manager;
    this.config = {
      broadcastInterventions: config.broadcastInterventions ?? true,
      defaultRoutingRules: config.defaultRoutingRules ?? DEFAULT_ROUTING_RULES,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
    };
  }

  /**
   * Set callback for sending messages to agents
   */
  onSendMessage(callback: InterventionCallback): void {
    this.sendMessageCallback = callback;
  }

  /**
   * Set callback for querying agents in a conversation
   */
  onGetAgents(callback: AgentQueryCallback): void {
    this.getAgentsCallback = callback;
  }

  /**
   * Route an intervention request to appropriate agents
   */
  async routeIntervention(request: InterventionRequest): Promise<InterventionResult> {
    // Check conversation state
    const convState = this.manager.getConversationState(request.conversationId);
    if (!convState) {
      return this.createErrorResult(request, 'Conversation not found');
    }

    // Check if conversation allows intervention
    if (convState.state === 'terminated') {
      return this.createErrorResult(request, 'Conversation has been terminated');
    }

    // Get target agents
    const targetAgents = await this.getTargetAgents(request);
    if (targetAgents.length === 0) {
      return this.createErrorResult(request, 'No target agents found');
    }

    // Create intervention message
    const interventionMessage = this.createInterventionMessage(request);

    // Route to each target agent
    const results: Promise<void>[] = [];
    for (const agent of targetAgents) {
      if (this.sendMessageCallback) {
        results.push(
          this.sendWithRetry(agent.agentId, interventionMessage)
        );
      }
    }

    // Wait for all sends to complete
    try {
      await Promise.all(results);
    } catch (error) {
      return this.createErrorResult(
        request,
        `Failed to route to some agents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Update conversation messages
    this.manager.addMessage(request.conversationId, interventionMessage);

    return {
      requestId: request.id,
      success: true,
      action: request.action,
      message: `Intervention routed to ${targetAgents.length} agent(s)`,
      affectedAgents: targetAgents.map((a) => a.agentId),
      timestamp: Date.now(),
    };
  }

  /**
   * Get target agents based on routing rules
   */
  private async getTargetAgents(request: InterventionRequest): Promise<AgentConnection[]> {
    if (!this.getAgentsCallback) {
      return [];
    }

    const allAgents = await this.getAgentsCallback(request.conversationId);

    // Find matching routing rule
    const rule = this.config.defaultRoutingRules.find(
      (r) => r.action === request.action
    );

    if (!rule) {
      return allAgents;
    }

    switch (rule.targetSelector) {
      case 'all':
        return allAgents;

      case 'originator':
        // Return the agent that sent the last message
        const messages = this.manager.getMessages(request.conversationId);
        const lastAgentMessage = [...messages].reverse().find(
          (m) => m.role === 'agent'
        );
        if (lastAgentMessage) {
          const originator = allAgents.find(
            (a) => a.agentId === request.targetAgentId
          );
          return originator ? [originator] : allAgents.slice(0, 1);
        }
        return allAgents.slice(0, 1);

      case 'specific':
        if (request.targetAgentId) {
          const specific = allAgents.find(
            (a) => a.agentId === request.targetAgentId
          );
          return specific ? [specific] : [];
        }
        return [];

      case 'capability':
        if (rule.targetCapability) {
          return allAgents.filter((a) =>
            a.capabilities.includes(rule.targetCapability!)
          );
        }
        return allAgents;

      default:
        return allAgents;
    }
  }

  /**
   * Create A2A message from intervention request
   */
  private createInterventionMessage(request: InterventionRequest): A2AMessage {
    const content = request.content ?? '';

    return {
      role: 'user',
      parts: [
        {
          type: 'data',
          data: {
            interventionType: request.action,
            content,
            timestamp: request.timestamp,
            metadata: request.metadata,
          },
        },
        {
          type: 'text',
          text: this.formatInterventionText(request),
        },
      ],
      contextId: request.conversationId,
      timestamp: Date.now(),
    };
  }

  /**
   * Format intervention as human-readable text
   */
  private formatInterventionText(request: InterventionRequest): string {
    const actionDescriptions: Record<InterventionAction, string> = {
      send_message: 'Human message',
      request_clarification: 'Clarification requested',
      redirect: 'Conversation redirected',
      pause: 'Conversation paused',
      resume: 'Conversation resumed',
      terminate: 'Conversation terminated',
      approve: 'Action approved',
      reject: 'Action rejected',
      delegate: 'Decision delegated',
    };

    const description = actionDescriptions[request.action] ?? 'Intervention';
    const content = request.content ? `: ${request.content}` : '';

    return `[Human Intervention] ${description}${content}`;
  }

  /**
   * Send message with retry logic
   */
  private async sendWithRetry(
    agentId: string,
    message: A2AMessage,
    attempt: number = 1
  ): Promise<void> {
    if (!this.sendMessageCallback) {
      return;
    }

    try {
      await this.sendMessageCallback(agentId, message);
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        return this.sendWithRetry(agentId, message, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Create error result
   */
  private createErrorResult(
    request: InterventionRequest,
    message: string
  ): InterventionResult {
    return {
      requestId: request.id,
      success: false,
      action: request.action,
      message,
      timestamp: Date.now(),
    };
  }

  // ============================================
  // Hook Integration
  // ============================================

  /**
   * Process a hook trigger from the conversation
   */
  async processHook(
    conversationId: string,
    hookPoint: string,
    data: unknown
  ): Promise<boolean> {
    const shouldPause = this.manager.shouldTriggerHook(
      conversationId,
      hookPoint as 'before_message_send' | 'after_message_receive' | 'before_task_start' | 'after_task_complete' | 'on_error' | 'on_decision_point'
    );

    if (shouldPause.trigger && shouldPause.requireResponse) {
      // Pause conversation and wait for human input
      const sessions = this.manager.getSessions(conversationId);

      // Notify all human participants
      for (const session of sessions) {
        // In a real implementation, this would send a notification
        // to the human participant via WebSocket, SSE, or other means
        console.log(`Notifying ${session.humanParticipantId} of hook trigger: ${hookPoint}`);
      }

      return true; // Indicates pause required
    }

    return false; // No pause required
  }

  /**
   * Handle agent response to intervention
   */
  handleAgentResponse(
    conversationId: string,
    agentId: string,
    response: A2AMessage
  ): void {
    // Add response to conversation history
    this.manager.addMessage(conversationId, response);

    // Check if this resolves any pending interventions
    const pending = this.manager.getPendingInterventions(conversationId);
    for (const request of pending) {
      if (request.action === 'request_clarification') {
        // Mark as resolved if agent responded
        const convState = this.manager.getConversationState(conversationId);
        if (convState) {
          const idx = convState.pendingInterventions.findIndex(
            (r) => r.id === request.id
          );
          if (idx >= 0) {
            convState.pendingInterventions.splice(idx, 1);
          }
        }
      }
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get routing statistics
   */
  getStats(): {
    pendingResponses: number;
    activeConversations: number;
  } {
    return {
      pendingResponses: this.pendingResponses.size,
      activeConversations: this.manager.getActiveConversations().length,
    };
  }

  /**
   * Clear all pending responses (cleanup)
   */
  clearPendingResponses(): void {
    for (const [id, { timeout }] of this.pendingResponses) {
      clearTimeout(timeout);
    }
    this.pendingResponses.clear();
  }
}
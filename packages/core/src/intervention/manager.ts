/**
 * Human Intervention Manager
 * Manages human participation in agent conversations
 */

import type { A2AMessage } from '../types/a2a.js';
import { v4 as uuidv4 } from 'uuid';
import {
  type InterventionRole,
  type InterventionAction,
  type InterventionPermission,
  type InterventionRequest,
  type InterventionResult,
  type InterventionSession,
  type InterventionEvent,
  type ConversationInterventionState,
  type GuidedConversationConfig,
  type InterventionHook,
  type HookPoint,
  DEFAULT_PERMISSIONS,
} from './types.js';

// ============================================
// Types
// ============================================

export type InterventionEventHandler = (event: InterventionEvent) => void;

export interface ConversationState {
  conversationId: string;
  state: ConversationInterventionState;
  sessions: Map<string, InterventionSession>;
  messages: A2AMessage[];
  pendingInterventions: InterventionRequest[];
  config: GuidedConversationConfig;
  pausedAt?: number;
  pausedBy?: string;
}

// ============================================
// Intervention Manager
// ============================================

export class InterventionManager {
  private conversations: Map<string, ConversationState> = new Map();
  private eventHandlers: Set<InterventionEventHandler> = new Set();
  private globalHooks: Map<HookPoint, InterventionHook> = new Map();

  /**
   * Create a new guided conversation
   */
  createConversation(config: GuidedConversationConfig): ConversationState {
    const state: ConversationState = {
      conversationId: config.conversationId,
      state: 'active',
      sessions: new Map(),
      messages: [],
      pendingInterventions: [],
      config,
    };

    this.conversations.set(config.conversationId, state);
    this.emitEvent({
      type: 'state_changed',
      conversationId: config.conversationId,
      data: { state: 'active' },
      timestamp: Date.now(),
    });

    return state;
  }

  /**
   * Join a conversation as a human participant
   */
  joinConversation(
    conversationId: string,
    humanParticipantId: string,
    role: InterventionRole = 'participant',
    customPermissions?: Partial<InterventionPermission>
  ): InterventionSession | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return null;
    }

    // Check max participants
    if (conversation.sessions.size >= conversation.config.maxParticipants) {
      return null;
    }

    const permissions: InterventionPermission = {
      ...DEFAULT_PERMISSIONS[role],
      ...customPermissions,
    };

    const session: InterventionSession = {
      id: uuidv4(),
      conversationId,
      humanParticipantId,
      role,
      permissions,
      state: 'active',
      interventionCount: 0,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    conversation.sessions.set(session.id, session);

    this.emitEvent({
      type: 'session_joined',
      conversationId,
      sessionId: session.id,
      data: { humanParticipantId, role },
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Leave a conversation
   */
  leaveConversation(conversationId: string, sessionId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    const session = conversation.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    conversation.sessions.delete(sessionId);

    // If this was the pausing user, resume
    if (conversation.pausedBy === sessionId) {
      conversation.state = 'active';
      conversation.pausedAt = undefined;
      conversation.pausedBy = undefined;
      this.emitEvent({
        type: 'state_changed',
        conversationId,
        data: { state: 'active' },
        timestamp: Date.now(),
      });
    }

    this.emitEvent({
      type: 'session_left',
      conversationId,
      sessionId,
      data: { humanParticipantId: session.humanParticipantId },
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Request an intervention
   */
  async requestIntervention(request: Omit<InterventionRequest, 'id' | 'timestamp'>): Promise<InterventionResult> {
    const conversation = this.conversations.get(request.conversationId);
    if (!conversation) {
      return this.createErrorResult('', request.action, 'Conversation not found');
    }

    const session = Array.from(conversation.sessions.values()).find(
      (s) => s.humanParticipantId === request.participantId
    );
    if (!session) {
      return this.createErrorResult('', request.action, 'Not a participant in this conversation');
    }

    // Check cooldown
    if (conversation.config.interventionCooldown > 0) {
      const timeSinceLastActive = Date.now() - session.lastActiveAt;
      if (timeSinceLastActive < conversation.config.interventionCooldown) {
        return this.createErrorResult('', request.action, 'Intervention cooldown not elapsed');
      }
    }

    // Check permissions
    if (!session.permissions.actions.includes(request.action)) {
      return this.createErrorResult('', request.action, 'Action not permitted');
    }

    // Check max interventions
    if (session.permissions.maxInterventions !== undefined) {
      if (session.interventionCount >= session.permissions.maxInterventions) {
        return this.createErrorResult('', request.action, 'Max interventions reached');
      }
    }

    const fullRequest: InterventionRequest = {
      ...request,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    // Process the intervention
    const result = await this.applyIntervention(conversation, session, fullRequest);

    // Update session
    session.lastActiveAt = Date.now();
    if (result.success) {
      session.interventionCount++;
    }

    this.emitEvent({
      type: 'intervention_applied',
      conversationId: request.conversationId,
      sessionId: session.id,
      data: { request: fullRequest, result },
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Apply an intervention to a conversation
   */
  private async applyIntervention(
    conversation: ConversationState,
    session: InterventionSession,
    request: InterventionRequest
  ): Promise<InterventionResult> {
    const baseResult: Omit<InterventionResult, 'timestamp'> = {
      requestId: request.id,
      success: false,
      action: request.action,
    };

    switch (request.action) {
      case 'send_message': {
        // Create human message
        const humanMessage: A2AMessage = {
          role: 'user',
          parts: [{ type: 'text', text: request.content ?? '' }],
          contextId: conversation.conversationId,
          timestamp: Date.now(),
        };
        conversation.messages.push(humanMessage);
        return {
          ...baseResult,
          success: true,
          message: 'Message sent',
          affectedAgents: [], // Will be filled by router
          timestamp: Date.now(),
        };
      }

      case 'pause': {
        if (conversation.state !== 'active') {
          return {
            ...baseResult,
            message: 'Can only pause active conversations',
            timestamp: Date.now(),
          };
        }
        conversation.state = 'paused';
        conversation.pausedAt = Date.now();
        conversation.pausedBy = session.id;
        this.emitEvent({
          type: 'state_changed',
          conversationId: conversation.conversationId,
          data: { state: 'paused', by: session.humanParticipantId },
          timestamp: Date.now(),
        });
        return {
          ...baseResult,
          success: true,
          message: 'Conversation paused',
          timestamp: Date.now(),
        };
      }

      case 'resume': {
        if (conversation.state !== 'paused') {
          return {
            ...baseResult,
            message: 'Can only resume paused conversations',
            timestamp: Date.now(),
          };
        }
        conversation.state = 'active';
        conversation.pausedAt = undefined;
        conversation.pausedBy = undefined;
        this.emitEvent({
          type: 'state_changed',
          conversationId: conversation.conversationId,
          data: { state: 'active' },
          timestamp: Date.now(),
        });
        return {
          ...baseResult,
          success: true,
          message: 'Conversation resumed',
          timestamp: Date.now(),
        };
      }

      case 'terminate': {
        conversation.state = 'terminated';
        this.emitEvent({
          type: 'state_changed',
          conversationId: conversation.conversationId,
          data: { state: 'terminated', by: session.humanParticipantId },
          timestamp: Date.now(),
        });
        return {
          ...baseResult,
          success: true,
          message: 'Conversation terminated',
          timestamp: Date.now(),
        };
      }

      case 'redirect': {
        conversation.state = 'redirected';
        this.emitEvent({
          type: 'state_changed',
          conversationId: conversation.conversationId,
          data: { state: 'redirected', direction: request.content },
          timestamp: Date.now(),
        });
        // Reset to active after redirect
        setTimeout(() => {
          if (conversation.state === 'redirected') {
            conversation.state = 'active';
          }
        }, 100);
        return {
          ...baseResult,
          success: true,
          message: 'Conversation redirected',
          timestamp: Date.now(),
        };
      }

      case 'request_clarification': {
        // Add clarification request to pending
        conversation.pendingInterventions.push(request);
        return {
          ...baseResult,
          success: true,
          message: 'Clarification requested',
          affectedAgents: request.targetAgentId ? [request.targetAgentId] : [],
          timestamp: Date.now(),
        };
      }

      case 'approve':
      case 'reject':
      case 'delegate': {
        return {
          ...baseResult,
          success: true,
          message: `Action ${request.action} recorded`,
          timestamp: Date.now(),
        };
      }

      default:
        return {
          ...baseResult,
          message: 'Unknown action',
          timestamp: Date.now(),
        };
    }
  }

  /**
   * Create error result
   */
  private createErrorResult(
    requestId: string,
    action: InterventionAction,
    message: string
  ): InterventionResult {
    return {
      requestId,
      success: false,
      action,
      message,
      timestamp: Date.now(),
    };
  }

  // ============================================
  // Hook System
  // ============================================

  /**
   * Set a global hook for intervention points
   */
  setHook(point: HookPoint, hook: InterventionHook): void {
    this.globalHooks.set(point, hook);
  }

  /**
   * Check if a hook should trigger intervention
   */
  shouldTriggerHook(
    conversationId: string,
    point: HookPoint
  ): { trigger: boolean; requireResponse: boolean; timeout?: number } {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !conversation.config.enableIntervention) {
      return { trigger: false, requireResponse: false };
    }

    // Check conversation-specific hooks
    const configHook = conversation.config.hooks?.find((h) => h.point === point);
    if (configHook && configHook.enabled) {
      return {
        trigger: true,
        requireResponse: configHook.requireHumanResponse,
        timeout: configHook.timeout,
      };
    }

    // Check global hooks
    const globalHook = this.globalHooks.get(point);
    if (globalHook && globalHook.enabled) {
      return {
        trigger: true,
        requireResponse: globalHook.requireHumanResponse,
        timeout: globalHook.timeout,
      };
    }

    return { trigger: false, requireResponse: false };
  }

  /**
   * Add message to conversation history
   */
  addMessage(conversationId: string, message: A2AMessage): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.messages.push(message);
    }
  }

  // ============================================
  // Query Methods
  // ============================================

  /**
   * Get conversation state
   */
  getConversationState(conversationId: string): ConversationState | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get all sessions for a conversation
   */
  getSessions(conversationId: string): InterventionSession[] {
    const conversation = this.conversations.get(conversationId);
    return conversation ? Array.from(conversation.sessions.values()) : [];
  }

  /**
   * Get conversation messages
   */
  getMessages(conversationId: string): A2AMessage[] {
    const conversation = this.conversations.get(conversationId);
    return conversation ? [...conversation.messages] : [];
  }

  /**
   * Check if conversation is active
   */
  isConversationActive(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    return conversation?.state === 'active';
  }

  /**
   * Check if conversation is paused
   */
  isConversationPaused(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    return conversation?.state === 'paused';
  }

  /**
   * Get pending interventions
   */
  getPendingInterventions(conversationId: string): InterventionRequest[] {
    const conversation = this.conversations.get(conversationId);
    return conversation ? [...conversation.pendingInterventions] : [];
  }

  // ============================================
  // Event System
  // ============================================

  /**
   * Subscribe to intervention events
   */
  subscribe(handler: InterventionEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all subscribers
   */
  private emitEvent(event: InterventionEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * End a conversation and clean up
   */
  endConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    conversation.state = 'terminated';
    this.emitEvent({
      type: 'state_changed',
      conversationId,
      data: { state: 'terminated' },
      timestamp: Date.now(),
    });

    // Keep the conversation for history, but remove active sessions
    conversation.sessions.clear();

    return true;
  }

  /**
   * Remove a conversation entirely
   */
  deleteConversation(conversationId: string): boolean {
    return this.conversations.delete(conversationId);
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): string[] {
    return Array.from(this.conversations.entries())
      .filter(([_, conv]) => conv.state !== 'terminated')
      .map(([id]) => id);
  }
}
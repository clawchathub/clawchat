/**
 * JSON-RPC Methods for Human Intervention
 * Extends A2A protocol with intervention-specific methods
 */

import type { JSONRPCResponse } from '@clawchat/core';
import {
  type InterventionAction,
  type InterventionRequest,
  type InterventionResult,
  type InterventionSession,
  type InterventionRole,
  type InterventionPermission,
  type GuidedConversationConfig,
} from '@clawchat/core';

// ============================================
// Intervention JSON-RPC Request Type
// ============================================

export interface InterventionJSONRPCRequest {
  jsonrpc: '2.0';
  method: InterventionMethod;
  params?: Record<string, unknown>;
  id?: string | number;
}

export type InterventionMethod = typeof INTERVENTION_METHODS[keyof typeof INTERVENTION_METHODS];

// ============================================
// JSON-RPC Method Names
// ============================================

export const INTERVENTION_METHODS = {
  // Session management
  JOIN: 'intervention/join',
  LEAVE: 'intervention/leave',
  GET_SESSION: 'intervention/session/get',
  LIST_SESSIONS: 'intervention/session/list',

  // Intervention actions
  SEND: 'intervention/send',
  PAUSE: 'intervention/pause',
  RESUME: 'intervention/resume',
  TERMINATE: 'intervention/terminate',
  REDIRECT: 'intervention/redirect',
  REQUEST_CLARIFICATION: 'intervention/clarification',
  APPROVE: 'intervention/approve',
  REJECT: 'intervention/reject',
  DELEGATE: 'intervention/delegate',

  // Conversation management
  CREATE_CONVERSATION: 'intervention/conversation/create',
  GET_CONVERSATION: 'intervention/conversation/get',
  LIST_CONVERSATIONS: 'intervention/conversation/list',
  END_CONVERSATION: 'intervention/conversation/end',

  // Query methods
  GET_PENDING: 'intervention/pending',
  GET_HISTORY: 'intervention/history',
  GET_STATE: 'intervention/state',
} as const;

// ============================================
// Request/Response Types
// ============================================

const INTERVENTION_ROLES: InterventionRole[] = ['observer', 'participant', 'moderator', 'admin'];
const INTERVENTION_ACTIONS: InterventionAction[] = [
  'send_message', 'request_clarification', 'redirect', 'pause', 'resume',
  'terminate', 'approve', 'reject', 'delegate'
];

// Join conversation
export interface JoinParams {
  conversationId: string;
  participantId: string;
  role?: InterventionRole;
  customPermissions?: Partial<InterventionPermission> & { role: InterventionRole; actions: InterventionAction[] };
}

export interface JoinResult {
  success: boolean;
  session?: InterventionSession;
  error?: string;
}

// Leave conversation
export interface LeaveParams {
  conversationId: string;
  sessionId: string;
}

export interface LeaveResult {
  success: boolean;
  error?: string;
}

// Send intervention
export interface SendParams {
  conversationId: string;
  participantId: string;
  action: InterventionAction;
  content?: string;
  targetAgentId?: string;
  metadata?: Record<string, unknown>;
}

export type SendResult = InterventionResult;

// Pause/Resume params
export interface StateChangeParams {
  conversationId: string;
  participantId: string;
  reason?: string;
}

export interface StateChangeResult {
  success: boolean;
  previousState: string;
  newState: string;
  timestamp: number;
  error?: string;
}

// Create conversation
export type CreateConversationParams = GuidedConversationConfig;

export interface CreateConversationResult {
  success: boolean;
  conversationId: string;
  error?: string;
}

// Get pending interventions
export interface GetPendingParams {
  conversationId: string;
}

// ============================================
// Validation Helpers
// ============================================

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} must be a string`);
  }
  return value;
}

function assertOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} must be a string`);
  }
  return value;
}

function assertInterventionRole(value: unknown): InterventionRole {
  if (typeof value !== 'string' || !INTERVENTION_ROLES.includes(value as InterventionRole)) {
    throw new ValidationError(`Invalid intervention role`);
  }
  return value as InterventionRole;
}

function assertInterventionAction(value: unknown): InterventionAction {
  if (typeof value !== 'string' || !INTERVENTION_ACTIONS.includes(value as InterventionAction)) {
    throw new ValidationError(`Invalid intervention action`);
  }
  return value as InterventionAction;
}

function assertObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseJoinParams(params: unknown): JoinParams {
  const obj = assertObject(params, 'params');
  return {
    conversationId: assertString(obj.conversationId, 'conversationId'),
    participantId: assertString(obj.participantId, 'participantId'),
    role: obj.role ? assertInterventionRole(obj.role) : 'participant',
    customPermissions: obj.customPermissions ? parseCustomPermissions(obj.customPermissions) : undefined,
  };
}

function parseCustomPermissions(value: unknown): Partial<InterventionPermission> & { role: InterventionRole; actions: InterventionAction[] } {
  const obj = assertObject(value, 'customPermissions');
  const actions = obj.actions;
  if (!Array.isArray(actions)) {
    throw new ValidationError('actions must be an array');
  }
  return {
    role: assertInterventionRole(obj.role),
    actions: actions.map(a => assertInterventionAction(a)),
    maxInterventions: typeof obj.maxInterventions === 'number' ? obj.maxInterventions : undefined,
    requireApproval: typeof obj.requireApproval === 'boolean' ? obj.requireApproval : undefined,
  };
}

function parseLeaveParams(params: unknown): LeaveParams {
  const obj = assertObject(params, 'params');
  return {
    conversationId: assertString(obj.conversationId, 'conversationId'),
    sessionId: assertString(obj.sessionId, 'sessionId'),
  };
}

function parseSendParams(params: unknown): SendParams {
  const obj = assertObject(params, 'params');
  return {
    conversationId: assertString(obj.conversationId, 'conversationId'),
    participantId: assertString(obj.participantId, 'participantId'),
    action: assertInterventionAction(obj.action),
    content: assertOptionalString(obj.content, 'content'),
    targetAgentId: assertOptionalString(obj.targetAgentId, 'targetAgentId'),
    metadata: obj.metadata && typeof obj.metadata === 'object' ? obj.metadata as Record<string, unknown> : undefined,
  };
}

function parseStateChangeParams(params: unknown): StateChangeParams {
  const obj = assertObject(params, 'params');
  return {
    conversationId: assertString(obj.conversationId, 'conversationId'),
    participantId: assertString(obj.participantId, 'participantId'),
    reason: assertOptionalString(obj.reason, 'reason'),
  };
}

function parseRedirectParams(params: unknown): StateChangeParams & { direction: string } {
  const obj = assertObject(params, 'params');
  return {
    conversationId: assertString(obj.conversationId, 'conversationId'),
    participantId: assertString(obj.participantId, 'participantId'),
    direction: assertString(obj.direction, 'direction'),
    reason: assertOptionalString(obj.reason, 'reason'),
  };
}

function parseDelegateParams(params: unknown): SendParams & { delegateTo: string } {
  const obj = assertObject(params, 'params');
  return {
    conversationId: assertString(obj.conversationId, 'conversationId'),
    participantId: assertString(obj.participantId, 'participantId'),
    delegateTo: assertString(obj.delegateTo, 'delegateTo'),
    content: assertOptionalString(obj.content, 'content'),
  } as SendParams & { delegateTo: string };
}

function parseConversationIdParams(params: unknown): { conversationId: string } {
  const obj = assertObject(params, 'params');
  return { conversationId: assertString(obj.conversationId, 'conversationId') };
}

function parseSessionIdParams(params: unknown): { sessionId: string } {
  const obj = assertObject(params, 'params');
  return { sessionId: assertString(obj.sessionId, 'sessionId') };
}

function parseCreateConversationParams(params: unknown): CreateConversationParams {
  const obj = assertObject(params, 'params');
  return {
    conversationId: assertString(obj.conversationId, 'conversationId'),
    enableIntervention: typeof obj.enableIntervention === 'boolean' ? obj.enableIntervention : true,
    defaultRole: obj.defaultRole ? assertInterventionRole(obj.defaultRole) : 'participant',
    maxParticipants: typeof obj.maxParticipants === 'number' ? obj.maxParticipants : 5,
    interventionCooldown: typeof obj.interventionCooldown === 'number' ? obj.interventionCooldown : 1000,
    autoPauseOnConflict: typeof obj.autoPauseOnConflict === 'boolean' ? obj.autoPauseOnConflict : true,
    hooks: Array.isArray(obj.hooks) ? obj.hooks : undefined,
  };
}

// ============================================
// Method Handler Types
// ============================================

export type MethodHandler<TParams = unknown, TResult = unknown> = (
  params: TParams
) => Promise<TResult>;

export interface InterventionMethodHandlers {
  // Session management
  onJoin?: MethodHandler<JoinParams, JoinResult>;
  onLeave?: MethodHandler<LeaveParams, LeaveResult>;
  onGetSession?: MethodHandler<{ sessionId: string }, InterventionSession | null>;
  onListSessions?: MethodHandler<{ conversationId: string }, InterventionSession[]>;

  // Intervention actions
  onSend?: MethodHandler<SendParams, SendResult>;
  onPause?: MethodHandler<StateChangeParams, StateChangeResult>;
  onResume?: MethodHandler<StateChangeParams, StateChangeResult>;
  onTerminate?: MethodHandler<StateChangeParams, StateChangeResult>;
  onRedirect?: MethodHandler<StateChangeParams & { direction: string }, StateChangeResult>;
  onRequestClarification?: MethodHandler<SendParams, SendResult>;
  onApprove?: MethodHandler<SendParams, SendResult>;
  onReject?: MethodHandler<SendParams, SendResult>;
  onDelegate?: MethodHandler<SendParams & { delegateTo: string }, SendResult>;

  // Conversation management
  onCreateConversation?: MethodHandler<CreateConversationParams, CreateConversationResult>;
  onGetConversation?: MethodHandler<{ conversationId: string }, unknown>;
  onListConversations?: MethodHandler<Record<string, never>, string[]>;
  onEndConversation?: MethodHandler<{ conversationId: string }, { success: boolean }>;

  // Query methods
  onGetPending?: MethodHandler<GetPendingParams, InterventionRequest[]>;
  onGetHistory?: MethodHandler<{ conversationId: string }, unknown[]>;
  onGetState?: MethodHandler<{ conversationId: string }, unknown>;
}

// ============================================
// JSON-RPC Method Processor
// ============================================

export class InterventionJSONRPCProcessor {
  private handlers: InterventionMethodHandlers = {};

  /**
   * Set method handlers
   */
  setHandlers(handlers: InterventionMethodHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Check if method is an intervention method
   */
  isInterventionMethod(method: string): boolean {
    return Object.values(INTERVENTION_METHODS).includes(method as InterventionMethod);
  }

  /**
   * Process a JSON-RPC request
   */
  async processRequest(request: InterventionJSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      const result = await this.dispatchMethod(request.method, request.params);

      return {
        jsonrpc: '2.0',
        result,
        id: request.id ?? null,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Invalid params',
            data: { message: error.message },
          },
          id: request.id ?? null,
        };
      }

      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
        id: request.id ?? null,
      };
    }
  }

  /**
   * Dispatch method to appropriate handler
   */
  private async dispatchMethod(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      // Session management
      case INTERVENTION_METHODS.JOIN:
        return this.handleJoin(params);

      case INTERVENTION_METHODS.LEAVE:
        return this.handleLeave(params);

      case INTERVENTION_METHODS.GET_SESSION:
        return this.handleGetSession(params);

      case INTERVENTION_METHODS.LIST_SESSIONS:
        return this.handleListSessions(params);

      // Intervention actions
      case INTERVENTION_METHODS.SEND:
        return this.handleSend(params);

      case INTERVENTION_METHODS.PAUSE:
        return this.handlePause(params);

      case INTERVENTION_METHODS.RESUME:
        return this.handleResume(params);

      case INTERVENTION_METHODS.TERMINATE:
        return this.handleTerminate(params);

      case INTERVENTION_METHODS.REDIRECT:
        return this.handleRedirect(params);

      case INTERVENTION_METHODS.REQUEST_CLARIFICATION:
        return this.handleRequestClarification(params);

      case INTERVENTION_METHODS.APPROVE:
        return this.handleApprove(params);

      case INTERVENTION_METHODS.REJECT:
        return this.handleReject(params);

      case INTERVENTION_METHODS.DELEGATE:
        return this.handleDelegate(params);

      // Conversation management
      case INTERVENTION_METHODS.CREATE_CONVERSATION:
        return this.handleCreateConversation(params);

      case INTERVENTION_METHODS.GET_CONVERSATION:
        return this.handleGetConversation(params);

      case INTERVENTION_METHODS.LIST_CONVERSATIONS:
        return this.handleListConversations(params);

      case INTERVENTION_METHODS.END_CONVERSATION:
        return this.handleEndConversation(params);

      // Query methods
      case INTERVENTION_METHODS.GET_PENDING:
        return this.handleGetPending(params);

      case INTERVENTION_METHODS.GET_HISTORY:
        return this.handleGetHistory(params);

      case INTERVENTION_METHODS.GET_STATE:
        return this.handleGetState(params);

      default:
        throw new Error(`Unknown intervention method: ${method}`);
    }
  }

  // ============================================
  // Session Handlers
  // ============================================

  private async handleJoin(params: unknown): Promise<JoinResult> {
    const parsed = parseJoinParams(params);
    if (this.handlers.onJoin) {
      return this.handlers.onJoin(parsed);
    }
    return { success: false, error: 'Handler not configured' };
  }

  private async handleLeave(params: unknown): Promise<LeaveResult> {
    const parsed = parseLeaveParams(params);
    if (this.handlers.onLeave) {
      return this.handlers.onLeave(parsed);
    }
    return { success: false, error: 'Handler not configured' };
  }

  private async handleGetSession(params: unknown): Promise<InterventionSession | null> {
    const parsed = parseSessionIdParams(params);
    if (this.handlers.onGetSession) {
      return this.handlers.onGetSession(parsed);
    }
    return null;
  }

  private async handleListSessions(params: unknown): Promise<InterventionSession[]> {
    const parsed = parseConversationIdParams(params);
    if (this.handlers.onListSessions) {
      return this.handlers.onListSessions(parsed);
    }
    return [];
  }

  // ============================================
  // Intervention Action Handlers
  // ============================================

  private async handleSend(params: unknown): Promise<SendResult> {
    const parsed = parseSendParams(params);
    if (this.handlers.onSend) {
      return this.handlers.onSend(parsed);
    }
    return {
      requestId: '',
      success: false,
      action: parsed.action,
      message: 'Handler not configured',
      timestamp: Date.now(),
    };
  }

  private async handlePause(params: unknown): Promise<StateChangeResult> {
    const parsed = parseStateChangeParams(params);
    if (this.handlers.onPause) {
      return this.handlers.onPause(parsed);
    }
    return {
      success: false,
      previousState: 'unknown',
      newState: 'unknown',
      timestamp: Date.now(),
      error: 'Handler not configured',
    };
  }

  private async handleResume(params: unknown): Promise<StateChangeResult> {
    const parsed = parseStateChangeParams(params);
    if (this.handlers.onResume) {
      return this.handlers.onResume(parsed);
    }
    return {
      success: false,
      previousState: 'unknown',
      newState: 'unknown',
      timestamp: Date.now(),
      error: 'Handler not configured',
    };
  }

  private async handleTerminate(params: unknown): Promise<StateChangeResult> {
    const parsed = parseStateChangeParams(params);
    if (this.handlers.onTerminate) {
      return this.handlers.onTerminate(parsed);
    }
    return {
      success: false,
      previousState: 'unknown',
      newState: 'unknown',
      timestamp: Date.now(),
      error: 'Handler not configured',
    };
  }

  private async handleRedirect(params: unknown): Promise<StateChangeResult> {
    const parsed = parseRedirectParams(params);
    if (this.handlers.onRedirect) {
      return this.handlers.onRedirect(parsed);
    }
    return {
      success: false,
      previousState: 'unknown',
      newState: 'unknown',
      timestamp: Date.now(),
      error: 'Handler not configured',
    };
  }

  private async handleRequestClarification(params: unknown): Promise<SendResult> {
    const parsed = parseSendParams(params);
    if (this.handlers.onRequestClarification) {
      return this.handlers.onRequestClarification(parsed);
    }
    return {
      requestId: '',
      success: false,
      action: 'request_clarification',
      message: 'Handler not configured',
      timestamp: Date.now(),
    };
  }

  private async handleApprove(params: unknown): Promise<SendResult> {
    const parsed = parseSendParams(params);
    if (this.handlers.onApprove) {
      return this.handlers.onApprove(parsed);
    }
    return {
      requestId: '',
      success: false,
      action: 'approve',
      message: 'Handler not configured',
      timestamp: Date.now(),
    };
  }

  private async handleReject(params: unknown): Promise<SendResult> {
    const parsed = parseSendParams(params);
    if (this.handlers.onReject) {
      return this.handlers.onReject(parsed);
    }
    return {
      requestId: '',
      success: false,
      action: 'reject',
      message: 'Handler not configured',
      timestamp: Date.now(),
    };
  }

  private async handleDelegate(params: unknown): Promise<SendResult> {
    const parsed = parseDelegateParams(params);
    if (this.handlers.onDelegate) {
      return this.handlers.onDelegate(parsed);
    }
    return {
      requestId: '',
      success: false,
      action: 'delegate',
      message: 'Handler not configured',
      timestamp: Date.now(),
    };
  }

  // ============================================
  // Conversation Handlers
  // ============================================

  private async handleCreateConversation(params: unknown): Promise<CreateConversationResult> {
    const parsed = parseCreateConversationParams(params);
    if (this.handlers.onCreateConversation) {
      return this.handlers.onCreateConversation(parsed);
    }
    return { success: false, conversationId: '', error: 'Handler not configured' };
  }

  private async handleGetConversation(params: unknown): Promise<unknown> {
    const parsed = parseConversationIdParams(params);
    if (this.handlers.onGetConversation) {
      return this.handlers.onGetConversation(parsed);
    }
    return null;
  }

  private async handleListConversations(params: unknown): Promise<string[]> {
    if (this.handlers.onListConversations) {
      return this.handlers.onListConversations(params as Record<string, never>);
    }
    return [];
  }

  private async handleEndConversation(params: unknown): Promise<{ success: boolean }> {
    const parsed = parseConversationIdParams(params);
    if (this.handlers.onEndConversation) {
      return this.handlers.onEndConversation(parsed);
    }
    return { success: false };
  }

  // ============================================
  // Query Handlers
  // ============================================

  private async handleGetPending(params: unknown): Promise<InterventionRequest[]> {
    const parsed = parseConversationIdParams(params);
    if (this.handlers.onGetPending) {
      return this.handlers.onGetPending(parsed);
    }
    return [];
  }

  private async handleGetHistory(params: unknown): Promise<unknown[]> {
    const parsed = parseConversationIdParams(params);
    if (this.handlers.onGetHistory) {
      return this.handlers.onGetHistory(parsed);
    }
    return [];
  }

  private async handleGetState(params: unknown): Promise<unknown> {
    const parsed = parseConversationIdParams(params);
    if (this.handlers.onGetState) {
      return this.handlers.onGetState(parsed);
    }
    return null;
  }
}

// ============================================
// Helper: Create JSON-RPC Request
// ============================================

export function createInterventionRequest(
  method: InterventionMethod,
  params?: Record<string, unknown>,
  id?: string | number
): InterventionJSONRPCRequest {
  return {
    jsonrpc: '2.0',
    method,
    params,
    id: id ?? Date.now(),
  };
}
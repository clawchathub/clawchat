/**
 * Types for Human Intervention UI Components
 */

import type { A2AMessage } from '@clawchat/core';

// Re-export types from core for convenience
export type { InterventionSession } from '@clawchat/core';

// Local UI-specific types
export type InterventionRole = 'observer' | 'participant' | 'moderator' | 'admin';

export type InterventionAction =
  | 'send_message'
  | 'request_clarification'
  | 'redirect'
  | 'pause'
  | 'resume'
  | 'terminate'
  | 'approve'
  | 'reject'
  | 'delegate';

export type ConversationInterventionState =
  | 'active'
  | 'paused'
  | 'pending_approval'
  | 'redirected'
  | 'terminated';

export interface DisplayMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderType: 'agent' | 'human';
  content: string;
  timestamp: number;
  isHuman?: boolean;
}

export interface InterventionState {
  conversationId: string;
  state: 'active' | 'paused' | 'pending_approval' | 'redirected' | 'terminated';
  role: 'observer' | 'participant' | 'moderator' | 'admin';
  availableActions: InterventionAction[];
  messages: DisplayMessage[];
  participants: Participant[];
  isConnected: boolean;
  isConnecting: boolean;
  error?: string;
}

export interface Participant {
  id: string;
  name: string;
  type: 'agent' | 'human';
  role?: string;
  isOnline: boolean;
}

export interface InterventionConfig {
  conversationId: string;
  participantId: string;
  role: InterventionRole;
  serverUrl?: string;
  useSSE?: boolean;
}

/**
 * Convert A2AMessage to DisplayMessage for UI
 */
export function toDisplayMessage(message: A2AMessage, index: number): DisplayMessage {
  const textPart = message.parts.find(p => p.type === 'text');
  const content = textPart && 'text' in textPart ? textPart.text : '';

  return {
    id: `${message.contextId}-${index}-${message.timestamp}`,
    senderId: message.role === 'user' ? 'human' : 'agent',
    senderName: message.role === 'user' ? 'You' : 'Agent',
    senderType: message.role === 'user' ? 'human' : 'agent',
    content,
    timestamp: message.timestamp || Date.now(),
    isHuman: message.role === 'user',
  };
}

/**
 * Role-based action permissions
 */
export const ROLE_PERMISSIONS: Record<InterventionRole, InterventionAction[]> = {
  observer: [],
  participant: ['send_message', 'request_clarification'],
  moderator: [
    'send_message',
    'request_clarification',
    'redirect',
    'pause',
    'resume',
    'approve',
    'reject',
    'delegate',
  ],
  admin: [
    'send_message',
    'request_clarification',
    'redirect',
    'pause',
    'resume',
    'terminate',
    'approve',
    'reject',
    'delegate',
  ],
};
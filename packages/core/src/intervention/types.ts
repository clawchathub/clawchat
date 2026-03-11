/**
 * Human Intervention Types
 * Allows humans to participate in and guide conversations between AI agents (Claws)
 */

import { z } from 'zod';

// ============================================
// Intervention Roles
// ============================================

export const InterventionRoleSchema = z.enum([
  'observer',    // Can view but not intervene
  'participant', // Can send messages
  'moderator',   // Can guide, pause, and redirect conversations
  'admin',       // Full control including termination
]);
export type InterventionRole = z.infer<typeof InterventionRoleSchema>;

// ============================================
// Intervention Actions
// ============================================

export const InterventionActionSchema = z.enum([
  'send_message',      // Send a message to the conversation
  'request_clarification', // Ask agents for clarification
  'redirect',          // Change conversation direction
  'pause',             // Pause the conversation
  'resume',            // Resume a paused conversation
  'terminate',         // End the conversation
  'approve',           // Approve a proposed action
  'reject',            // Reject a proposed action
  'delegate',          // Delegate decision to an agent
]);
export type InterventionAction = z.infer<typeof InterventionActionSchema>;

// ============================================
// Intervention Permission
// ============================================

export const InterventionPermissionSchema = z.object({
  role: InterventionRoleSchema,
  actions: z.array(InterventionActionSchema),
  maxInterventions: z.number().optional(), // Max interventions per conversation
  requireApproval: z.boolean().optional(), // Whether interventions need approval
  allowedContexts: z.array(z.string()).optional(), // Allowed context IDs (empty = all)
});
export type InterventionPermission = z.infer<typeof InterventionPermissionSchema>;

// ============================================
// Intervention Request
// ============================================

export const InterventionRequestSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  participantId: z.string(), // Human participant ID
  action: InterventionActionSchema,
  content: z.string().optional(), // Message content for send_message
  targetAgentId: z.string().optional(), // Specific agent to target
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});
export type InterventionRequest = z.infer<typeof InterventionRequestSchema>;

// ============================================
// Intervention Result
// ============================================

export const InterventionResultSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  action: InterventionActionSchema,
  message: z.string().optional(),
  affectedAgents: z.array(z.string()).optional(),
  timestamp: z.number(),
});
export type InterventionResult = z.infer<typeof InterventionResultSchema>;

// ============================================
// Conversation State for Intervention
// ============================================

export const ConversationInterventionStateSchema = z.enum([
  'active',      // Conversation running normally
  'paused',      // Paused by human intervention
  'pending_approval', // Waiting for human approval
  'redirected',  // Conversation redirected by human
  'terminated',  // Ended by human intervention
]);
export type ConversationInterventionState = z.infer<typeof ConversationInterventionStateSchema>;

// ============================================
// Intervention Session
// ============================================

export const InterventionSessionSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  humanParticipantId: z.string(),
  role: InterventionRoleSchema,
  permissions: InterventionPermissionSchema,
  state: ConversationInterventionStateSchema,
  interventionCount: z.number(),
  joinedAt: z.number(),
  lastActiveAt: z.number(),
});
export type InterventionSession = z.infer<typeof InterventionSessionSchema>;

// ============================================
// Conversation Hook Points
// ============================================

export const HookPointSchema = z.enum([
  'before_message_send',   // Before agent sends message
  'after_message_receive', // After agent receives message
  'before_task_start',     // Before task begins
  'after_task_complete',   // After task completes
  'on_error',              // On error occurrence
  'on_decision_point',     // At decision points (agent asks what to do)
]);
export type HookPoint = z.infer<typeof HookPointSchema>;

// ============================================
// Intervention Hook Configuration
// ============================================

export const InterventionHookSchema = z.object({
  point: HookPointSchema,
  enabled: z.boolean(),
  requireHumanResponse: z.boolean(), // Pause until human responds
  timeout: z.number().optional(), // Timeout in ms before auto-continue
  autoActions: z.array(InterventionActionSchema).optional(), // Auto-allowed actions
});
export type InterventionHook = z.infer<typeof InterventionHookSchema>;

// ============================================
// Guided Conversation Config
// ============================================

export const GuidedConversationConfigSchema = z.object({
  conversationId: z.string(),
  enableIntervention: z.boolean().default(true),
  hooks: z.array(InterventionHookSchema).optional(),
  defaultRole: InterventionRoleSchema.default('participant'),
  maxParticipants: z.number().default(5),
  interventionCooldown: z.number().default(1000), // Min time between interventions (ms)
  autoPauseOnConflict: z.boolean().default(true), // Auto-pause when agents conflict
});
export type GuidedConversationConfig = z.infer<typeof GuidedConversationConfigSchema>;

// ============================================
// Intervention Event
// ============================================

export const InterventionEventSchema = z.object({
  type: z.enum([
    'session_joined',
    'session_left',
    'intervention_requested',
    'intervention_applied',
    'state_changed',
    'hook_triggered',
    'timeout_reached',
  ]),
  conversationId: z.string(),
  sessionId: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});
export type InterventionEvent = z.infer<typeof InterventionEventSchema>;

// ============================================
// Default Permissions by Role
// ============================================

export const DEFAULT_PERMISSIONS: Record<InterventionRole, InterventionPermission> = {
  observer: {
    role: 'observer',
    actions: [],
    requireApproval: false,
  },
  participant: {
    role: 'participant',
    actions: ['send_message', 'request_clarification'],
    requireApproval: false,
  },
  moderator: {
    role: 'moderator',
    actions: [
      'send_message',
      'request_clarification',
      'redirect',
      'pause',
      'resume',
      'approve',
      'reject',
      'delegate',
    ],
    requireApproval: false,
  },
  admin: {
    role: 'admin',
    actions: [
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
    requireApproval: false,
  },
};
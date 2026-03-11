/**
 * Intervention Panel Component
 * Control panel for human intervention in agent conversations
 */

import { useState, useCallback, useMemo } from 'react';
import type { InterventionState, InterventionAction, Participant } from './types';
import { RoleBadge } from './RoleIndicator';

interface InterventionPanelProps {
  state: InterventionState;
  participants: Participant[];
  onSendMessage: (content: string) => Promise<boolean>;
  onAction: (action: InterventionAction, data?: Record<string, unknown>) => Promise<boolean>;
  disabled?: boolean;
  className?: string;
}

/**
 * Action button configuration
 */
const ACTION_CONFIG: Record<InterventionAction, {
  label: string;
  icon: string;
  color: string;
  hoverColor: string;
  confirmMessage?: string;
}> = {
  send_message: {
    label: 'Send',
    icon: '📤',
    color: 'bg-claw-600',
    hoverColor: 'hover:bg-claw-500',
  },
  request_clarification: {
    label: 'Clarify',
    icon: '❓',
    color: 'bg-blue-600',
    hoverColor: 'hover:bg-blue-500',
  },
  redirect: {
    label: 'Redirect',
    icon: '↪️',
    color: 'bg-yellow-600',
    hoverColor: 'hover:bg-yellow-500',
    confirmMessage: 'Redirect the conversation?',
  },
  pause: {
    label: 'Pause',
    icon: '⏸️',
    color: 'bg-yellow-600',
    hoverColor: 'hover:bg-yellow-500',
    confirmMessage: 'Pause the conversation?',
  },
  resume: {
    label: 'Resume',
    icon: '▶️',
    color: 'bg-green-600',
    hoverColor: 'hover:bg-green-500',
  },
  terminate: {
    label: 'End',
    icon: '🛑',
    color: 'bg-red-600',
    hoverColor: 'hover:bg-red-500',
    confirmMessage: 'Terminate the conversation? This cannot be undone.',
  },
  approve: {
    label: 'Approve',
    icon: '✅',
    color: 'bg-green-600',
    hoverColor: 'hover:bg-green-500',
  },
  reject: {
    label: 'Reject',
    icon: '❌',
    color: 'bg-red-600',
    hoverColor: 'hover:bg-red-500',
    confirmMessage: 'Reject this proposal?',
  },
  delegate: {
    label: 'Delegate',
    icon: '🔄',
    color: 'bg-purple-600',
    hoverColor: 'hover:bg-purple-500',
  },
};

/**
 * State indicator component
 */
function StateIndicator({ state }: { state: InterventionState['state'] }) {
  const config = {
    active: { color: 'bg-green-500', label: 'Active', pulse: true },
    paused: { color: 'bg-yellow-500', label: 'Paused', pulse: false },
    pending_approval: { color: 'bg-blue-500', label: 'Pending', pulse: true },
    redirected: { color: 'bg-purple-500', label: 'Redirected', pulse: false },
    terminated: { color: 'bg-red-500', label: 'Ended', pulse: false },
  }[state];

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`} />
      <span className="text-sm text-slate-400">{config.label}</span>
    </div>
  );
}

/**
 * Connection status indicator
 */
function ConnectionStatus({
  isConnected,
  isConnecting,
}: {
  isConnected: boolean;
  isConnecting: boolean;
}) {
  if (isConnecting) {
    return (
      <div className="flex items-center gap-2 text-yellow-400 text-xs">
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        Connecting...
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 text-red-400 text-xs">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Disconnected
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-green-400 text-xs">
      <span className="w-2 h-2 rounded-full bg-green-500" />
      Connected
    </div>
  );
}

/**
 * Message input component
 */
function MessageInput({
  onSend,
  disabled,
  placeholder = 'Type a message to intervene...',
}: {
  onSend: (content: string) => Promise<boolean>;
  disabled: boolean;
  placeholder?: string;
}) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!message.trim() || disabled || isSending) return;

    setIsSending(true);
    const success = await onSend(message.trim());
    if (success) {
      setMessage('');
    }
    setIsSending(false);
  }, [message, disabled, isSending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isSending}
        placeholder={placeholder}
        className="
          flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg
          text-sm text-white placeholder-slate-500
          focus:outline-none focus:ring-2 focus:ring-claw-500 focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
        "
      />
      <button
        onClick={handleSend}
        disabled={disabled || isSending || !message.trim()}
        className="
          px-4 py-2 bg-claw-600 hover:bg-claw-500 rounded-lg text-sm font-medium
          disabled:opacity-50 disabled:cursor-not-allowed transition-colors
        "
      >
        {isSending ? '...' : 'Send'}
      </button>
    </div>
  );
}

/**
 * Action button component
 */
function ActionButton({
  action,
  onAction,
  disabled,
}: {
  action: InterventionAction;
  onAction: () => Promise<boolean>;
  disabled: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const config = ACTION_CONFIG[action];

  const handleClick = useCallback(async () => {
    if (config.confirmMessage && !confirm(config.confirmMessage)) {
      return;
    }

    setIsLoading(true);
    await onAction();
    setIsLoading(false);
  }, [config.confirmMessage, onAction]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
        ${config.color} ${config.hoverColor}
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors
      `}
    >
      <span>{config.icon}</span>
      <span>{isLoading ? '...' : config.label}</span>
    </button>
  );
}

/**
 * Participants list component
 */
function ParticipantsList({ participants }: { participants: Participant[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-slate-500 uppercase">Participants</h4>
      <div className="space-y-1">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center gap-2 text-sm"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                participant.isOnline ? 'bg-green-500' : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-300">{participant.name}</span>
            {participant.role && (
              <span className="text-xs text-slate-500">({participant.role})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Main intervention panel component
 */
export function InterventionPanel({
  state: interventionState,
  participants,
  onSendMessage,
  onAction,
  disabled = false,
  className = '',
}: InterventionPanelProps) {
  const isDisabled = disabled || !interventionState.isConnected || interventionState.state === 'terminated';

  // Filter actions based on current state
  const availableActions = useMemo(() => {
    const actions = interventionState.availableActions.filter(
      (action) => action !== 'send_message' // Handled separately
    );

    // Don't show pause if already paused
    if (interventionState.state === 'paused') {
      return actions.filter((a) => a !== 'pause');
    }

    // Don't show resume if not paused (all non-paused states)
    return actions.filter((a) => a !== 'resume');
  }, [interventionState.availableActions, interventionState.state]);

  const handleAction = useCallback(
    (action: InterventionAction) => {
      return onAction(action);
    },
    [onAction]
  );

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StateIndicator state={interventionState.state} />
          <RoleBadge role={interventionState.role} />
        </div>
        <ConnectionStatus
          isConnected={interventionState.isConnected}
          isConnecting={interventionState.isConnecting}
        />
      </div>

      {/* Error message */}
      {interventionState.error && (
        <div className="px-3 py-2 bg-red-900/50 border border-red-800 rounded-lg text-sm text-red-300">
          {interventionState.error}
        </div>
      )}

      {/* Message input (if allowed) */}
      {interventionState.availableActions.includes('send_message') && (
        <MessageInput
          onSend={onSendMessage}
          disabled={isDisabled}
        />
      )}

      {/* Action buttons */}
      {availableActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-slate-500 uppercase">Actions</h4>
          <div className="flex flex-wrap gap-2">
            {availableActions.map((action) => (
              <ActionButton
                key={action}
                action={action}
                onAction={() => handleAction(action)}
                disabled={isDisabled}
              />
            ))}
          </div>
        </div>
      )}

      {/* Participants */}
      {participants.length > 0 && (
        <ParticipantsList participants={participants} />
      )}

      {/* Observer notice */}
      {interventionState.role === 'observer' && (
        <div className="text-center py-4 text-sm text-slate-500">
          You are viewing as an observer. No actions available.
        </div>
      )}
    </div>
  );
}

/**
 * Compact panel for sidebar use
 */
export function CompactInterventionPanel({
  state: interventionState,
  onSendMessage,
  onAction,
  disabled = false,
}: {
  state: InterventionState;
  onSendMessage: (content: string) => Promise<boolean>;
  onAction: (action: InterventionAction) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState('');
  const isDisabled = disabled || !interventionState.isConnected;

  const handleSend = useCallback(async () => {
    if (!message.trim() || isDisabled) return;
    const success = await onSendMessage(message.trim());
    if (success) setMessage('');
  }, [message, isDisabled, onSendMessage]);

  return (
    <div className="flex items-center gap-2 p-2 bg-slate-900 border-t border-slate-800">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        placeholder="Quick message..."
        disabled={isDisabled}
        className="
          flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm
          text-white placeholder-slate-500
          focus:outline-none focus:ring-1 focus:ring-claw-500
          disabled:opacity-50
        "
      />
      <button
        onClick={handleSend}
        disabled={isDisabled || !message.trim()}
        className="px-3 py-1.5 bg-claw-600 hover:bg-claw-500 rounded text-sm disabled:opacity-50"
      >
        Send
      </button>
      {interventionState.availableActions.includes('pause') && (
        <button
          onClick={() => onAction(interventionState.state === 'paused' ? 'resume' : 'pause')}
          disabled={isDisabled}
          className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-sm disabled:opacity-50"
        >
          {interventionState.state === 'paused' ? '▶' : '⏸'}
        </button>
      )}
    </div>
  );
}
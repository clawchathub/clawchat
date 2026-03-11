/**
 * React Hook for Human Intervention WebSocket/SSE Connection
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayMessage, InterventionConfig, InterventionState, Participant, InterventionAction } from '../types';
import { ROLE_PERMISSIONS } from '../types';

interface SSEEvent {
  type: 'message' | 'state_change' | 'participant_join' | 'participant_leave' | 'error';
  data: unknown;
}

interface UseInterventionOptions extends InterventionConfig {
  onMessage?: (message: DisplayMessage) => void;
  onStateChange?: (state: InterventionState['state']) => void;
  onError?: (error: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseInterventionReturn {
  state: InterventionState;
  sendMessage: (content: string) => Promise<boolean>;
  performAction: (action: InterventionAction, data?: Record<string, unknown>) => Promise<boolean>;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useIntervention(options: UseInterventionOptions): UseInterventionReturn {
  const {
    conversationId,
    participantId,
    role,
    serverUrl = '/api/intervention',
    useSSE = true,
    onMessage,
    onStateChange,
    onError,
    onConnect,
    onDisconnect,
  } = options;

  const [state, setState] = useState<InterventionState>({
    conversationId,
    state: 'active',
    role,
    availableActions: ROLE_PERMISSIONS[role],
    messages: [],
    participants: [],
    isConnected: false,
    isConnecting: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'message': {
        const msg = event.data as DisplayMessage;
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, msg],
        }));
        onMessage?.(msg);
        break;
      }
      case 'state_change': {
        const newState = event.data as InterventionState['state'];
        setState(prev => ({ ...prev, state: newState }));
        onStateChange?.(newState);
        break;
      }
      case 'participant_join': {
        const participant = event.data as Participant;
        setState(prev => ({
          ...prev,
          participants: [...prev.participants, participant],
        }));
        break;
      }
      case 'participant_leave': {
        const { id } = event.data as { id: string };
        setState(prev => ({
          ...prev,
          participants: prev.participants.filter(p => p.id !== id),
        }));
        break;
      }
      case 'error': {
        const errorMsg = (event.data as { message: string }).message;
        setState(prev => ({ ...prev, error: errorMsg }));
        onError?.(errorMsg);
        break;
      }
    }
  }, [onMessage, onStateChange, onError]);

  const connect = useCallback(() => {
    if (eventSourceRef.current || state.isConnecting) return;

    setState(prev => ({ ...prev, isConnecting: true, error: undefined }));

    const url = `${serverUrl}/${conversationId}?participantId=${participantId}&role=${role}`;

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
        }));
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const sseEvent = JSON.parse(event.data) as SSEEvent;
          handleSSEEvent(sseEvent);
        } catch {
          console.error('Failed to parse SSE event:', event.data);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
        }));
        onDisconnect?.();

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    }
  }, [conversationId, participantId, role, serverUrl, state.isConnecting, handleSSEEvent, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
    }));
  }, [clearReconnectTimeout]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!state.isConnected) {
      setState(prev => ({ ...prev, error: 'Not connected' }));
      return false;
    }

    try {
      const response = await fetch(`${serverUrl}/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          action: 'send_message',
          content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to send message';
      setState(prev => ({ ...prev, error: errorMsg }));
      onError?.(errorMsg);
      return false;
    }
  }, [state.isConnected, serverUrl, conversationId, participantId, onError]);

  const performAction = useCallback(async (
    action: InterventionAction,
    data?: Record<string, unknown>
  ): Promise<boolean> => {
    if (!state.isConnected) {
      setState(prev => ({ ...prev, error: 'Not connected' }));
      return false;
    }

    if (!state.availableActions.includes(action)) {
      setState(prev => ({ ...prev, error: 'Action not permitted' }));
      return false;
    }

    try {
      const response = await fetch(`${serverUrl}/${conversationId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          action,
          ...data,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to perform action: ${action}`);
      }

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Action failed';
      setState(prev => ({ ...prev, error: errorMsg }));
      onError?.(errorMsg);
      return false;
    }
  }, [state.isConnected, state.availableActions, serverUrl, conversationId, participantId, onError]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (state.error) {
      const timeout = setTimeout(() => {
        setState(prev => ({ ...prev, error: undefined }));
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [state.error]);

  return {
    state,
    sendMessage,
    performAction,
    connect,
    disconnect,
    reconnect,
  };
}
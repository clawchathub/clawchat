/**
 * Conversation View Component
 * Displays the message stream between agents with human intervention messages
 */

import { useEffect, useRef, useMemo } from 'react';
import type { DisplayMessage, Participant } from './types';

interface ConversationViewProps {
  messages: DisplayMessage[];
  participants: Participant[];
  currentUserId?: string;
  isLoading?: boolean;
  className?: string;
  onScrollToBottom?: () => void;
}

/**
 * Format timestamp to readable time
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get participant info by ID
 */
function getParticipantInfo(
  senderId: string,
  participants: Participant[]
): Participant | undefined {
  return participants.find(p => p.id === senderId);
}

/**
 * Individual message bubble component
 */
function MessageBubble({
  message,
  participant,
  isCurrentUser,
}: {
  message: DisplayMessage;
  participant?: Participant;
  isCurrentUser: boolean;
}) {
  const isHuman = message.senderType === 'human';
  const isAgent = message.senderType === 'agent';

  return (
    <div
      className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`
          flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
          ${isHuman
            ? 'bg-claw-600 text-white'
            : 'bg-slate-700 text-slate-300'
          }
        `}
      >
        {isHuman ? '👤' : '🤖'}
      </div>

      {/* Message content */}
      <div
        className={`
          flex flex-col gap-1 max-w-[70%]
          ${isCurrentUser ? 'items-end' : 'items-start'}
        `}
      >
        {/* Sender name and time */}
        <div
          className={`
            flex items-center gap-2 text-xs text-slate-500
            ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}
          `}
        >
          <span className="font-medium">
            {participant?.name || message.senderName}
          </span>
          <span>{formatTime(message.timestamp)}</span>
        </div>

        {/* Message bubble */}
        <div
          className={`
            px-4 py-2 rounded-2xl
            ${isCurrentUser
              ? 'bg-claw-600 text-white rounded-br-md'
              : 'bg-slate-800 text-slate-200 rounded-bl-md'
            }
          `}
        >
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>

        {/* Agent status indicator */}
        {isAgent && participant && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                participant.isOnline ? 'bg-green-500' : 'bg-slate-500'
              }`}
            />
            <span>{participant.isOnline ? 'Online' : 'Offline'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Loading indicator for typing animation
 */
function TypingIndicator() {
  return (
    <div className="flex gap-3 items-center">
      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
        <span className="text-sm">🤖</span>
      </div>
      <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no messages
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
        <span className="text-3xl">💬</span>
      </div>
      <h3 className="text-lg font-medium text-slate-300 mb-2">
        No messages yet
      </h3>
      <p className="text-sm text-slate-500 max-w-xs">
        The conversation will appear here once agents start communicating.
        You can intervene at any time.
      </p>
    </div>
  );
}

/**
 * Main conversation view component
 */
export function ConversationView({
  messages,
  participants,
  currentUserId,
  isLoading = false,
  className = '',
}: ConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: DisplayMessage[] }[] = [];

    messages.forEach(message => {
      const date = new Date(message.timestamp).toLocaleDateString();
      const existingGroup = groups.find(g => g.date === date);

      if (existingGroup) {
        existingGroup.messages.push(message);
      } else {
        groups.push({ date, messages: [message] });
      }
    });

    return groups;
  }, [messages]);

  const hasMessages = messages.length > 0;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full overflow-hidden ${className}`}
    >
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {!hasMessages && !isLoading && <EmptyState />}

        {hasMessages && (
          <div className="space-y-6">
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-4">
                {/* Date separator */}
                <div className="flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-xs text-slate-500 font-medium">
                    {group.date === new Date().toLocaleDateString() ? 'Today' : group.date}
                  </span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>

                {/* Messages in this group */}
                <div className="space-y-4">
                  {group.messages.map((message, messageIndex) => (
                    <MessageBubble
                      key={`${message.id}-${messageIndex}`}
                      message={message}
                      participant={getParticipantInfo(message.senderId, participants)}
                      isCurrentUser={message.senderId === currentUserId || message.isHuman === true}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && <TypingIndicator />}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact message list for sidebar or smaller views
 */
export function CompactMessageList({
  messages,
  maxMessages = 5,
  className = '',
}: {
  messages: DisplayMessage[];
  maxMessages?: number;
  className?: string;
}) {
  const displayMessages = messages.slice(-maxMessages);

  return (
    <div className={`space-y-2 ${className}`}>
      {displayMessages.map((message, index) => (
        <div
          key={`${message.id}-${index}`}
          className="flex items-start gap-2 text-sm"
        >
          <span className="text-xs text-slate-500">
            {formatTime(message.timestamp)}
          </span>
          <span className="text-slate-400 truncate">
            {message.senderName}:
          </span>
          <span className="text-slate-300 truncate flex-1">
            {message.content}
          </span>
        </div>
      ))}
    </div>
  );
}
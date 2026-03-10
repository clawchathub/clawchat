/**
 * Protocol Constants and Utilities
 */

// A2A Protocol Version
export const A2A_PROTOCOL_VERSION = '0.3';

// Well-known paths
export const AGENT_CARD_PATH = '/.well-known/agent.json';

// Default ports
export const DEFAULT_A2A_PORT = 18789;
export const DEFAULT_RELAY_PORT = 18790;

// Message kinds (for extended functionality beyond A2A spec)
export const MessageKind = {
  HELLO: 0,
  CHAT: 1,
  TASK_CREATE: 10,
  TASK_UPDATE: 11,
  TASK_COMPLETE: 12,
  DISCOVERY: 20,
  RELAY_ANNOUNCE: 30,
} as const;

// Timeout defaults (in milliseconds)
export const TIMEOUTS = {
  CONNECTION: 30000,      // 30 seconds
  HANDSHAKE: 10000,       // 10 seconds
  MESSAGE: 60000,         // 60 seconds
  TASK: 24 * 60 * 60 * 1000, // 24 hours
  HEARTBEAT: 30000,       // 30 seconds
} as const;

// Rate limiting
export const RATE_LIMITS = {
  MESSAGES_PER_SECOND: 10,
  MESSAGES_PER_MINUTE: 100,
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1MB
  MAX_TASKS_PER_AGENT: 100,
} as const;
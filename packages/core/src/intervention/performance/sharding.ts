/**
 * Conversation State Sharding
 * Provides horizontal scaling through conversation ID-based sharding
 * with lazy loading of historical messages
 */

import type { A2AMessage } from '../../types/a2a.js';
import type { InterventionSession, InterventionRequest, GuidedConversationConfig, ConversationInterventionState } from '../types.js';

// ============================================
// Types
// ============================================

export interface ShardedConversationState {
  conversationId: string;
  state: ConversationInterventionState;
  sessions: Map<string, InterventionSession>;
  activeMessages: A2AMessage[]; // Recently accessed messages (hot)
  pendingInterventions: InterventionRequest[];
  config: GuidedConversationConfig;
  pausedAt?: number;
  pausedBy?: string;
  lastAccessedAt: number;
  messageCount: number; // Total message count (for pagination)
}

export interface HistoryChunk {
  conversationId: string;
  startIndex: number;
  endIndex: number;
  messages: A2AMessage[];
  loadedAt: number;
  accessedAt: number;
}

export interface ShardingConfig {
  shardCount: number; // Number of shards (default: CPU cores * 2)
  maxMessagesPerShard: number; // Max messages to keep in memory per shard
  historyChunkSize: number; // Messages per history chunk
  lazyLoadThreshold: number; // Access time before lazy load (ms)
  maxInactiveTime: number; // Time before evicting inactive conversations (ms)
  enableHistoryCompression: boolean; // Compress old history
}

export const DEFAULT_SHARDING_CONFIG: ShardingConfig = {
  shardCount: typeof process !== 'undefined' ? (process as any).cores * 2 || 8 : 8,
  maxMessagesPerShard: 10000,
  historyChunkSize: 100,
  lazyLoadThreshold: 30000, // 30 seconds
  maxInactiveTime: 3600000, // 1 hour
  enableHistoryCompression: true,
};

// ============================================
// Shard Key Generator
// ============================================

/**
 * Generate a consistent shard key for a conversation ID
 * Uses murmurhash3-like distribution for even spread
 */
export function getShardKey(conversationId: string, shardCount: number): number {
  let hash = 0;
  for (let i = 0; i < conversationId.length; i++) {
    const char = conversationId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % shardCount;
}

// ============================================
// Conversation Shard
// ============================================

export class ConversationShard {
  readonly index: number;
  private conversations: Map<string, ShardedConversationState> = new Map();
  private historyChunks: Map<string, HistoryChunk[]> = new Map();
  private config: ShardingConfig;
  private messageCount: number = 0;

  constructor(index: number, config: ShardingConfig) {
    this.index = index;
    this.config = config;
  }

  /**
   * Get or create conversation state
   */
  getOrCreate(
    conversationId: string,
    configFactory: () => GuidedConversationConfig
  ): ShardedConversationState {
    let state = this.conversations.get(conversationId);
    if (!state) {
      const convConfig = configFactory();
      state = {
        conversationId,
        state: 'active',
        sessions: new Map(),
        activeMessages: [],
        pendingInterventions: [],
        config: convConfig,
        lastAccessedAt: Date.now(),
        messageCount: 0,
      };
      this.conversations.set(conversationId, state);
    } else {
      state.lastAccessedAt = Date.now();
    }
    return state;
  }

  /**
   * Get conversation state (returns undefined if not exists)
   */
  get(conversationId: string): ShardedConversationState | undefined {
    const state = this.conversations.get(conversationId);
    if (state) {
      state.lastAccessedAt = Date.now();
    }
    return state;
  }

  /**
   * Add message to conversation (with automatic history offloading)
   */
  addMessage(conversationId: string, message: A2AMessage): void {
    const state = this.conversations.get(conversationId);
    if (!state) return;

    state.activeMessages.push(message);
    state.messageCount++;
    this.messageCount++;

    // Check if we need to offload history
    if (state.activeMessages.length > this.config.maxMessagesPerShard / 10) {
      this.offloadHistory(conversationId);
    }

    // Check shard-level message limit
    if (this.messageCount > this.config.maxMessagesPerShard) {
      this.evictOldestHistory();
    }
  }

  /**
   * Get messages with lazy loading from history
   */
  getMessages(
    conversationId: string,
    offset: number = 0,
    limit: number = 100
  ): A2AMessage[] {
    const state = this.conversations.get(conversationId);
    if (!state) return [];

    state.lastAccessedAt = Date.now();

    // If requesting recent messages, return from active cache
    if (offset === 0 && limit <= state.activeMessages.length) {
      return state.activeMessages.slice(0, limit);
    }

    // Load from history chunks
    return this.loadFromHistory(conversationId, offset, limit);
  }

  /**
   * Get message count
   */
  getMessageCount(conversationId: string): number {
    const state = this.conversations.get(conversationId);
    return state?.messageCount ?? 0;
  }

  /**
   * Delete conversation
   */
  delete(conversationId: string): boolean {
    const deleted = this.conversations.delete(conversationId);
    if (deleted) {
      const chunks = this.historyChunks.get(conversationId);
      if (chunks) {
        this.messageCount -= chunks.reduce((sum, c) => sum + c.messages.length, 0);
        this.historyChunks.delete(conversationId);
      }
    }
    return deleted;
  }

  /**
   * Evict inactive conversations
   */
  evictInactive(): string[] {
    const now = Date.now();
    const evicted: string[] = [];

    for (const [id, state] of this.conversations) {
      if (now - state.lastAccessedAt > this.config.maxInactiveTime) {
        this.delete(id);
        evicted.push(id);
      }
    }

    return evicted;
  }

  /**
   * Get shard statistics
   */
  getStats(): {
    conversationCount: number;
    messageCount: number;
    chunkCount: number;
    memoryUsage: number;
  } {
    let chunkCount = 0;
    for (const chunks of this.historyChunks.values()) {
      chunkCount += chunks.length;
    }

    return {
      conversationCount: this.conversations.size,
      messageCount: this.messageCount,
      chunkCount,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private offloadHistory(conversationId: string): void {
    const state = this.conversations.get(conversationId);
    if (!state || state.activeMessages.length === 0) return;

    // Move oldest messages to a history chunk
    const messagesToOffload = state.activeMessages.splice(
      0,
      Math.min(this.config.historyChunkSize, state.activeMessages.length)
    );

    if (messagesToOffload.length === 0) return;

    const chunks = this.historyChunks.get(conversationId) || [];
    const newChunk: HistoryChunk = {
      conversationId,
      startIndex: chunks.length > 0 ? chunks[chunks.length - 1].endIndex + 1 : 0,
      endIndex: (chunks.length > 0 ? chunks[chunks.length - 1].endIndex : -1) + messagesToOffload.length,
      messages: messagesToOffload,
      loadedAt: Date.now(),
      accessedAt: Date.now(),
    };

    chunks.push(newChunk);
    this.historyChunks.set(conversationId, chunks);
  }

  private loadFromHistory(
    conversationId: string,
    offset: number,
    limit: number
  ): A2AMessage[] {
    const state = this.conversations.get(conversationId);
    if (!state) return [];

    const chunks = this.historyChunks.get(conversationId) || [];
    const messages: A2AMessage[] = [];

    // Load from chunks (lazy load)
    let currentOffset = offset;

    // First check if we need messages from history chunks
    const activeStartIndex = chunks.length > 0
      ? chunks[0].startIndex
      : 0;

    if (offset < state.messageCount - state.activeMessages.length) {
      // Need to load from history
      for (const chunk of chunks) {
        chunk.accessedAt = Date.now();
        if (chunk.startIndex <= currentOffset + limit - 1 && chunk.endIndex >= currentOffset) {
          const chunkOffset = Math.max(0, currentOffset - chunk.startIndex);
          const chunkLimit = Math.min(limit - messages.length, chunk.messages.length - chunkOffset);
          messages.push(...chunk.messages.slice(chunkOffset, chunkOffset + chunkLimit));
          currentOffset += chunkLimit;
          if (messages.length >= limit) break;
        }
      }
    }

    // Add active messages if needed
    const activeOffset = Math.max(0, offset - (state.messageCount - state.activeMessages.length));
    if (messages.length < limit && activeOffset < state.activeMessages.length) {
      const remainingLimit = limit - messages.length;
      messages.push(...state.activeMessages.slice(activeOffset, activeOffset + remainingLimit));
    }

    return messages;
  }

  private evictOldestHistory(): void {
    // Find and evict oldest chunks across conversations
    const allChunks: { conversationId: string; chunk: HistoryChunk }[] = [];

    for (const [conversationId, chunks] of this.historyChunks) {
      for (const chunk of chunks) {
        allChunks.push({ conversationId, chunk });
      }
    }

    // Sort by access time
    allChunks.sort((a, b) => a.chunk.accessedAt - b.chunk.accessedAt);

    // Evict oldest chunks until under limit
    const toEvict = Math.ceil(allChunks.length * 0.2); // Evict 20%
    for (let i = 0; i < toEvict && i < allChunks.length; i++) {
      const { conversationId, chunk } = allChunks[i];
      const chunks = this.historyChunks.get(conversationId);
      if (chunks) {
        const index = chunks.indexOf(chunk);
        if (index !== -1) {
          chunks.splice(index, 1);
          this.messageCount -= chunk.messages.length;
        }
        if (chunks.length === 0) {
          this.historyChunks.delete(conversationId);
        }
      }
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimate: ~1KB per message
    return this.messageCount * 1024;
  }
}

// ============================================
// Sharded Conversation Store
// ============================================

export class ShardedConversationStore {
  private shards: ConversationShard[];
  private config: ShardingConfig;
  private evictionInterval?: ReturnType<typeof setInterval>;

  constructor(config: Partial<ShardingConfig> = {}) {
    this.config = { ...DEFAULT_SHARDING_CONFIG, ...config };
    this.shards = [];

    for (let i = 0; i < this.config.shardCount; i++) {
      this.shards.push(new ConversationShard(i, this.config));
    }
  }

  /**
   * Get the shard for a conversation
   */
  getShard(conversationId: string): ConversationShard {
    const index = getShardKey(conversationId, this.config.shardCount);
    return this.shards[index];
  }

  /**
   * Get or create conversation state
   */
  getOrCreate(
    conversationId: string,
    config: GuidedConversationConfig
  ): ShardedConversationState {
    return this.getShard(conversationId).getOrCreate(conversationId, () => config);
  }

  /**
   * Get conversation state
   */
  get(conversationId: string): ShardedConversationState | undefined {
    return this.getShard(conversationId).get(conversationId);
  }

  /**
   * Add message to conversation
   */
  addMessage(conversationId: string, message: A2AMessage): void {
    this.getShard(conversationId).addMessage(conversationId, message);
  }

  /**
   * Get messages with lazy loading
   */
  getMessages(conversationId: string, offset = 0, limit = 100): A2AMessage[] {
    return this.getShard(conversationId).getMessages(conversationId, offset, limit);
  }

  /**
   * Delete conversation
   */
  delete(conversationId: string): boolean {
    return this.getShard(conversationId).delete(conversationId);
  }

  /**
   * Start automatic eviction of inactive conversations
   */
  startEviction(intervalMs: number = 60000): void {
    this.stopEviction();
    this.evictionInterval = setInterval(() => {
      this.evictInactive();
    }, intervalMs);
  }

  /**
   * Stop automatic eviction
   */
  stopEviction(): void {
    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = undefined;
    }
  }

  /**
   * Evict inactive conversations across all shards
   */
  evictInactive(): string[] {
    const evicted: string[] = [];
    for (const shard of this.shards) {
      evicted.push(...shard.evictInactive());
    }
    return evicted;
  }

  /**
   * Get aggregate statistics
   */
  getStats(): {
    shardCount: number;
    totalConversations: number;
    totalMessages: number;
    totalChunks: number;
    totalMemoryUsage: number;
    shardStats: ReturnType<ConversationShard['getStats']>[];
  } {
    const shardStats = this.shards.map((s) => s.getStats());
    return {
      shardCount: this.shards.length,
      totalConversations: shardStats.reduce((sum, s) => sum + s.conversationCount, 0),
      totalMessages: shardStats.reduce((sum, s) => sum + s.messageCount, 0),
      totalChunks: shardStats.reduce((sum, s) => sum + s.chunkCount, 0),
      totalMemoryUsage: shardStats.reduce((sum, s) => sum + s.memoryUsage, 0),
      shardStats,
    };
  }

  /**
   * Get shard distribution for monitoring
   */
  getDistribution(): Map<number, number> {
    const distribution = new Map<number, number>();
    this.shards.forEach((shard, index) => {
      distribution.set(index, shard.getStats().conversationCount);
    });
    return distribution;
  }
}
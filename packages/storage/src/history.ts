/**
 * Message History Store
 * Provides message history queries with pagination
 */

import type { SQLiteAdapter } from './adapter.js';
import type { A2AMessage } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface HistoryQuery {
  contextId?: string;
  taskId?: string;
  fromAgent?: string;
  toAgent?: string;
  since?: number;
  until?: number;
  delivered?: boolean;
}

export interface HistoryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
}

export interface HistoryResult {
  messages: Array<{
    id: string;
    message: A2AMessage;
    timestamp: number;
    delivered: boolean;
    fromAgent: string;
    toAgent?: string;
  }>;
  total: number;
  hasMore: boolean;
}

export interface ConversationSummary {
  contextId: string;
  messageCount: number;
  firstMessage: number;
  lastMessage: number;
  participants: string[];
}

// ============================================
// Message History Store
// ============================================

export class MessageHistory {
  private adapter: SQLiteAdapter;

  constructor(adapter: SQLiteAdapter) {
    this.adapter = adapter;
  }

  /**
   * Store a message in history
   */
  store(
    message: A2AMessage,
    fromAgent: string,
    toAgent?: string,
    contextId?: string,
    taskId?: string
  ): string {
    const id = uuidv4();
    const actualContextId = contextId ?? message.contextId ?? uuidv4();

    this.adapter.storeMessage({
      id,
      contextId: actualContextId,
      taskId: taskId ?? message.taskId,
      fromAgent,
      toAgent,
      message: JSON.stringify(message),
      timestamp: Date.now(),
      delivered: false,
    });

    return id;
  }

  /**
   * Query message history
   */
  query(query: HistoryQuery, options: HistoryOptions = {}): HistoryResult {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const db = this.adapter.getDatabase();

    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.contextId) {
      conditions.push('contextId = ?');
      params.push(query.contextId);
    }

    if (query.taskId) {
      conditions.push('taskId = ?');
      params.push(query.taskId);
    }

    if (query.fromAgent) {
      conditions.push('fromAgent = ?');
      params.push(query.fromAgent);
    }

    if (query.toAgent) {
      conditions.push('toAgent = ?');
      params.push(query.toAgent);
    }

    if (query.since) {
      conditions.push('timestamp >= ?');
      params.push(query.since);
    }

    if (query.until) {
      conditions.push('timestamp <= ?');
      params.push(query.until);
    }

    if (query.delivered !== undefined) {
      conditions.push('delivered = ?');
      params.push(query.delivered ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderDirection = options.orderBy === 'desc' ? 'DESC' : 'ASC';

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM messages ${whereClause}`);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get messages
    const stmt = db.prepare(`
      SELECT * FROM messages ${whereClause} ORDER BY timestamp ${orderDirection} LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(...params, limit, offset) as Array<{
      id: string;
      message: string;
      timestamp: number;
      delivered: number;
      fromAgent: string;
      toAgent: string | null;
    }>;

    const messages = rows.map((row) => ({
      id: row.id,
      message: JSON.parse(row.message) as A2AMessage,
      timestamp: row.timestamp,
      delivered: row.delivered === 1,
      fromAgent: row.fromAgent,
      toAgent: row.toAgent ?? undefined,
    }));

    return {
      messages,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get messages for a context (conversation)
   */
  getConversation(contextId: string, limit: number = 100, offset: number = 0): HistoryResult {
    return this.query({ contextId }, { limit, offset });
  }

  /**
   * Get messages for a task
   */
  getTaskMessages(taskId: string): HistoryResult {
    return this.query({ taskId });
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(contextId: string): ConversationSummary | null {
    const db = this.adapter.getDatabase();

    const stmt = db.prepare(`
      SELECT
        COUNT(*) as messageCount,
        MIN(timestamp) as firstMessage,
        MAX(timestamp) as lastMessage
      FROM messages WHERE contextId = ?
    `);

    const row = stmt.get(contextId) as {
      messageCount: number;
      firstMessage: number;
      lastMessage: number;
    } | undefined;

    if (!row || row.messageCount === 0) {
      return null;
    }

    // Get participants
    const participantsStmt = db.prepare(`
      SELECT DISTINCT fromAgent FROM messages WHERE contextId = ?
      UNION
      SELECT DISTINCT toAgent FROM messages WHERE contextId = ? AND toAgent IS NOT NULL
    `);

    const participantsRows = participantsStmt.all(contextId, contextId) as Array<{ fromAgent: string }>;
    const participants = participantsRows.map((r) => r.fromAgent);

    return {
      contextId,
      messageCount: row.messageCount,
      firstMessage: row.firstMessage,
      lastMessage: row.lastMessage,
      participants,
    };
  }

  /**
   * Get all conversations
   */
  listConversations(limit: number = 50, offset: number = 0): ConversationSummary[] {
    const db = this.adapter.getDatabase();

    const stmt = db.prepare(`
      SELECT contextId, COUNT(*) as messageCount, MIN(timestamp) as firstMessage, MAX(timestamp) as lastMessage
      FROM messages
      GROUP BY contextId
      ORDER BY lastMessage DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as Array<{
      contextId: string;
      messageCount: number;
      firstMessage: number;
      lastMessage: number;
    }>;

    return rows.map((row) => ({
      contextId: row.contextId,
      messageCount: row.messageCount,
      firstMessage: row.firstMessage,
      lastMessage: row.lastMessage,
      participants: [], // Would need separate query
    }));
  }

  /**
   * Mark messages as delivered
   */
  markDelivered(messageIds: string[]): void {
    for (const id of messageIds) {
      this.adapter.markDelivered(id);
    }
  }

  /**
   * Get undelivered messages for an agent
   */
  getUndelivered(toAgent: string): HistoryResult {
    return this.query({ toAgent, delivered: false });
  }

  /**
   * Delete messages older than a date
   */
  deleteOlderThan(timestamp: number): number {
    const db = this.adapter.getDatabase();
    const stmt = db.prepare('DELETE FROM messages WHERE timestamp < ?');
    const result = stmt.run(timestamp);
    return result.changes;
  }

  /**
   * Search messages by content
   */
  search(query: string, options: HistoryOptions = {}): HistoryResult {
    const db = this.adapter.getDatabase();
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const stmt = db.prepare(`
      SELECT * FROM messages WHERE message LIKE ? ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(`%${query}%`, limit, offset) as Array<{
      id: string;
      message: string;
      timestamp: number;
      delivered: number;
      fromAgent: string;
      toAgent: string | null;
    }>;

    // Get total count (approximate)
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM messages WHERE message LIKE ?');
    const countResult = countStmt.get(`%${query}%`) as { count: number };

    const messages = rows.map((row) => ({
      id: row.id,
      message: JSON.parse(row.message) as A2AMessage,
      timestamp: row.timestamp,
      delivered: row.delivered === 1,
      fromAgent: row.fromAgent,
      toAgent: row.toAgent ?? undefined,
    }));

    return {
      messages,
      total: countResult.count,
      hasMore: offset + limit < countResult.count,
    };
  }
}
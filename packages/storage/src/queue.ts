/**
 * Offline Queue
 * Stores messages for offline peers with retry logic
 */

import type { SQLiteAdapter } from './adapter.js';
import type { A2AMessage } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface QueuedMessage {
  id: string;
  toAgent: string;
  message: A2AMessage;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
  priority: 'high' | 'normal' | 'low';
  expiresAt?: number;
}

export interface QueueConfig {
  maxAttempts: number;
  retryDelayMs: number;
  expirationMs: number;
  maxQueueSize: number;
}

export interface QueueStats {
  total: number;
  pending: number;
  delivered: number;
  failed: number;
  byPriority: {
    high: number;
    normal: number;
    low: number;
  };
}

// ============================================
// Offline Queue
// ============================================

export class OfflineQueue {
  private adapter: SQLiteAdapter;
  private config: QueueConfig;

  constructor(adapter: SQLiteAdapter, config: Partial<QueueConfig> = {}) {
    this.adapter = adapter;
    this.config = {
      maxAttempts: config.maxAttempts ?? 5,
      retryDelayMs: config.retryDelayMs ?? 60000, // 1 minute
      expirationMs: config.expirationMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      maxQueueSize: config.maxQueueSize ?? 10000,
    };
  }

  /**
   * Add a message to the queue
   */
  enqueue(
    toAgent: string,
    message: A2AMessage,
    priority: 'high' | 'normal' | 'low' = 'normal',
    expiresAt?: number
  ): QueuedMessage | null {
    // Check queue size
    const stats = this.getStats();
    if (stats.pending >= this.config.maxQueueSize) {
      return null;
    }

    const id = uuidv4();
    const queuedMessage: QueuedMessage = {
      id,
      toAgent,
      message,
      timestamp: Date.now(),
      attempts: 0,
      priority,
      expiresAt: expiresAt ?? (Date.now() + this.config.expirationMs),
    };

    // Store in database with extended schema
    const db = this.adapter.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO offline_queue (id, toAgent, message, timestamp, attempts, lastAttempt, delivered)
      VALUES (?, ?, ?, ?, 0, NULL, 0)
    `);

    stmt.run(id, toAgent, JSON.stringify({ ...queuedMessage, priority, expiresAt }), queuedMessage.timestamp);

    return queuedMessage;
  }

  /**
   * Get pending messages for an agent
   */
  getPending(toAgent: string): QueuedMessage[] {
    const db = this.adapter.getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM offline_queue
      WHERE toAgent = ? AND delivered = 0
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(toAgent) as Array<{
      id: string;
      message: string;
      timestamp: number;
      attempts: number;
      lastAttempt: number | null;
    }>;

    return rows.map((row) => {
      const data = JSON.parse(row.message);
      return {
        id: row.id,
        toAgent,
        message: data.message as A2AMessage,
        timestamp: row.timestamp,
        attempts: row.attempts,
        lastAttempt: row.lastAttempt ?? undefined,
        priority: data.priority ?? 'normal',
        expiresAt: data.expiresAt,
      };
    });
  }

  /**
   * Get messages ready for retry
   */
  getReadyForRetry(): QueuedMessage[] {
    const db = this.adapter.getDatabase();
    const cutoff = Date.now() - this.config.retryDelayMs;

    const stmt = db.prepare(`
      SELECT * FROM offline_queue
      WHERE delivered = 0 AND attempts < ? AND (lastAttempt IS NULL OR lastAttempt < ?)
      ORDER BY timestamp ASC
      LIMIT 100
    `);

    const rows = stmt.all(this.config.maxAttempts, cutoff) as Array<{
      id: string;
      toAgent: string;
      message: string;
      timestamp: number;
      attempts: number;
      lastAttempt: number | null;
    }>;

    return rows.map((row) => {
      const data = JSON.parse(row.message);
      return {
        id: row.id,
        toAgent: row.toAgent,
        message: data.message as A2AMessage,
        timestamp: row.timestamp,
        attempts: row.attempts,
        lastAttempt: row.lastAttempt ?? undefined,
        priority: data.priority ?? 'normal',
        expiresAt: data.expiresAt,
      };
    });
  }

  /**
   * Mark message as delivered
   */
  markDelivered(id: string): void {
    this.adapter.markQueueDelivered(id);
  }

  /**
   * Mark message as attempted
   */
  markAttempted(id: string): void {
    this.adapter.updateQueueAttempt(id);
  }

  /**
   * Check if message can be retried
   */
  canRetry(message: QueuedMessage): boolean {
    if (message.attempts >= this.config.maxAttempts) {
      return false;
    }

    if (message.expiresAt && Date.now() > message.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Remove expired and failed messages
   */
  cleanup(): { expired: number; failed: number } {
    const db = this.adapter.getDatabase();
    const now = Date.now();

    // Remove expired messages
    const expiredStmt = db.prepare(`
      DELETE FROM offline_queue WHERE delivered = 0 AND json_extract(message, '$.expiresAt') < ?
    `);
    const expiredResult = expiredStmt.run(now);

    // Remove failed messages (exceeded max attempts)
    const failedStmt = db.prepare(`
      DELETE FROM offline_queue WHERE delivered = 0 AND attempts >= ?
    `);
    const failedResult = failedStmt.run(this.config.maxAttempts);

    return {
      expired: expiredResult.changes,
      failed: failedResult.changes,
    };
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const db = this.adapter.getDatabase();

    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM offline_queue');
    const total = (totalStmt.get() as { count: number }).count;

    const pendingStmt = db.prepare('SELECT COUNT(*) as count FROM offline_queue WHERE delivered = 0');
    const pending = (pendingStmt.get() as { count: number }).count;

    const deliveredStmt = db.prepare('SELECT COUNT(*) as count FROM offline_queue WHERE delivered = 1');
    const delivered = (deliveredStmt.get() as { count: number }).count;

    const failedStmt = db.prepare(`SELECT COUNT(*) as count FROM offline_queue WHERE delivered = 0 AND attempts >= ?`);
    const failed = (failedStmt.get(this.config.maxAttempts) as { count: number }).count;

    // Priority counts
    const highStmt = db.prepare(`SELECT COUNT(*) as count FROM offline_queue WHERE delivered = 0 AND json_extract(message, '$.priority') = 'high'`);
    const normalStmt = db.prepare(`SELECT COUNT(*) as count FROM offline_queue WHERE delivered = 0 AND json_extract(message, '$.priority') = 'normal'`);
    const lowStmt = db.prepare(`SELECT COUNT(*) as count FROM offline_queue WHERE delivered = 0 AND json_extract(message, '$.priority') = 'low'`);

    return {
      total,
      pending,
      delivered,
      failed,
      byPriority: {
        high: (highStmt.get() as { count: number }).count,
        normal: (normalStmt.get() as { count: number }).count,
        low: (lowStmt.get() as { count: number }).count,
      },
    };
  }

  /**
   * Clear all delivered messages
   */
  clearDelivered(): number {
    const db = this.adapter.getDatabase();
    const stmt = db.prepare('DELETE FROM offline_queue WHERE delivered = 1');
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Get queue size for an agent
   */
  getQueueSize(toAgent: string): number {
    const db = this.adapter.getDatabase();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM offline_queue WHERE toAgent = ? AND delivered = 0');
    return (stmt.get(toAgent) as { count: number }).count;
  }
}
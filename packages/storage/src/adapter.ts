/**
 * SQLite Storage Adapter
 * Provides persistence using better-sqlite3
 */

import Database from 'better-sqlite3';
import type { A2ATask, AgentCard } from '@clawchat/core';

// ============================================
// Types
// ============================================

interface Logger {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface StorageConfig {
  path: string;
  verbose?: boolean;
  walMode?: boolean;
  logger?: Logger;
}

export interface MessageRecord {
  id: string;
  contextId: string;
  taskId?: string;
  fromAgent: string;
  toAgent?: string;
  message: string; // JSON serialized
  timestamp: number;
  delivered: boolean;
  deliveredAt?: number;
}

export interface TaskRecord {
  id: string;
  contextId: string;
  status: string; // JSON serialized
  history: string; // JSON serialized
  artifacts?: string; // JSON serialized
  metadata?: string; // JSON serialized
  createdAt: number;
  updatedAt: number;
}

// ============================================
// SQLite Adapter
// ============================================

export class SQLiteAdapter {
  private db: Database.Database;
  private logger: Logger;

  constructor(config: StorageConfig) {
    this.logger = config.logger ?? {
      info: (...args) => console.log(...args),
      debug: (...args) => console.debug(...args),
      error: (...args) => console.error(...args),
      warn: (...args) => console.warn(...args),
    };

    this.db = new Database(config.path, {
      verbose: config.verbose ? (...args: unknown[]) => this.logger.debug(String(args[0] ?? '')) : undefined,
    });

    this.db.pragma('busy_timeout = 5000');

    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    this.initializeTables();
  }

  /**
   * Initialize database tables
   */
  private initializeTables(): void {
    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        contextId TEXT NOT NULL,
        taskId TEXT,
        fromAgent TEXT NOT NULL,
        toAgent TEXT,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        delivered INTEGER DEFAULT 0,
        deliveredAt INTEGER,
        createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_context ON messages(contextId);
      CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(taskId);
      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(fromAgent);
      CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(toAgent);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);

    // Tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        contextId TEXT NOT NULL,
        status TEXT NOT NULL,
        history TEXT NOT NULL,
        artifacts TEXT,
        metadata TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_context ON tasks(contextId);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(createdAt);
    `);

    // Agent cards cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_cards (
        publicKey TEXT PRIMARY KEY,
        card TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);

    // Offline queue table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY,
        toAgent TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0,
        lastAttempt INTEGER,
        delivered INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_offline_to ON offline_queue(toAgent);
    `);
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Store a message
   */
  storeMessage(record: MessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, contextId, taskId, fromAgent, toAgent, message, timestamp, delivered, deliveredAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.id,
      record.contextId,
      record.taskId ?? null,
      record.fromAgent,
      record.toAgent ?? null,
      record.message,
      record.timestamp,
      record.delivered ? 1 : 0,
      record.deliveredAt ?? null
    );
  }

  /**
   * Get messages by context
   */
  getMessagesByContext(contextId: string, limit: number = 100, offset: number = 0): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages WHERE contextId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?
    `);

    return stmt.all(contextId, limit, offset) as MessageRecord[];
  }

  /**
   * Get messages by task
   */
  getMessagesByTask(taskId: string): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages WHERE taskId = ? ORDER BY timestamp ASC
    `);

    return stmt.all(taskId) as MessageRecord[];
  }

  /**
   * Get undelivered messages for an agent
   */
  getUndeliveredMessages(toAgent: string): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages WHERE toAgent = ? AND delivered = 0 ORDER BY timestamp ASC
    `);

    return stmt.all(toAgent) as MessageRecord[];
  }

  /**
   * Mark message as delivered
   */
  markDelivered(messageId: string): void {
    const stmt = this.db.prepare(`
      UPDATE messages SET delivered = 1, deliveredAt = ? WHERE id = ?
    `);

    stmt.run(Date.now(), messageId);
  }

  /**
   * Get message count by context
   */
  getMessageCount(contextId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE contextId = ?
    `);

    const result = stmt.get(contextId) as { count: number };
    return result.count;
  }

  // ============================================
  // Task Operations
  // ============================================

  /**
   * Store a task
   */
  storeTask(task: A2ATask): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks (id, contextId, status, history, artifacts, metadata, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    stmt.run(
      task.id,
      task.contextId,
      JSON.stringify(task.status),
      JSON.stringify(task.history),
      task.artifacts ? JSON.stringify(task.artifacts) : null,
      task.metadata ? JSON.stringify(task.metadata) : null,
      now,
      now
    );
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): A2ATask | null {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `);

    const row = stmt.get(taskId) as TaskRecord | undefined;
    if (!row) return null;

    return this.rowToTask(row);
  }

  /**
   * Get tasks by context
   */
  getTasksByContext(contextId: string): A2ATask[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE contextId = ? ORDER BY createdAt DESC
    `);

    const rows = stmt.all(contextId) as TaskRecord[];
    return rows.map((row) => this.rowToTask(row));
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM tasks WHERE id = ?`);
    const result = stmt.run(taskId);
    return result.changes > 0;
  }

  /**
   * Convert database row to A2ATask
   */
  private rowToTask(row: TaskRecord): A2ATask {
    return {
      id: row.id,
      contextId: row.contextId,
      status: JSON.parse(row.status),
      history: JSON.parse(row.history),
      artifacts: row.artifacts ? JSON.parse(row.artifacts) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  // ============================================
  // Agent Card Operations
  // ============================================

  /**
   * Cache an agent card
   */
  cacheAgentCard(publicKey: string, card: AgentCard): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_cards (publicKey, card, updatedAt)
      VALUES (?, ?, ?)
    `);

    stmt.run(publicKey, JSON.stringify(card), Date.now());
  }

  /**
   * Get cached agent card
   */
  getAgentCard(publicKey: string): AgentCard | null {
    const stmt = this.db.prepare(`
      SELECT card FROM agent_cards WHERE publicKey = ?
    `);

    const row = stmt.get(publicKey) as { card: string } | undefined;
    return row ? JSON.parse(row.card) : null;
  }

  // ============================================
  // Offline Queue Operations
  // ============================================

  /**
   * Add to offline queue
   */
  addToQueue(id: string, toAgent: string, message: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO offline_queue (id, toAgent, message, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, toAgent, message, Date.now());
  }

  /**
   * Get pending queue items
   */
  getPendingQueue(toAgent: string): Array<{ id: string; message: string; attempts: number }> {
    const stmt = this.db.prepare(`
      SELECT id, message, attempts FROM offline_queue WHERE toAgent = ? AND delivered = 0
    `);

    return stmt.all(toAgent) as Array<{ id: string; message: string; attempts: number }>;
  }

  /**
   * Update queue item attempt
   */
  updateQueueAttempt(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE offline_queue SET attempts = attempts + 1, lastAttempt = ? WHERE id = ?
    `);

    stmt.run(Date.now(), id);
  }

  /**
   * Mark queue item as delivered
   */
  markQueueDelivered(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE offline_queue SET delivered = 1 WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Clean up old delivered items
   */
  cleanupQueue(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const stmt = this.db.prepare(`
      DELETE FROM offline_queue WHERE delivered = 1 AND timestamp < ?
    `);

    const result = stmt.run(cutoff);
    return result.changes;
  }

  // ============================================
  // Utility Operations
  // ============================================

  /**
   * Run a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Execute raw SQL
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get database instance for advanced operations
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Vacuum the database to reclaim space
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Get database size info
   */
  getStats(): {
    messages: number;
    tasks: number;
    agentCards: number;
    queueItems: number;
  } {
    const messages = (this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;
    const tasks = (this.db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;
    const agentCards = (this.db.prepare('SELECT COUNT(*) as count FROM agent_cards').get() as { count: number }).count;
    const queueItems = (this.db.prepare('SELECT COUNT(*) as count FROM offline_queue').get() as { count: number }).count;

    return { messages, tasks, agentCards, queueItems };
  }
}
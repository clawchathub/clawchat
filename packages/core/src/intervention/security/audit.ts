/**
 * Audit Logging Module for Intervention
 * Records all intervention operations for compliance and debugging
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AuditLogEntry,
  AuditConfig,
  AuditQueryOptions,
  AuditStorageType,
  InterventionAction,
} from './types.js';

// ============================================
// Audit Storage Interface
// ============================================

/**
 * Interface for audit log storage backends
 */
export interface AuditStorage {
  /** Store an audit log entry */
  store(entry: AuditLogEntry): Promise<void>;

  /** Query audit logs */
  query(options: AuditQueryOptions): Promise<AuditLogEntry[]>;

  /** Get a single entry by ID */
  get(id: string): Promise<AuditLogEntry | null>;

  /** Delete entries older than retention period */
  cleanup(olderThanDays: number): Promise<number>;

  /** Get total entry count */
  count(): Promise<number>;
}

// ============================================
// Memory Storage Backend
// ============================================

/**
 * In-memory audit log storage (for testing and simple use cases)
 */
export class MemoryAuditStorage implements AuditStorage {
  private entries: Map<string, AuditLogEntry> = new Map();
  private maxEntries: number | undefined;

  constructor(maxEntries?: number) {
    this.maxEntries = maxEntries;
  }

  async store(entry: AuditLogEntry): Promise<void> {
    // Enforce max entries limit
    if (this.maxEntries && this.entries.size >= this.maxEntries) {
      // Remove oldest entries
      const entries = Array.from(this.entries.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, entries.length - this.maxEntries + 1);
      for (const [id] of toRemove) {
        this.entries.delete(id);
      }
    }

    this.entries.set(entry.id, entry);
  }

  async query(options: AuditQueryOptions): Promise<AuditLogEntry[]> {
    let results = Array.from(this.entries.values());

    // Apply filters
    if (options.userId) {
      results = results.filter(e => e.userId === options.userId);
    }
    if (options.action) {
      results = results.filter(e => e.action === options.action);
    }
    if (options.resourceType) {
      results = results.filter(e => e.resourceType === options.resourceType);
    }
    if (options.resourceId) {
      results = results.filter(e => e.resourceId === options.resourceId);
    }
    if (options.conversationId) {
      results = results.filter(e => e.conversationId === options.conversationId);
    }
    if (options.result) {
      results = results.filter(e => e.result === options.result);
    }
    if (options.startTime) {
      results = results.filter(e => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter(e => e.timestamp <= options.endTime!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async get(id: string): Promise<AuditLogEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async cleanup(olderThanDays: number): Promise<number> {
    const threshold = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [id, entry] of this.entries.entries()) {
      if (entry.timestamp < threshold) {
        this.entries.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  async count(): Promise<number> {
    return this.entries.size;
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.entries.clear();
  }
}

// ============================================
// File Storage Backend
// ============================================

/**
 * File-based audit log storage
 */
export class FileAuditStorage implements AuditStorage {
  private filePath: string;
  private writeLock: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async store(entry: AuditLogEntry): Promise<void> {
    return this.withLock(async () => {
      const line = JSON.stringify(entry) + '\n';
      await fs.promises.appendFile(this.filePath, line, 'utf-8');
    });
  }

  async query(options: AuditQueryOptions): Promise<AuditLogEntry[]> {
    const results: AuditLogEntry[] = [];

    try {
      const content = await fs.promises.readFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const entry = JSON.parse(line) as AuditLogEntry;

          // Apply filters
          if (options.userId && entry.userId !== options.userId) continue;
          if (options.action && entry.action !== options.action) continue;
          if (options.resourceType && entry.resourceType !== options.resourceType) continue;
          if (options.resourceId && entry.resourceId !== options.resourceId) continue;
          if (options.conversationId && entry.conversationId !== options.conversationId) continue;
          if (options.result && entry.result !== options.result) continue;
          if (options.startTime && entry.timestamp < options.startTime) continue;
          if (options.endTime && entry.timestamp > options.endTime) continue;

          results.push(entry);
        } catch {
          // Skip malformed entries
          continue;
        }
      }

      // Sort by timestamp descending
      results.sort((a, b) => b.timestamp - a.timestamp);

      // Apply pagination
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 100;
      return results.slice(offset, offset + limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async get(id: string): Promise<AuditLogEntry | null> {
    const entries = await this.query({ limit: 10000, offset: 0 });
    return entries.find(e => e.id === id) ?? null;
  }

  async cleanup(olderThanDays: number): Promise<number> {
    return this.withLock(async () => {
      const threshold = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      let cleaned = 0;

      try {
        const content = await fs.promises.readFile(this.filePath, 'utf-8');
        const lines = content.trim().split('\n');
        const remaining: string[] = [];

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const entry = JSON.parse(line) as AuditLogEntry;
            if (entry.timestamp >= threshold) {
              remaining.push(line);
            } else {
              cleaned++;
            }
          } catch {
            // Skip malformed entries
            cleaned++;
          }
        }

        // Rewrite file with remaining entries
        await fs.promises.writeFile(
          this.filePath,
          remaining.join('\n') + (remaining.length > 0 ? '\n' : ''),
          'utf-8'
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      return cleaned;
    });
  }

  async count(): Promise<number> {
    try {
      const content = await fs.promises.readFile(this.filePath, 'utf-8');
      return content.trim().split('\n').filter(l => l.trim()).length;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const currentLock = this.writeLock;
    let releaseLock: () => void;

    this.writeLock = new Promise(resolve => {
      releaseLock = resolve;
    });

    await currentLock;
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  }
}

// ============================================
// Database Storage Backend (Stub)
// ============================================

/**
 * Database-backed audit log storage
 * Note: This is a stub implementation. In production, use a proper database client.
 */
export class DatabaseAuditStorage implements AuditStorage {
  private databaseUrl: string;
  private entries: Map<string, AuditLogEntry> = new Map(); // Stub implementation

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  async store(entry: AuditLogEntry): Promise<void> {
    // TODO: Implement actual database storage
    // Example with a hypothetical database client:
    // await db.query(
    //   'INSERT INTO audit_logs (id, timestamp, user_id, action, ...) VALUES ($1, $2, $3, $4, ...)',
    //   [entry.id, entry.timestamp, entry.userId, entry.action, ...]
    // );
    this.entries.set(entry.id, entry);
  }

  async query(options: AuditQueryOptions): Promise<AuditLogEntry[]> {
    // TODO: Implement actual database query
    const results = Array.from(this.entries.values());

    // Apply filters (same as memory storage)
    let filtered = results;
    if (options.userId) filtered = filtered.filter(e => e.userId === options.userId);
    if (options.action) filtered = filtered.filter(e => e.action === options.action);
    if (options.resourceType) filtered = filtered.filter(e => e.resourceType === options.resourceType);
    if (options.conversationId) filtered = filtered.filter(e => e.conversationId === options.conversationId);
    if (options.startTime) filtered = filtered.filter(e => e.timestamp >= options.startTime!);
    if (options.endTime) filtered = filtered.filter(e => e.timestamp <= options.endTime!);

    filtered.sort((a, b) => b.timestamp - a.timestamp);
    return filtered.slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 100));
  }

  async get(id: string): Promise<AuditLogEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async cleanup(olderThanDays: number): Promise<number> {
    const threshold = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [id, entry] of this.entries.entries()) {
      if (entry.timestamp < threshold) {
        this.entries.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  async count(): Promise<number> {
    return this.entries.size;
  }
}

// ============================================
// Audit Logger
// ============================================

/**
 * Main audit logger class
 */
export class AuditLogger {
  private storage: AuditStorage;
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
    this.storage = this.createStorage(config);
  }

  /**
   * Log an intervention operation
   */
  async log(params: {
    userId: string;
    sessionId?: string;
    action: string | InterventionAction;
    resourceType: string;
    resourceId?: string;
    conversationId?: string;
    result: 'success' | 'failure' | 'denied';
    errorMessage?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<AuditLogEntry> {
    if (!this.config.enabled) {
      // Return a dummy entry without storing
      return {
        id: uuidv4(),
        timestamp: Date.now(),
        ...params,
      } as AuditLogEntry;
    }

    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      userId: params.userId,
      sessionId: params.sessionId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      conversationId: params.conversationId,
      result: params.result,
      errorMessage: params.errorMessage,
      details: this.config.logSensitiveData ? params.details : this.sanitizeDetails(params.details),
      ipAddress: this.config.includeIpAddress ? params.ipAddress : undefined,
      userAgent: params.userAgent,
      correlationId: params.correlationId,
    };

    await this.storage.store(entry);
    return entry;
  }

  /**
   * Log a successful intervention
   */
  async logSuccess(params: {
    userId: string;
    sessionId?: string;
    action: string | InterventionAction;
    resourceType: string;
    resourceId?: string;
    conversationId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLogEntry> {
    return this.log({ ...params, result: 'success' });
  }

  /**
   * Log a failed intervention
   */
  async logFailure(params: {
    userId: string;
    sessionId?: string;
    action: string | InterventionAction;
    resourceType: string;
    resourceId?: string;
    conversationId?: string;
    errorMessage: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLogEntry> {
    return this.log({ ...params, result: 'failure' });
  }

  /**
   * Log a denied intervention
   */
  async logDenied(params: {
    userId: string;
    sessionId?: string;
    action: string | InterventionAction;
    resourceType: string;
    resourceId?: string;
    conversationId?: string;
    reason: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLogEntry> {
    return this.log({
      ...params,
      result: 'denied',
      errorMessage: params.reason,
    });
  }

  /**
   * Query audit logs
   */
  async query(options: AuditQueryOptions): Promise<AuditLogEntry[]> {
    return this.storage.query(options);
  }

  /**
   * Get a specific audit entry
   */
  async get(id: string): Promise<AuditLogEntry | null> {
    return this.storage.get(id);
  }

  /**
   * Run cleanup to remove old entries
   */
  async cleanup(): Promise<number> {
    return this.storage.cleanup(this.config.retentionDays);
  }

  /**
   * Get total entry count
   */
  async count(): Promise<number> {
    return this.storage.count();
  }

  /**
   * Get the underlying storage instance
   */
  getStorage(): AuditStorage {
    return this.storage;
  }

  /**
   * Create storage backend based on configuration
   */
  private createStorage(config: AuditConfig): AuditStorage {
    switch (config.storageType) {
      case 'memory':
        return new MemoryAuditStorage(config.maxEntries);

      case 'file':
        return new FileAuditStorage(config.filePath ?? './logs/audit.log');

      case 'database':
        return new DatabaseAuditStorage(config.databaseUrl ?? '');

      default:
        throw new Error(`Unknown audit storage type: ${config.storageType}`);
    }
  }

  /**
   * Sanitize sensitive details from log entries
   */
  private sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details) return undefined;

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'apiKey'];

    for (const [key, value] of Object.entries(details)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeDetails(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
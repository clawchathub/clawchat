/**
 * Store-and-Forward Mechanism
 * Ensures reliable message delivery with persistence
 */

import type { SQLiteAdapter } from './adapter.js';
import { MessageHistory } from './history.js';
import { OfflineQueue } from './queue.js';
import type { A2AMessage } from '@clawchat/core';

// ============================================
// Types
// ============================================

interface Logger {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface ForwardResult {
  success: boolean;
  messageId: string;
  delivered: boolean;
  queued: boolean;
  error?: string;
}

export interface DeliveryCallback {
  (message: A2AMessage, toAgent: string): Promise<boolean>;
}

export interface ForwardConfig {
  enableHistory: boolean;
  enableQueue: boolean;
  retryEnabled: boolean;
  retryInterval: number;
  logger?: Logger;
}

// ============================================
// Store-and-Forward Manager
// ============================================

export class StoreAndForward {
  private adapter: SQLiteAdapter;
  private history: MessageHistory;
  private queue: OfflineQueue;
  private config: ForwardConfig;
  private deliveryCallback: DeliveryCallback | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;

  constructor(
    adapter: SQLiteAdapter,
    config: Partial<ForwardConfig> = {}
  ) {
    this.adapter = adapter;
    this.history = new MessageHistory(adapter);
    this.queue = new OfflineQueue(adapter);
    this.logger = config.logger ?? {
      info: (...args) => console.log(...args),
      debug: (...args) => console.debug(...args),
      error: (...args) => console.error(...args),
      warn: (...args) => console.warn(...args),
    };
    this.config = {
      enableHistory: config.enableHistory ?? true,
      enableQueue: config.enableQueue ?? true,
      retryEnabled: config.retryEnabled ?? true,
      retryInterval: config.retryInterval ?? 60000, // 1 minute
      logger: this.logger,
    };
  }

  /**
   * Set the delivery callback function
   */
  setDeliveryCallback(callback: DeliveryCallback): void {
    this.deliveryCallback = callback;
  }

  /**
   * Send a message with store-and-forward
   */
  async send(
    message: A2AMessage,
    fromAgent: string,
    toAgent: string,
    contextId?: string,
    taskId?: string
  ): Promise<ForwardResult> {
    const messageId = this.history.store(message, fromAgent, toAgent, contextId, taskId);

    // Try direct delivery if callback is set
    if (this.deliveryCallback) {
      try {
        const delivered = await this.deliveryCallback(message, toAgent);

        if (delivered) {
          this.history.markDelivered([messageId]);
          return {
            success: true,
            messageId,
            delivered: true,
            queued: false,
          };
        }
      } catch (error) {
        // Delivery failed, queue the message
      }
    }

    // Queue for later delivery
    if (this.config.enableQueue) {
      const queued = this.queue.enqueue(toAgent, message, 'normal');
      return {
        success: true,
        messageId,
        delivered: false,
        queued: queued !== null,
        ...(queued ? {} : { error: 'Queue full' }),
      };
    }

    return {
      success: false,
      messageId,
      delivered: false,
      queued: false,
      error: 'Delivery failed and queue disabled',
    };
  }

  /**
   * Deliver pending messages for an agent
   */
  async deliverPending(toAgent: string): Promise<{
    delivered: number;
    failed: number;
  }> {
    if (!this.deliveryCallback) {
      return { delivered: 0, failed: 0 };
    }

    const pending = this.queue.getPending(toAgent);
    let delivered = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        const success = await this.deliveryCallback(item.message, toAgent);

        if (success) {
          this.queue.markDelivered(item.id);
          delivered++;
        } else {
          this.queue.markAttempted(item.id);
          if (!this.queue.canRetry(item)) {
            failed++;
          }
        }
      } catch (error) {
        this.queue.markAttempted(item.id);
        if (!this.queue.canRetry(item)) {
          failed++;
        }
      }
    }

    return { delivered, failed };
  }

  /**
   * Start automatic retry processing
   */
  startRetryProcessor(): void {
    if (!this.config.retryEnabled || this.retryTimer) {
      return;
    }

    this.retryTimer = setInterval(() => {
      this.processRetries().catch((error) => this.logger.error('Retry processing error:', error));
    }, this.config.retryInterval);
  }

  /**
   * Stop automatic retry processing
   */
  stopRetryProcessor(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Process retry attempts
   */
  private async processRetries(): Promise<void> {
    if (!this.deliveryCallback) {
      return;
    }

    const ready = this.queue.getReadyForRetry();

    for (const item of ready) {
      try {
        const success = await this.deliveryCallback(item.message, item.toAgent);

        if (success) {
          this.queue.markDelivered(item.id);
        } else {
          this.queue.markAttempted(item.id);
        }
      } catch (error) {
        this.queue.markAttempted(item.id);
      }
    }
  }

  /**
   * Get message history
   */
  getHistory(): MessageHistory {
    return this.history;
  }

  /**
   * Get offline queue
   */
  getQueue(): OfflineQueue {
    return this.queue;
  }

  /**
   * Get statistics
   */
  getStats(): {
    history: { total: number };
    queue: { pending: number; delivered: number; failed: number };
  } {
    const dbStats = this.adapter.getStats();
    const queueStats = this.queue.getStats();

    return {
      history: { total: dbStats.messages },
      queue: {
        pending: queueStats.pending,
        delivered: queueStats.delivered,
        failed: queueStats.failed,
      },
    };
  }

  /**
   * Perform maintenance
   */
  maintenance(): {
    historyDeleted: number;
    queueCleaned: { expired: number; failed: number };
  } {
    // Clean old history (older than 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const historyDeleted = this.history.deleteOlderThan(thirtyDaysAgo);

    // Clean queue
    const queueCleaned = this.queue.cleanup();

    // Clear delivered queue items
    this.queue.clearDelivered();

    return { historyDeleted, queueCleaned };
  }

  /**
   * Export data for backup
   */
  export(): {
    messages: unknown[];
    tasks: unknown[];
    queue: unknown[];
  } {
    const db = this.adapter.getDatabase();

    const messages = db.prepare('SELECT * FROM messages').all();
    const tasks = db.prepare('SELECT * FROM tasks').all();
    const queue = db.prepare('SELECT * FROM offline_queue').all();

    return { messages, tasks, queue };
  }
}
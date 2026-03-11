/**
 * Intervention Message Queue
 * High-performance priority queue with batch processing support
 */

import type { InterventionRequest, InterventionAction } from '../types.js';

// ============================================
// Types
// ============================================

export type QueuePriority = 'critical' | 'high' | 'normal' | 'low';

export interface QueuedIntervention {
  request: InterventionRequest;
  priority: QueuePriority;
  addedAt: number;
  attempts: number;
  lastAttemptAt?: number;
  error?: string;
}

export interface QueueConfig {
  maxSize: number;
  batchSize: number;
  batchTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  priorityWeights: Record<QueuePriority, number>;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxSize: 10000,
  batchSize: 50,
  batchTimeoutMs: 100, // Process batch after 100ms even if not full
  maxRetries: 3,
  retryDelayMs: 1000,
  priorityWeights: {
    critical: 100,
    high: 75,
    normal: 50,
    low: 25,
  },
};

export type BatchProcessor = (batch: InterventionRequest[]) => Promise<Map<string, boolean>>;
export type QueueEventHandler = (event: QueueEvent) => void;

export interface QueueEvent {
  type: 'enqueued' | 'dequeued' | 'batch_processed' | 'retry' | 'dropped' | 'error';
  queueSize: number;
  data?: unknown;
  timestamp: number;
}

// Priority mapping for intervention actions
export const ACTION_PRIORITY: Record<InterventionAction, QueuePriority> = {
  terminate: 'critical',
  pause: 'high',
  resume: 'high',
  reject: 'high',
  approve: 'normal',
  redirect: 'normal',
  send_message: 'normal',
  request_clarification: 'normal',
  delegate: 'low',
};

// ============================================
// Priority Queue Implementation
// ============================================

class PriorityQueue {
  private heaps: Map<QueuePriority, QueuedIntervention[]> = new Map();
  private size: number = 0;
  private weights: Record<QueuePriority, number>;

  constructor(weights: Record<QueuePriority, number>) {
    this.weights = weights;
    (['critical', 'high', 'normal', 'low'] as QueuePriority[]).forEach((p) => {
      this.heaps.set(p, []);
    });
  }

  enqueue(item: QueuedIntervention): void {
    const heap = this.heaps.get(item.priority);
    if (heap) {
      heap.push(item);
      this.heapifyUp(heap, heap.length - 1);
      this.size++;
    }
  }

  dequeue(): QueuedIntervention | undefined {
    // Check heaps in priority order
    const priorities: QueuePriority[] = ['critical', 'high', 'normal', 'low'];

    for (const priority of priorities) {
      const heap = this.heaps.get(priority);
      if (heap && heap.length > 0) {
        const item = heap[0];
        const last = heap.pop();
        if (heap.length > 0 && last) {
          heap[0] = last;
          this.heapifyDown(heap, 0);
        }
        this.size--;
        return item;
      }
    }

    return undefined;
  }

  peek(): QueuedIntervention | undefined {
    const priorities: QueuePriority[] = ['critical', 'high', 'normal', 'low'];

    for (const priority of priorities) {
      const heap = this.heaps.get(priority);
      if (heap && heap.length > 0) {
        return heap[0];
      }
    }

    return undefined;
  }

  getSize(): number {
    return this.size;
  }

  getDistribution(): Record<QueuePriority, number> {
    return {
      critical: this.heaps.get('critical')?.length || 0,
      high: this.heaps.get('high')?.length || 0,
      normal: this.heaps.get('normal')?.length || 0,
      low: this.heaps.get('low')?.length || 0,
    };
  }

  clear(): void {
    this.heaps.forEach((heap) => (heap.length = 0));
    this.size = 0;
  }

  private heapifyUp(heap: QueuedIntervention[], index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(heap[index], heap[parentIndex]) > 0) {
        [heap[index], heap[parentIndex]] = [heap[parentIndex], heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private heapifyDown(heap: QueuedIntervention[], index: number): void {
    const length = heap.length;

    while (true) {
      let largest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.compare(heap[left], heap[largest]) > 0) {
        largest = left;
      }

      if (right < length && this.compare(heap[right], heap[largest]) > 0) {
        largest = right;
      }

      if (largest !== index) {
        [heap[index], heap[largest]] = [heap[largest], heap[index]];
        index = largest;
      } else {
        break;
      }
    }
  }

  private compare(a: QueuedIntervention, b: QueuedIntervention): number {
    // Higher priority weight = higher priority
    const weightDiff = this.weights[a.priority] - this.weights[b.priority];
    if (weightDiff !== 0) return weightDiff;

    // Earlier added = higher priority (FIFO within same priority)
    return b.addedAt - a.addedAt;
  }
}

// ============================================
// Intervention Queue
// ============================================

export class InterventionQueue {
  private queue: PriorityQueue;
  private config: QueueConfig;
  private processor?: BatchProcessor;
  private eventHandlers: Set<QueueEventHandler> = new Set();
  private batchTimer?: ReturnType<typeof setTimeout>;
  private isProcessing: boolean = false;
  private pendingBatch: QueuedIntervention[] = [];
  private stats: QueueStats = {
    totalEnqueued: 0,
    totalProcessed: 0,
    totalRetries: 0,
    totalDropped: 0,
    totalErrors: 0,
    averageLatency: 0,
  };

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.queue = new PriorityQueue(this.config.priorityWeights);
  }

  /**
   * Set the batch processor function
   */
  setProcessor(processor: BatchProcessor): void {
    this.processor = processor;
  }

  /**
   * Enqueue an intervention request
   */
  enqueue(
    request: InterventionRequest,
    priority?: QueuePriority
  ): boolean {
    // Check queue capacity
    if (this.queue.getSize() >= this.config.maxSize) {
      // Try to drop lowest priority items
      if (!this.dropLowestPriority()) {
        this.emitEvent({
          type: 'dropped',
          queueSize: this.queue.getSize(),
          data: { request, reason: 'Queue full' },
          timestamp: Date.now(),
        });
        return false;
      }
    }

    // Determine priority based on action
    const finalPriority = priority || ACTION_PRIORITY[request.action];
    const item: QueuedIntervention = {
      request,
      priority: finalPriority,
      addedAt: Date.now(),
      attempts: 0,
    };

    this.queue.enqueue(item);
    this.stats.totalEnqueued++;

    this.emitEvent({
      type: 'enqueued',
      queueSize: this.queue.getSize(),
      data: { requestId: request.id, priority: finalPriority },
      timestamp: Date.now(),
    });

    // Schedule batch processing
    this.scheduleBatch();

    return true;
  }

  /**
   * Enqueue multiple requests
   */
  enqueueBatch(requests: InterventionRequest[]): number {
    let successCount = 0;
    for (const request of requests) {
      if (this.enqueue(request)) {
        successCount++;
      }
    }
    return successCount;
  }

  /**
   * Dequeue a single request
   */
  dequeue(): InterventionRequest | undefined {
    const item = this.queue.dequeue();
    if (item) {
      this.emitEvent({
        type: 'dequeued',
        queueSize: this.queue.getSize(),
        data: { requestId: item.request.id },
        timestamp: Date.now(),
      });
      return item.request;
    }
    return undefined;
  }

  /**
   * Dequeue a batch of requests
   */
  dequeueBatch(maxSize?: number): InterventionRequest[] {
    const size = maxSize || this.config.batchSize;
    const batch: InterventionRequest[] = [];

    while (batch.length < size) {
      const request = this.dequeue();
      if (!request) break;
      batch.push(request);
    }

    return batch;
  }

  /**
   * Process batch asynchronously
   */
  async processBatch(): Promise<void> {
    if (this.isProcessing || !this.processor) return;

    this.isProcessing = true;

    try {
      const batch = this.dequeueBatch();
      if (batch.length === 0) {
        this.isProcessing = false;
        return;
      }

      const results = await this.processor(batch);

      // Handle retries for failed items
      for (const request of batch) {
        const success = results.get(request.id);
        if (!success) {
          const item = this.pendingBatch.find((i) => i.request.id === request.id);
          if (item && item.attempts < this.config.maxRetries) {
            item.attempts++;
            item.lastAttemptAt = Date.now();
            item.error = 'Processing failed';
            this.queue.enqueue(item);
            this.stats.totalRetries++;
            this.emitEvent({
              type: 'retry',
              queueSize: this.queue.getSize(),
              data: { requestId: request.id, attempt: item.attempts },
              timestamp: Date.now(),
            });
          } else {
            this.stats.totalDropped++;
            this.emitEvent({
              type: 'dropped',
              queueSize: this.queue.getSize(),
              data: { requestId: request.id, reason: 'Max retries exceeded' },
              timestamp: Date.now(),
            });
          }
        }
      }

      this.stats.totalProcessed += batch.length;
      this.updateLatency(batch);

      this.emitEvent({
        type: 'batch_processed',
        queueSize: this.queue.getSize(),
        data: { batchSize: batch.length },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.stats.totalErrors++;
      this.emitEvent({
        type: 'error',
        queueSize: this.queue.getSize(),
        data: { error: error instanceof Error ? error.message : String(error) },
        timestamp: Date.now(),
      });
    } finally {
      this.isProcessing = false;
      this.pendingBatch = [];
    }
  }

  /**
   * Start processing
   */
  start(): void {
    this.scheduleBatch();
  }

  /**
   * Stop processing
   */
  stop(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.getSize();
  }

  /**
   * Get queue depth by priority
   */
  getDepth(): Record<QueuePriority, number> {
    return this.queue.getDistribution();
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * Subscribe to queue events
   */
  subscribe(handler: QueueEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.clear();
    this.pendingBatch = [];
  }

  // ============================================
  // Private Methods
  // ============================================

  private scheduleBatch(): void {
    if (this.batchTimer) return;

    // Process immediately if batch is full
    if (this.queue.getSize() >= this.config.batchSize) {
      this.processBatch();
      return;
    }

    // Schedule batch processing
    this.batchTimer = setTimeout(() => {
      this.batchTimer = undefined;
      if (this.queue.getSize() > 0) {
        this.processBatch();
      }
    }, this.config.batchTimeoutMs);
  }

  private dropLowestPriority(): boolean {
    const distribution = this.queue.getDistribution();

    // Drop from lowest priority queues first
    const priorities: QueuePriority[] = ['low', 'normal', 'high'];

    for (const priority of priorities) {
      if (distribution[priority] > 0) {
        // We can't easily remove from the middle of a heap,
        // so we dequeue and re-enqueue higher priority items
        // For simplicity, we'll just reject new items when full
        return false;
      }
    }

    return false;
  }

  private updateLatency(batch: InterventionRequest[]): void {
    const now = Date.now();
    const latencies = batch.map((r) => now - r.timestamp);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    // Exponential moving average
    this.stats.averageLatency = this.stats.averageLatency * 0.9 + avgLatency * 0.1;
  }

  private emitEvent(event: QueueEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }
}

// ============================================
// Types & Interfaces
// ============================================

export interface QueueStats {
  totalEnqueued: number;
  totalProcessed: number;
  totalRetries: number;
  totalDropped: number;
  totalErrors: number;
  averageLatency: number;
}
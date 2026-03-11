/**
 * Performance Metrics
 * Tracks intervention latency, queue depth, and connection status
 */

import type { QueuePriority } from './queue.js';
import type { ConnectionState } from './connection-pool.js';

// ============================================
// Types
// ============================================

export interface LatencyMetric {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface QueueMetric {
  depth: number;
  depthByPriority: Record<QueuePriority, number>;
  enqueueRate: number;
  dequeueRate: number;
  avgWaitTime: number;
}

export interface ConnectionMetric {
  total: number;
  active: number;
  idle: number;
  pending: number;
  error: number;
  messagesPerSecond: number;
  errorsPerSecond: number;
}

export interface MemoryMetric {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  conversationCount: number;
  messageCount: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  latency: LatencyMetric;
  queue: QueueMetric;
  connections: ConnectionMetric;
  memory: MemoryMetric;
}

export interface MetricsConfig {
  collectionInterval: number;
  latencyWindowSize: number;
  rateWindowSize: number;
  enableMemoryMetrics: boolean;
}

export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  collectionInterval: 1000,
  latencyWindowSize: 1000,
  rateWindowSize: 60000,
  enableMemoryMetrics: true,
};

export type MetricsEventHandler = (snapshot: PerformanceSnapshot) => void;

// ============================================
// Latency Tracker
// ============================================

class LatencyTracker {
  private samples: number[] = [];
  private windowSize: number;

  constructor(windowSize: number) {
    this.windowSize = windowSize;
  }

  record(value: number): void {
    this.samples.push(value);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  getMetrics(): LatencyMetric {
    if (this.samples.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        count: 0,
      };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      count: sorted.length,
    };
  }

  clear(): void {
    this.samples = [];
  }
}

// ============================================
// Rate Tracker
// ============================================

class RateTracker {
  private timestamps: number[] = [];
  private windowSize: number;

  constructor(windowSize: number) {
    this.windowSize = windowSize;
  }

  record(): void {
    this.timestamps.push(Date.now());
    this.prune();
  }

  getRate(): number {
    this.prune();
    if (this.timestamps.length === 0) return 0;
    const windowSeconds = this.windowSize / 1000;
    return this.timestamps.length / windowSeconds;
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowSize;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }

  clear(): void {
    this.timestamps = [];
  }
}

// ============================================
// Performance Metrics Collector
// ============================================

export class PerformanceMetrics {
  private config: MetricsConfig;
  private interventionLatency: LatencyTracker;
  private queueLatency: LatencyTracker;
  private enqueueTracker: RateTracker;
  private dequeueTracker: RateTracker;
  private messageTracker: RateTracker;
  private errorTracker: RateTracker;
  private queueDepth: number = 0;
  private queueDepthByPriority: Record<QueuePriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };
  private connectionStates: Map<string, ConnectionState> = new Map();
  private conversationCount: number = 0;
  private messageCount: number = 0;
  private eventHandlers: Set<MetricsEventHandler> = new Set();
  private collectionInterval?: ReturnType<typeof setInterval>;
  private snapshots: PerformanceSnapshot[] = [];
  private maxSnapshots: number = 3600; // 1 hour at 1 second intervals

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    this.interventionLatency = new LatencyTracker(this.config.latencyWindowSize);
    this.queueLatency = new LatencyTracker(this.config.latencyWindowSize);
    this.enqueueTracker = new RateTracker(this.config.rateWindowSize);
    this.dequeueTracker = new RateTracker(this.config.rateWindowSize);
    this.messageTracker = new RateTracker(this.config.rateWindowSize);
    this.errorTracker = new RateTracker(this.config.rateWindowSize);
  }

  /**
   * Record intervention latency
   */
  recordInterventionLatency(latencyMs: number): void {
    this.interventionLatency.record(latencyMs);
  }

  /**
   * Record queue operation latency
   */
  recordQueueLatency(latencyMs: number): void {
    this.queueLatency.record(latencyMs);
  }

  /**
   * Record enqueue event
   */
  recordEnqueue(): void {
    this.enqueueTracker.record();
  }

  /**
   * Record dequeue event
   */
  recordDequeue(): void {
    this.dequeueTracker.record();
  }

  /**
   * Record message sent
   */
  recordMessage(): void {
    this.messageTracker.record();
  }

  /**
   * Record error
   */
  recordError(): void {
    this.errorTracker.record();
  }

  /**
   * Update queue depth
   */
  updateQueueDepth(depth: number, byPriority?: Record<QueuePriority, number>): void {
    this.queueDepth = depth;
    if (byPriority) {
      this.queueDepthByPriority = { ...byPriority };
    }
  }

  /**
   * Update connection state
   */
  updateConnectionState(connectionId: string, state: ConnectionState): void {
    this.connectionStates.set(connectionId, state);
  }

  /**
   * Remove connection
   */
  removeConnection(connectionId: string): void {
    this.connectionStates.delete(connectionId);
  }

  /**
   * Update conversation count
   */
  updateConversationCount(count: number): void {
    this.conversationCount = count;
  }

  /**
   * Update message count
   */
  updateMessageCount(count: number): void {
    this.messageCount = count;
  }

  /**
   * Start metrics collection
   */
  start(): void {
    this.stop();
    this.collectionInterval = setInterval(() => {
      this.collect();
    }, this.config.collectionInterval);
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  /**
   * Get current snapshot
   */
  getSnapshot(): PerformanceSnapshot {
    return {
      timestamp: Date.now(),
      latency: this.interventionLatency.getMetrics(),
      queue: this.getQueueMetrics(),
      connections: this.getConnectionMetrics(),
      memory: this.getMemoryMetrics(),
    };
  }

  /**
   * Get historical snapshots
   */
  getHistory(duration: number): PerformanceSnapshot[] {
    const cutoff = Date.now() - duration;
    return this.snapshots.filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Get aggregated metrics over a time period
   */
  getAggregatedMetrics(duration: number): {
    avgLatency: number;
    maxLatency: number;
    totalMessages: number;
    totalErrors: number;
    avgQueueDepth: number;
  } {
    const history = this.getHistory(duration);
    if (history.length === 0) {
      return {
        avgLatency: 0,
        maxLatency: 0,
        totalMessages: 0,
        totalErrors: 0,
        avgQueueDepth: 0,
      };
    }

    const avgLatency = history.reduce((sum, s) => sum + s.latency.avg, 0) / history.length;
    const maxLatency = Math.max(...history.map((s) => s.latency.max));
    const totalMessages = history.reduce((sum, s) => sum + s.connections.messagesPerSecond, 0);
    const totalErrors = history.reduce((sum, s) => sum + s.connections.errorsPerSecond, 0);
    const avgQueueDepth = history.reduce((sum, s) => sum + s.queue.depth, 0) / history.length;

    return { avgLatency, maxLatency, totalMessages, totalErrors, avgQueueDepth };
  }

  /**
   * Subscribe to metrics events
   */
  subscribe(handler: MetricsEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.interventionLatency.clear();
    this.queueLatency.clear();
    this.enqueueTracker.clear();
    this.dequeueTracker.clear();
    this.messageTracker.clear();
    this.errorTracker.clear();
    this.connectionStates.clear();
    this.snapshots = [];
    this.queueDepth = 0;
    this.conversationCount = 0;
    this.messageCount = 0;
  }

  // ============================================
  // Private Methods
  // ============================================

  private collect(): void {
    const snapshot = this.getSnapshot();
    this.snapshots.push(snapshot);

    // Trim old snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Emit to subscribers
    for (const handler of this.eventHandlers) {
      try {
        handler(snapshot);
      } catch {
        // Ignore handler errors
      }
    }
  }

  private getQueueMetrics(): QueueMetric {
    return {
      depth: this.queueDepth,
      depthByPriority: { ...this.queueDepthByPriority },
      enqueueRate: this.enqueueTracker.getRate(),
      dequeueRate: this.dequeueTracker.getRate(),
      avgWaitTime: this.queueLatency.getMetrics().avg,
    };
  }

  private getConnectionMetrics(): ConnectionMetric {
    let active = 0;
    let idle = 0;
    let pending = 0;
    let error = 0;

    for (const state of this.connectionStates.values()) {
      switch (state) {
        case 'connected':
          active++;
          break;
        case 'connecting':
        case 'reconnecting':
          pending++;
          break;
        case 'error':
          error++;
          break;
        default:
          idle++;
      }
    }

    return {
      total: this.connectionStates.size,
      active,
      idle,
      pending,
      error,
      messagesPerSecond: this.messageTracker.getRate(),
      errorsPerSecond: this.errorTracker.getRate(),
    };
  }

  private getMemoryMetrics(): MemoryMetric {
    const memory: MemoryMetric = {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      conversationCount: this.conversationCount,
      messageCount: this.messageCount,
    };

    // Only available in Node.js
    if (this.config.enableMemoryMetrics && typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      memory.heapUsed = mem.heapUsed;
      memory.heapTotal = mem.heapTotal;
      memory.external = mem.external;
      memory.rss = mem.rss;
    }

    return memory;
  }
}

// ============================================
// Performance Alerts
// ============================================

export interface AlertThreshold {
  metric: 'latency' | 'queueDepth' | 'errorRate' | 'connectionErrors';
  threshold: number;
  comparison: 'gt' | 'lt' | 'eq';
  duration: number;
}

export interface PerformanceAlert {
  id: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
  message: string;
}

export type AlertHandler = (alert: PerformanceAlert) => void;

export class PerformanceAlerter {
  private thresholds: Map<string, AlertThreshold> = new Map();
  private handlers: Set<AlertHandler> = new Set();
  private metrics: PerformanceMetrics;
  private checkInterval?: ReturnType<typeof setInterval>;

  constructor(metrics: PerformanceMetrics) {
    this.metrics = metrics;
  }

  /**
   * Add an alert threshold
   */
  addThreshold(id: string, threshold: AlertThreshold): void {
    this.thresholds.set(id, threshold);
  }

  /**
   * Remove an alert threshold
   */
  removeThreshold(id: string): void {
    this.thresholds.delete(id);
  }

  /**
   * Subscribe to alerts
   */
  subscribe(handler: AlertHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Start checking alerts
   */
  start(intervalMs: number = 5000): void {
    this.stop();
    this.checkInterval = setInterval(() => {
      this.checkAlerts();
    }, intervalMs);
  }

  /**
   * Stop checking alerts
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  private checkAlerts(): void {
    const snapshot = this.metrics.getSnapshot();

    for (const [id, threshold] of this.thresholds) {
      let value: number;

      switch (threshold.metric) {
        case 'latency':
          value = snapshot.latency.p95;
          break;
        case 'queueDepth':
          value = snapshot.queue.depth;
          break;
        case 'errorRate':
          value = snapshot.connections.errorsPerSecond;
          break;
        case 'connectionErrors':
          value = snapshot.connections.error;
          break;
        default:
          continue;
      }

      const triggered = this.evaluateThreshold(value, threshold);

      if (triggered) {
        const alert: PerformanceAlert = {
          id,
          metric: threshold.metric,
          value,
          threshold: threshold.threshold,
          timestamp: Date.now(),
          message: `${threshold.metric} (${value.toFixed(2)}) ${threshold.comparison === 'gt' ? 'exceeded' : 'below'} threshold (${threshold.threshold})`,
        };

        for (const handler of this.handlers) {
          try {
            handler(alert);
          } catch {
            // Ignore handler errors
          }
        }
      }
    }
  }

  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.comparison) {
      case 'gt':
        return value > threshold.threshold;
      case 'lt':
        return value < threshold.threshold;
      case 'eq':
        return value === threshold.threshold;
      default:
        return false;
    }
  }
}
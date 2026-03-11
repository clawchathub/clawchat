/**
 * Performance Module
 * High-performance components for large-scale conversation handling
 */

export {
  // Sharding
  ShardedConversationStore,
  ConversationShard,
  getShardKey,
  DEFAULT_SHARDING_CONFIG,
  type ShardedConversationState,
  type HistoryChunk,
  type ShardingConfig,
} from './sharding.js';

export {
  // Queue
  InterventionQueue,
  DEFAULT_QUEUE_CONFIG,
  ACTION_PRIORITY,
  type QueuePriority,
  type QueuedIntervention,
  type QueueConfig,
  type BatchProcessor,
  type QueueEventHandler,
  type QueueEvent,
  type QueueStats,
} from './queue.js';

export {
  // Connection Pool
  WebSocketConnectionPool,
  DEFAULT_CONNECTION_CONFIG,
  type ConnectionConfig,
  type ConnectionState,
  type PooledConnection,
  type ConnectionPoolStats,
  type MessageHandler,
  type ConnectionEventHandler,
} from './connection-pool.js';

export {
  // Metrics
  PerformanceMetrics,
  PerformanceAlerter,
  DEFAULT_METRICS_CONFIG,
  type LatencyMetric,
  type QueueMetric,
  type ConnectionMetric,
  type MemoryMetric,
  type PerformanceSnapshot,
  type MetricsConfig,
  type MetricsEventHandler,
  type AlertThreshold,
  type PerformanceAlert,
  type AlertHandler,
} from './metrics.js';
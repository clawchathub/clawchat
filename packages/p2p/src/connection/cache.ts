/**
 * Connection Cache Module
 * Caches successful connection paths for optimization
 */

import type { NATType } from '../nat/stun.js';

// ============================================
// Types
// ============================================

export interface ConnectionPath {
  peerPublicKey: string;
  method: 'direct' | 'relay' | 'hole-punch';
  endpoint?: {
    ip: string;
    port: number;
  };
  relayUrl?: string;
  latency: number;
  successRate: number;
  lastUsed: number;
  createdAt: number;
  attempts: number;
  successes: number;
}

export interface CacheConfig {
  maxEntries: number;
  entryTTL: number; // Time to live in milliseconds
  minSuccessRate: number; // Minimum success rate to keep entry
}

export interface CacheStats {
  totalEntries: number;
  directConnections: number;
  relayConnections: number;
  averageLatency: number;
  hitRate: number;
}

// ============================================
// Connection Cache
// ============================================

export class ConnectionCache {
  private cache: Map<string, ConnectionPath> = new Map();
  private config: CacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 1000,
      entryTTL: config.entryTTL ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      minSuccessRate: config.minSuccessRate ?? 0.3, // 30%
    };
  }

  /**
   * Get cached connection path for a peer
   */
  get(peerPublicKey: string): ConnectionPath | null {
    const entry = this.cache.get(peerPublicKey);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.createdAt > this.config.entryTTL) {
      this.cache.delete(peerPublicKey);
      this.misses++;
      return null;
    }

    // Check if success rate is too low
    if (entry.successRate < this.config.minSuccessRate) {
      this.cache.delete(peerPublicKey);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry;
  }

  /**
   * Store a successful connection path
   */
  set(peerPublicKey: string, path: Omit<ConnectionPath, 'peerPublicKey' | 'createdAt' | 'lastUsed' | 'attempts' | 'successes' | 'successRate'>): void {
    // Enforce max entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const now = Date.now();
    const existing = this.cache.get(peerPublicKey);

    this.cache.set(peerPublicKey, {
      peerPublicKey,
      ...path,
      createdAt: existing?.createdAt ?? now,
      lastUsed: now,
      attempts: (existing?.attempts ?? 0) + 1,
      successes: (existing?.successes ?? 0) + 1,
      successRate: ((existing?.successes ?? 0) + 1) / ((existing?.attempts ?? 0) + 1),
    });
  }

  /**
   * Record a failed connection attempt
   */
  recordFailure(peerPublicKey: string): void {
    const entry = this.cache.get(peerPublicKey);
    if (entry) {
      entry.attempts++;
      entry.successRate = entry.successes / entry.attempts;
      entry.lastUsed = Date.now();

      // Remove if success rate drops too low
      if (entry.successRate < this.config.minSuccessRate) {
        this.cache.delete(peerPublicKey);
      }
    }
  }

  /**
   * Update latency for a connection
   */
  updateLatency(peerPublicKey: string, latency: number): void {
    const entry = this.cache.get(peerPublicKey);
    if (entry) {
      // Exponential moving average
      entry.latency = entry.latency * 0.7 + latency * 0.3;
    }
  }

  /**
   * Get best connection method for a peer
   */
  getBestMethod(peerPublicKey: string): 'direct' | 'relay' | 'hole-punch' | null {
    const entry = this.get(peerPublicKey);
    return entry?.method ?? null;
  }

  /**
   * Get all peers with direct connection capability
   */
  getDirectCapablePeers(): string[] {
    return Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.method === 'direct' && entry.successRate >= this.config.minSuccessRate)
      .map(([key]) => key);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const directCount = entries.filter((e) => e.method === 'direct').length;
    const relayCount = entries.filter((e) => e.method === 'relay').length;
    const avgLatency = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.latency, 0) / entries.length
      : 0;

    return {
      totalEntries: this.cache.size,
      directConnections: directCount,
      relayConnections: relayCount,
      averageLatency: Math.round(avgLatency),
      hitRate: this.hits + this.misses > 0
        ? this.hits / (this.hits + this.misses)
        : 0,
    };
  }

  /**
   * Clear expired entries
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.config.entryTTL) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Export cache for persistence
   */
  export(): ConnectionPath[] {
    return Array.from(this.cache.values());
  }

  /**
   * Import cache from persistence
   */
  import(paths: ConnectionPath[]): void {
    for (const path of paths) {
      if (Date.now() - path.createdAt <= this.config.entryTTL) {
        this.cache.set(path.peerPublicKey, path);
      }
    }
  }

  /**
   * Evict oldest entries to make room
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let globalCache: ConnectionCache | null = null;

export function getConnectionCache(): ConnectionCache {
  if (!globalCache) {
    globalCache = new ConnectionCache();
  }
  return globalCache;
}
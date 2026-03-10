/**
 * Bootstrap Node Configuration
 * Defines seed nodes for network entry
 */

// ============================================
// Types
// ============================================

export interface BootstrapNode {
  publicKey: string;
  endpoints: string[]; // WebSocket URLs
  reliability: number; // 0-1 score
  lastSeen?: number;
  region?: string;
}

export interface BootstrapConfig {
  nodes: BootstrapNode[];
  discoveryTimeout: number;
  maxRetries: number;
  minNodes: number;
  refreshInterval: number;
}

// ============================================
// Default Bootstrap Nodes
// ============================================

/**
 * Default public bootstrap nodes
 * These are well-known nodes for network entry
 */
export const DEFAULT_BOOTSTRAP_NODES: BootstrapNode[] = [
  // Example bootstrap nodes (would be replaced with actual nodes)
  // {
  //   publicKey: 'abc123...',
  //   endpoints: ['wss://bootstrap1.clawchat.dev:18790'],
  //   reliability: 0.99,
  //   region: 'us-east',
  // },
];

/**
 * Default bootstrap configuration
 */
export const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = {
  nodes: DEFAULT_BOOTSTRAP_NODES,
  discoveryTimeout: 30000, // 30 seconds
  maxRetries: 3,
  minNodes: 1, // At least 1 node needed
  refreshInterval: 60 * 60 * 1000, // 1 hour
};

// ============================================
// Bootstrap Config Manager
// ============================================

export class BootstrapConfigManager {
  private config: BootstrapConfig;
  private customNodes: Map<string, BootstrapNode> = new Map();

  constructor(config: Partial<BootstrapConfig> = {}) {
    this.config = { ...DEFAULT_BOOTSTRAP_CONFIG, ...config };
  }

  /**
   * Get all bootstrap nodes (default + custom)
   */
  getNodes(): BootstrapNode[] {
    const now = Date.now();
    const allNodes = [...this.config.nodes, ...this.customNodes.values()];

    // Filter out stale nodes
    return allNodes.filter((node) => {
      if (node.lastSeen === undefined) return true;
      return now - node.lastSeen < 24 * 60 * 60 * 1000; // 24 hours
    });
  }

  /**
   * Add a custom bootstrap node
   */
  addNode(node: BootstrapNode): void {
    this.customNodes.set(node.publicKey, {
      ...node,
      lastSeen: Date.now(),
    });
  }

  /**
   * Remove a bootstrap node
   */
  removeNode(publicKey: string): boolean {
    return this.customNodes.delete(publicKey);
  }

  /**
   * Update node reliability score
   */
  updateReliability(publicKey: string, success: boolean): void {
    const node = this.customNodes.get(publicKey) ??
      this.config.nodes.find((n) => n.publicKey === publicKey);

    if (node) {
      // Exponential moving average
      const alpha = 0.1;
      node.reliability = success
        ? node.reliability * (1 - alpha) + alpha
        : node.reliability * (1 - alpha);
      node.lastSeen = Date.now();
    }
  }

  /**
   * Get nodes sorted by reliability
   */
  getNodesByReliability(): BootstrapNode[] {
    return this.getNodes().sort((a, b) => b.reliability - a.reliability);
  }

  /**
   * Get nodes in a specific region
   */
  getNodesByRegion(region: string): BootstrapNode[] {
    return this.getNodes().filter((node) => node.region === region);
  }

  /**
   * Get configuration
   */
  getConfig(): BootstrapConfig {
    return { ...this.config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<BootstrapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Export configuration for persistence
   */
  export(): { config: BootstrapConfig; customNodes: BootstrapNode[] } {
    return {
      config: this.config,
      customNodes: Array.from(this.customNodes.values()),
    };
  }

  /**
   * Import configuration from persistence
   */
  import(data: { config?: Partial<BootstrapConfig>; customNodes?: BootstrapNode[] }): void {
    if (data.config) {
      this.config = { ...this.config, ...data.config };
    }
    if (data.customNodes) {
      for (const node of data.customNodes) {
        this.customNodes.set(node.publicKey, node);
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let globalManager: BootstrapConfigManager | null = null;

export function getBootstrapManager(): BootstrapConfigManager {
  if (!globalManager) {
    globalManager = new BootstrapConfigManager();
  }
  return globalManager;
}
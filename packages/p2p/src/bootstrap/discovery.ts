/**
 * Bootstrap Discovery
 * Handles initial peer discovery via bootstrap nodes
 */

import WebSocket from 'ws';
import type { BootstrapNode, BootstrapConfig } from './config.js';
import { getBootstrapManager } from './config.js';
import type { AgentCard } from '@clawchat/core';

// ============================================
// Types
// ============================================

export interface DiscoveredPeer {
  publicKey: string;
  agentCard: AgentCard;
  endpoints: string[];
  discoveredAt: number;
  viaBootstrap: string; // Which bootstrap node provided this
}

export interface DiscoveryResult {
  success: boolean;
  peers: DiscoveredPeer[];
  errors: string[];
  duration: number;
}

// ============================================
// Bootstrap Discovery
// ============================================

export class BootstrapDiscovery {
  private manager: ReturnType<typeof getBootstrapManager>;

  constructor() {
    this.manager = getBootstrapManager();
  }

  /**
   * Discover peers via bootstrap nodes
   */
  async discoverPeers(localPublicKey?: string): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const peers: DiscoveredPeer[] = [];
    const errors: string[] = [];

    const nodes = this.manager.getNodesByReliability();
    const config = this.manager.getConfig();

    if (nodes.length === 0) {
      return {
        success: false,
        peers: [],
        errors: ['No bootstrap nodes configured'],
        duration: Date.now() - startTime,
      };
    }

    // Try to connect to bootstrap nodes in parallel
    const results = await Promise.allSettled(
      nodes.slice(0, config.maxRetries).map((node) =>
        this.queryBootstrapNode(node, localPublicKey, config.discoveryTimeout)
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        peers.push(...result.value);
      } else {
        errors.push(result.reason?.message ?? 'Unknown error');
      }
    }

    // Deduplicate peers by publicKey
    const uniquePeers = this.deduplicatePeers(peers);

    return {
      success: uniquePeers.length >= config.minNodes,
      peers: uniquePeers,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Query a single bootstrap node for peers
   */
  private async queryBootstrapNode(
    node: BootstrapNode,
    localPublicKey?: string,
    timeout: number = 30000
  ): Promise<DiscoveredPeer[]> {
    return new Promise((resolve, reject) => {
      const endpoint = node.endpoints[0];
      if (!endpoint) {
        reject(new Error(`No endpoints for node ${node.publicKey}`));
        return;
      }

      const ws = new WebSocket(endpoint);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Connection timeout'));
      }, timeout);

      ws.on('open', () => {
        // Request peer list
        ws.send(JSON.stringify({
          type: 'discover',
          publicKey: localPublicKey,
        }));
      });

      ws.on('message', (data) => {
        try {
          clearTimeout(timer);
          const msg = JSON.parse(data.toString());

          if (msg.type === 'peers') {
            const peers: DiscoveredPeer[] = (msg.peers || []).map((p: any) => ({
              publicKey: p.publicKey,
              agentCard: p.agentCard,
              endpoints: p.endpoints || [],
              discoveredAt: Date.now(),
              viaBootstrap: node.publicKey,
            }));

            ws.close();
            resolve(peers);
          } else if (msg.type === 'error') {
            ws.close();
            reject(new Error(msg.error));
          }
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Announce presence to bootstrap nodes
   */
  async announce(
    agentCard: AgentCard,
    endpoints: string[]
  ): Promise<{ success: boolean; announcedTo: string[]; errors: string[] }> {
    const nodes = this.manager.getNodesByReliability();
    const announcedTo: string[] = [];
    const errors: string[] = [];

    for (const node of nodes.slice(0, 3)) { // Announce to top 3 nodes
      try {
        await this.announceToNode(node, agentCard, endpoints);
        announcedTo.push(node.publicKey);
        this.manager.updateReliability(node.publicKey, true);
      } catch (err) {
        errors.push(`${node.publicKey}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        this.manager.updateReliability(node.publicKey, false);
      }
    }

    return {
      success: announcedTo.length > 0,
      announcedTo,
      errors,
    };
  }

  /**
   * Announce to a single bootstrap node
   */
  private async announceToNode(
    node: BootstrapNode,
    agentCard: AgentCard,
    endpoints: string[],
    timeout: number = 10000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = node.endpoints[0];
      if (!endpoint) {
        reject(new Error('No endpoint'));
        return;
      }

      const ws = new WebSocket(endpoint);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Announce timeout'));
      }, timeout);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'announce',
          agentCard,
          endpoints,
        }));
      });

      ws.on('message', (data) => {
        try {
          clearTimeout(timer);
          const msg = JSON.parse(data.toString());

          if (msg.type === 'announced') {
            ws.close();
            resolve();
          } else if (msg.type === 'error') {
            ws.close();
            reject(new Error(msg.error));
          }
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Remove duplicate peers
   */
  private deduplicatePeers(peers: DiscoveredPeer[]): DiscoveredPeer[] {
    const seen = new Map<string, DiscoveredPeer>();

    for (const peer of peers) {
      const existing = seen.get(peer.publicKey);
      if (!existing || peer.discoveredAt > existing.discoveredAt) {
        seen.set(peer.publicKey, peer);
      }
    }

    return Array.from(seen.values());
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Quick peer discovery using default bootstrap nodes
 */
export async function discoverPeers(localPublicKey?: string): Promise<DiscoveredPeer[]> {
  const discovery = new BootstrapDiscovery();
  const result = await discovery.discoverPeers(localPublicKey);
  return result.peers;
}
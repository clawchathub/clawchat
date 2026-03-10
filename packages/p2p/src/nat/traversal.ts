/**
 * NAT Traversal Utilities
 * Implements hole punching and ICE-like coordination
 */

import WebSocket from 'ws';
import type { NATType, STUNResult } from './stun.js';

// ============================================
// Types
// ============================================

export interface PeerEndpoint {
  ip: string;
  port: number;
  natType?: NATType;
}

export interface HolePunchResult {
  success: boolean;
  connection?: WebSocket;
  endpoint?: PeerEndpoint;
  error?: string;
}

export interface ICECandidate {
  type: 'host' | 'srflx' | 'relay';
  ip: string;
  port: number;
  priority: number;
  relatedAddress?: string;
  relatedPort?: number;
}

export interface TraversalConfig {
  holePunchTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

// ============================================
// NAT Traversal Manager
// ============================================

export class NATTraversal {
  private config: TraversalConfig;
  private localNATInfo: STUNResult | null = null;

  constructor(config: Partial<TraversalConfig> = {}) {
    this.config = {
      holePunchTimeout: config.holePunchTimeout ?? 10000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * Set local NAT info from STUN detection
   */
  setLocalNATInfo(info: STUNResult): void {
    this.localNATInfo = info;
  }

  /**
   * Generate ICE-like candidates for connection
   */
  generateCandidates(): ICECandidate[] {
    const candidates: ICECandidate[] = [];

    if (this.localNATInfo) {
      // Host candidate (local address)
      candidates.push({
        type: 'host',
        ip: this.localNATInfo.localIP,
        port: this.localNATInfo.localPort,
        priority: 126, // Highest priority
      });

      // Server reflexive candidate (public address)
      if (this.localNATInfo.publicIP) {
        candidates.push({
          type: 'srflx',
          ip: this.localNATInfo.publicIP,
          port: this.localNATInfo.publicPort!,
          priority: 100,
          relatedAddress: this.localNATInfo.localIP,
          relatedPort: this.localNATInfo.localPort,
        });
      }
    }

    return candidates;
  }

  /**
   * Attempt hole punching with a peer
   * Both sides must call this simultaneously
   */
  async attemptHolePunch(
    localPort: number,
    peerEndpoint: PeerEndpoint
  ): Promise<HolePunchResult> {
    let attempts = 0;

    while (attempts < this.config.maxRetries) {
      attempts++;

      try {
        // Create WebSocket server for incoming connections
        const server = new WebSocket.Server({ port: localPort });

        const result = await new Promise<HolePunchResult>((resolve) => {
          const timeout = setTimeout(() => {
            server.close();
            resolve({
              success: false,
              error: 'Hole punch timeout',
            });
          }, this.config.holePunchTimeout);

          // Handle incoming connection
          server.on('connection', (ws) => {
            clearTimeout(timeout);
            server.close();
            resolve({
              success: true,
              connection: ws,
              endpoint: peerEndpoint,
            });
          });

          // Simultaneously try to connect to peer
          const clientWs = new WebSocket(
            `ws://${peerEndpoint.ip}:${peerEndpoint.port}`
          );

          clientWs.on('open', () => {
            clearTimeout(timeout);
            server.close();
            resolve({
              success: true,
              connection: clientWs,
              endpoint: peerEndpoint,
            });
          });

          clientWs.on('error', () => {
            // Connection failed, wait for incoming
          });
        });

        if (result.success) {
          return result;
        }

        // Wait before retry
        await this.delay(this.config.retryDelay);
      } catch (error) {
        // Continue to next attempt
      }
    }

    return {
      success: false,
      error: `Hole punch failed after ${attempts} attempts`,
    };
  }

  /**
   * Check if direct connection is possible based on NAT types
   */
  canAttemptDirect(natType1?: NATType, natType2?: NATType): boolean {
    // Public IP can always connect
    if (natType1 === 'public' || natType2 === 'public') {
      return true;
    }

    // Symmetric NAT on both sides requires relay
    if (natType1 === 'symmetric' && natType2 === 'symmetric') {
      return false;
    }

    // Symmetric NAT on one side may work with port prediction
    // but is unreliable, so we recommend relay
    if (natType1 === 'symmetric' || natType2 === 'symmetric') {
      return false;
    }

    // Other NAT types can use hole punching
    return true;
  }

  /**
   * Select best connection path
   */
  selectBestPath(
    localCandidates: ICECandidate[],
    remoteCandidates: ICECandidate[]
  ): { local: ICECandidate; remote: ICECandidate } | null {
    // Sort by priority (higher is better)
    const sortedLocal = [...localCandidates].sort((a, b) => b.priority - a.priority);
    const sortedRemote = [...remoteCandidates].sort((a, b) => b.priority - a.priority);

    // Prefer direct connection (host to host, srflx to host, etc.)
    for (const local of sortedLocal) {
      for (const remote of sortedRemote) {
        // Skip relay candidates if direct is possible
        if (local.type === 'relay' || remote.type === 'relay') {
          continue;
        }

        return { local, remote };
      }
    }

    // Fallback to any available pair
    if (sortedLocal.length > 0 && sortedRemote.length > 0) {
      return {
        local: sortedLocal[0]!,
        remote: sortedRemote[0]!,
      };
    }

    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Coordinate connection between two peers via relay
 */
export async function coordinateConnection(
  relayUrl: string,
  peerPublicKey: string,
  localCandidates: ICECandidate[]
): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket(relayUrl);

    ws.on('open', () => {
      // Send connection request with candidates
      ws.send(JSON.stringify({
        type: 'coordinate',
        peerPublicKey,
        candidates: localCandidates,
      }));

      const timeout = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 30000);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'connection_established') {
            clearTimeout(timeout);
            resolve(ws);
          } else if (msg.type === 'connection_failed') {
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          }
        } catch {
          // Ignore parse errors
        }
      });
    });

    ws.on('error', () => {
      resolve(null);
    });
  });
}
/**
 * Task Claiming System
 * Handles task claiming and assignment for multi-agent collaboration
 */

import type { A2ATask } from '@clawchat/core';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface TaskClaim {
  taskId: string;
  agentPublicKey: string;
  claimedAt: number;
  expiresAt: number;
  status: 'active' | 'completed' | 'expired' | 'released';
}

export interface TaskAssignment {
  taskId: string;
  assignedTo: string;
  assignedBy?: string;
  assignedAt: number;
  role?: 'owner' | 'collaborator' | 'reviewer';
}

export interface ClaimConfig {
  claimTimeout: number; // Milliseconds before claim expires
  maxClaimsPerAgent: number;
  enableAutoExpiration: boolean;
}

// ============================================
// Task Claiming Manager
// ============================================

export class TaskClaimingManager {
  private claims: Map<string, TaskClaim> = new Map();
  private assignments: Map<string, TaskAssignment> = new Map();
  private agentClaims: Map<string, Set<string>> = new Map();
  private config: ClaimConfig;

  constructor(config: Partial<ClaimConfig> = {}) {
    this.config = {
      claimTimeout: config.claimTimeout ?? 30 * 60 * 1000, // 30 minutes
      maxClaimsPerAgent: config.maxClaimsPerAgent ?? 10,
      enableAutoExpiration: config.enableAutoExpiration ?? true,
    };
  }

  /**
   * Claim a task for an agent
   */
  claim(taskId: string, agentPublicKey: string): TaskClaim | null {
    // Check if task is already claimed
    const existingClaim = this.claims.get(taskId);
    if (existingClaim && existingClaim.status === 'active') {
      // Check if claim has expired
      if (Date.now() < existingClaim.expiresAt) {
        return null; // Already claimed by someone else
      }
      // Expire the old claim
      existingClaim.status = 'expired';
    }

    // Check agent's claim limit
    const agentClaimSet = this.agentClaims.get(agentPublicKey);
    if (agentClaimSet && agentClaimSet.size >= this.config.maxClaimsPerAgent) {
      return null; // Agent has too many active claims
    }

    const now = Date.now();
    const claim: TaskClaim = {
      taskId,
      agentPublicKey,
      claimedAt: now,
      expiresAt: now + this.config.claimTimeout,
      status: 'active',
    };

    this.claims.set(taskId, claim);

    // Track agent's claims
    if (!this.agentClaims.has(agentPublicKey)) {
      this.agentClaims.set(agentPublicKey, new Set());
    }
    this.agentClaims.get(agentPublicKey)!.add(taskId);

    return claim;
  }

  /**
   * Release a claim
   */
  release(taskId: string, agentPublicKey: string): boolean {
    const claim = this.claims.get(taskId);

    if (!claim || claim.agentPublicKey !== agentPublicKey) {
      return false;
    }

    claim.status = 'released';

    // Remove from agent's claim set
    const agentClaimSet = this.agentClaims.get(agentPublicKey);
    if (agentClaimSet) {
      agentClaimSet.delete(taskId);
    }

    return true;
  }

  /**
   * Complete a claim (task finished)
   */
  complete(taskId: string, agentPublicKey: string): boolean {
    const claim = this.claims.get(taskId);

    if (!claim || claim.agentPublicKey !== agentPublicKey) {
      return false;
    }

    claim.status = 'completed';

    // Remove from agent's claim set
    const agentClaimSet = this.agentClaims.get(agentPublicKey);
    if (agentClaimSet) {
      agentClaimSet.delete(taskId);
    }

    return true;
  }

  /**
   * Get claim for a task
   */
  getClaim(taskId: string): TaskClaim | undefined {
    const claim = this.claims.get(taskId);

    // Check expiration
    if (claim && claim.status === 'active' && Date.now() >= claim.expiresAt) {
      if (this.config.enableAutoExpiration) {
        claim.status = 'expired';
        const agentClaimSet = this.agentClaims.get(claim.agentPublicKey);
        if (agentClaimSet) {
          agentClaimSet.delete(taskId);
        }
      }
    }

    return claim;
  }

  /**
   * Check if task is claimed
   */
  isClaimed(taskId: string): boolean {
    const claim = this.getClaim(taskId);
    return claim?.status === 'active';
  }

  /**
   * Get active claims for an agent
   */
  getAgentClaims(agentPublicKey: string): TaskClaim[] {
    const taskIds = this.agentClaims.get(agentPublicKey);
    if (!taskIds) return [];

    return Array.from(taskIds)
      .map((id) => this.claims.get(id))
      .filter((c): c is TaskClaim => c !== undefined && c.status === 'active');
  }

  /**
   * Assign a task to an agent (administrative)
   */
  assign(
    taskId: string,
    assignedTo: string,
    assignedBy?: string,
    role?: TaskAssignment['role']
  ): TaskAssignment {
    const assignment: TaskAssignment = {
      taskId,
      assignedTo,
      assignedBy,
      assignedAt: Date.now(),
      role,
    };

    this.assignments.set(taskId, assignment);
    return assignment;
  }

  /**
   * Get assignment for a task
   */
  getAssignment(taskId: string): TaskAssignment | undefined {
    return this.assignments.get(taskId);
  }

  /**
   * Remove assignment
   */
  removeAssignment(taskId: string): boolean {
    return this.assignments.delete(taskId);
  }

  /**
   * Extend claim timeout
   */
  extendClaim(taskId: string, agentPublicKey: string, additionalMs: number): boolean {
    const claim = this.claims.get(taskId);

    if (!claim || claim.agentPublicKey !== agentPublicKey || claim.status !== 'active') {
      return false;
    }

    claim.expiresAt += additionalMs;
    return true;
  }

  /**
   * Clean up expired claims
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [taskId, claim] of this.claims) {
      if (claim.status === 'active' && now >= claim.expiresAt) {
        claim.status = 'expired';
        const agentClaimSet = this.agentClaims.get(claim.agentPublicKey);
        if (agentClaimSet) {
          agentClaimSet.delete(taskId);
        }
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalClaims: number;
    activeClaims: number;
    completedClaims: number;
    expiredClaims: number;
    totalAssignments: number;
  } {
    let active = 0;
    let completed = 0;
    let expired = 0;

    for (const claim of this.claims.values()) {
      switch (claim.status) {
        case 'active':
          active++;
          break;
        case 'completed':
          completed++;
          break;
        case 'expired':
          expired++;
          break;
      }
    }

    return {
      totalClaims: this.claims.size,
      activeClaims: active,
      completedClaims: completed,
      expiredClaims: expired,
      totalAssignments: this.assignments.size,
    };
  }
}
/**
 * Reputation tracking system for agents
 *
 * Tracks agent behavior and calculates reputation scores
 */

export interface ReputationConfig {
  /** Starting reputation for new agents */
  initialScore: number;
  /** Minimum reputation score */
  minScore: number;
  /** Maximum reputation score */
  maxScore: number;
  /** Decay rate per hour (score reduction) */
  decayPerHour: number;
}

export interface ReputationEvent {
  type: ReputationEventType;
  timestamp: number;
  delta: number;
  reason?: string;
}

export type ReputationEventType =
  | 'message_valid'
  | 'message_invalid'
  | 'task_completed'
  | 'task_failed'
  | 'spam_detected'
  | 'auth_success'
  | 'auth_failure'
  | 'connection_dropped'
  | 'malicious_behavior';

export interface AgentReputation {
  agentId: string;
  score: number;
  events: ReputationEvent[];
  lastUpdated: number;
  messageCount: number;
  successCount: number;
  failureCount: number;
}

export const DEFAULT_REPUTATION_CONFIG: ReputationConfig = {
  initialScore: 50,
  minScore: 0,
  maxScore: 100,
  decayPerHour: 0.5,
};

/**
 * Event scoring weights
 */
const EVENT_WEIGHTS: Record<ReputationEventType, number> = {
  message_valid: 0.1,
  message_invalid: -2,
  task_completed: 1,
  task_failed: -0.5,
  spam_detected: -10,
  auth_success: 0.5,
  auth_failure: -1,
  connection_dropped: -0.2,
  malicious_behavior: -25,
};

export class ReputationTracker {
  private reputations: Map<string, AgentReputation> = new Map();
  private config: ReputationConfig;

  constructor(config: Partial<ReputationConfig> = {}) {
    this.config = { ...DEFAULT_REPUTATION_CONFIG, ...config };
  }

  /**
   * Record an event for an agent
   */
  recordEvent(
    agentId: string,
    type: ReputationEventType,
    reason?: string
  ): AgentReputation {
    const reputation = this.getOrCreate(agentId);
    const delta = EVENT_WEIGHTS[type];

    const event: ReputationEvent = {
      type,
      timestamp: Date.now(),
      delta,
      reason,
    };

    reputation.events.push(event);
    reputation.lastUpdated = Date.now();

    // Update counters
    if (type === 'message_valid' || type === 'message_invalid') {
      reputation.messageCount++;
      if (type === 'message_valid') {
        reputation.successCount++;
      } else {
        reputation.failureCount++;
      }
    }

    if (type === 'task_completed' || type === 'task_failed') {
      if (type === 'task_completed') {
        reputation.successCount++;
      } else {
        reputation.failureCount++;
      }
    }

    // Apply score change
    this.applyScoreChange(reputation, delta);

    // Keep only last 100 events
    if (reputation.events.length > 100) {
      reputation.events = reputation.events.slice(-100);
    }

    return reputation;
  }

  /**
   * Get reputation for an agent
   */
  getReputation(agentId: string): AgentReputation | undefined {
    const reputation = this.reputations.get(agentId);
    if (reputation) {
      this.applyDecay(reputation);
    }
    return reputation;
  }

  /**
   * Get score for an agent
   */
  getScore(agentId: string): number {
    const reputation = this.getReputation(agentId);
    return reputation?.score ?? this.config.initialScore;
  }

  /**
   * Check if agent is trusted (score >= threshold)
   */
  isTrusted(agentId: string, threshold: number = 30): boolean {
    return this.getScore(agentId) >= threshold;
  }

  /**
   * Check if agent is blacklisted (score <= 0)
   */
  isBlacklisted(agentId: string): boolean {
    return this.getScore(agentId) <= 0;
  }

  /**
   * Get top N agents by reputation
   */
  getTopAgents(n: number): AgentReputation[] {
    const all = Array.from(this.reputations.values());
    all.forEach((r) => this.applyDecay(r));
    all.sort((a, b) => b.score - a.score);
    return all.slice(0, n);
  }

  /**
   * Get agents below threshold
   */
  getLowReputationAgents(threshold: number): AgentReputation[] {
    const all = Array.from(this.reputations.values());
    all.forEach((r) => this.applyDecay(r));
    return all.filter((r) => r.score < threshold);
  }

  /**
   * Reset reputation for an agent
   */
  reset(agentId: string): void {
    this.reputations.delete(agentId);
  }

  /**
   * Clear all reputations
   */
  clear(): void {
    this.reputations.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAgents: number;
    averageScore: number;
    blacklisted: number;
    trusted: number;
  } {
    const all = Array.from(this.reputations.values());
    all.forEach((r) => this.applyDecay(r));

    const totalAgents = all.length;
    const averageScore =
      totalAgents > 0
        ? all.reduce((sum, r) => sum + r.score, 0) / totalAgents
        : this.config.initialScore;
    const blacklisted = all.filter((r) => r.score <= 0).length;
    const trusted = all.filter((r) => r.score >= 30).length;

    return { totalAgents, averageScore, blacklisted, trusted };
  }

  private getOrCreate(agentId: string): AgentReputation {
    let reputation = this.reputations.get(agentId);

    if (!reputation) {
      reputation = {
        agentId,
        score: this.config.initialScore,
        events: [],
        lastUpdated: Date.now(),
        messageCount: 0,
        successCount: 0,
        failureCount: 0,
      };
      this.reputations.set(agentId, reputation);
    }

    return reputation;
  }

  private applyScoreChange(reputation: AgentReputation, delta: number): void {
    reputation.score = Math.max(
      this.config.minScore,
      Math.min(this.config.maxScore, reputation.score + delta)
    );
  }

  private applyDecay(reputation: AgentReputation): void {
    const now = Date.now();
    const hoursElapsed =
      (now - reputation.lastUpdated) / (1000 * 60 * 60);

    if (hoursElapsed > 0) {
      const decay = hoursElapsed * this.config.decayPerHour;
      reputation.score = Math.max(
        this.config.minScore,
        reputation.score - decay
      );
    }
  }
}
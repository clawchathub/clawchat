import { describe, it, expect, beforeEach } from 'vitest';
import { ReputationTracker, DEFAULT_REPUTATION_CONFIG } from '../src/security/reputation';

describe('ReputationTracker', () => {
  let tracker: ReputationTracker;

  beforeEach(() => {
    tracker = new ReputationTracker(DEFAULT_REPUTATION_CONFIG);
  });

  it('should start with initial score', () => {
    const score = tracker.getScore('agent1');
    expect(score).toBe(50);
  });

  it('should increase score for valid messages', () => {
    tracker.recordEvent('agent1', 'message_valid');
    const score = tracker.getScore('agent1');
    expect(score).toBe(50.1);
  });

  it('should decrease score for invalid messages', () => {
    tracker.recordEvent('agent1', 'message_invalid');
    const score = tracker.getScore('agent1');
    expect(score).toBe(48);
  });

  it('should heavily penalize spam', () => {
    tracker.recordEvent('agent1', 'spam_detected');
    const score = tracker.getScore('agent1');
    expect(score).toBe(40);
  });

  it('should severely penalize malicious behavior', () => {
    tracker.recordEvent('agent1', 'malicious_behavior');
    const score = tracker.getScore('agent1');
    expect(score).toBe(25);
  });

  it('should track message counts', () => {
    tracker.recordEvent('agent1', 'message_valid');
    tracker.recordEvent('agent1', 'message_valid');
    tracker.recordEvent('agent1', 'message_invalid');

    const rep = tracker.getReputation('agent1');
    expect(rep?.messageCount).toBe(3);
    expect(rep?.successCount).toBe(2);
    expect(rep?.failureCount).toBe(1);
  });

  it('should identify trusted agents', () => {
    expect(tracker.isTrusted('agent1')).toBe(true);

    // Damage reputation
    for (let i = 0; i < 5; i++) {
      tracker.recordEvent('agent1', 'spam_detected');
    }

    expect(tracker.isTrusted('agent1')).toBe(false);
  });

  it('should identify blacklisted agents', () => {
    // Severely damage reputation
    for (let i = 0; i < 5; i++) {
      tracker.recordEvent('agent1', 'malicious_behavior');
    }

    expect(tracker.isBlacklisted('agent1')).toBe(true);
  });

  it('should cap score at maximum', () => {
    for (let i = 0; i < 100; i++) {
      tracker.recordEvent('agent1', 'task_completed');
    }

    const score = tracker.getScore('agent1');
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should cap score at minimum', () => {
    for (let i = 0; i < 10; i++) {
      tracker.recordEvent('agent1', 'malicious_behavior');
    }

    const score = tracker.getScore('agent1');
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('should get stats', () => {
    tracker.recordEvent('agent1', 'message_valid');
    tracker.recordEvent('agent2', 'spam_detected');

    const stats = tracker.getStats();
    expect(stats.totalAgents).toBe(2);
    expect(stats.blacklisted).toBe(0);
  });
});
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskClaimingManager, type ClaimConfig } from '../src/claiming.js';

describe('TaskClaimingManager', () => {
  let claiming: TaskClaimingManager;

  beforeEach(() => {
    claiming = new TaskClaimingManager();
  });

  describe('claiming tasks', () => {
    it('should claim a task', () => {
      const claim = claiming.claim('task-1', 'agent-1');

      expect(claim).toBeDefined();
      expect(claim?.taskId).toBe('task-1');
      expect(claim?.agentPublicKey).toBe('agent-1');
      expect(claim?.status).toBe('active');
    });

    it('should not claim already claimed task', () => {
      claiming.claim('task-1', 'agent-1');
      const claim = claiming.claim('task-1', 'agent-2');

      expect(claim).toBeNull();
    });

    it('should enforce max claims per agent', () => {
      const limitedClaiming = new TaskClaimingManager({ maxClaimsPerAgent: 2 });

      limitedClaiming.claim('task-1', 'agent-1');
      limitedClaiming.claim('task-2', 'agent-1');
      const claim = limitedClaiming.claim('task-3', 'agent-1');

      expect(claim).toBeNull();
    });
  });

  describe('claim status', () => {
    it('should check if task is claimed', () => {
      claiming.claim('task-1', 'agent-1');
      expect(claiming.isClaimed('task-1')).toBe(true);
      expect(claiming.isClaimed('task-2')).toBe(false);
    });

    it('should get claim details', () => {
      claiming.claim('task-1', 'agent-1');
      const claim = claiming.getClaim('task-1');

      expect(claim?.agentPublicKey).toBe('agent-1');
    });

    it('should get agent claims', () => {
      claiming.claim('task-1', 'agent-1');
      claiming.claim('task-2', 'agent-1');
      claiming.claim('task-3', 'agent-2');

      const agentClaims = claiming.getAgentClaims('agent-1');
      expect(agentClaims.length).toBe(2);
    });
  });

  describe('releasing claims', () => {
    it('should release a claim', () => {
      claiming.claim('task-1', 'agent-1');
      const released = claiming.release('task-1', 'agent-1');

      expect(released).toBe(true);
      expect(claiming.isClaimed('task-1')).toBe(false);
    });

    it('should not release claim by different agent', () => {
      claiming.claim('task-1', 'agent-1');
      const released = claiming.release('task-1', 'agent-2');

      expect(released).toBe(false);
      expect(claiming.isClaimed('task-1')).toBe(true);
    });
  });

  describe('completing claims', () => {
    it('should complete a claim', () => {
      claiming.claim('task-1', 'agent-1');
      const completed = claiming.complete('task-1', 'agent-1');

      expect(completed).toBe(true);
      const claim = claiming.getClaim('task-1');
      expect(claim?.status).toBe('completed');
    });
  });

  describe('claim expiration', () => {
    it('should expire claim after timeout', async () => {
      const quickExpiring = new TaskClaimingManager({
        claimTimeout: 100, // 100ms
        enableAutoExpiration: true,
      });

      quickExpiring.claim('task-1', 'agent-1');

      // Wait for expiration
      await new Promise((r) => setTimeout(r, 150));

      const claim = quickExpiring.getClaim('task-1');
      expect(claim?.status).toBe('expired');
    });

    it('should extend claim timeout', () => {
      claiming.claim('task-1', 'agent-1');
      const claim = claiming.getClaim('task-1');
      const originalExpiry = claim!.expiresAt;

      const extended = claiming.extendClaim('task-1', 'agent-1', 60000);

      expect(extended).toBe(true);
      const updatedClaim = claiming.getClaim('task-1');
      expect(updatedClaim!.expiresAt).toBeGreaterThan(originalExpiry);
    });
  });

  describe('assignments', () => {
    it('should assign a task', () => {
      const assignment = claiming.assign('task-1', 'agent-1', 'admin', 'owner');

      expect(assignment.taskId).toBe('task-1');
      expect(assignment.assignedTo).toBe('agent-1');
      expect(assignment.assignedBy).toBe('admin');
      expect(assignment.role).toBe('owner');
    });

    it('should get assignment', () => {
      claiming.assign('task-1', 'agent-1');
      const assignment = claiming.getAssignment('task-1');

      expect(assignment?.assignedTo).toBe('agent-1');
    });

    it('should remove assignment', () => {
      claiming.assign('task-1', 'agent-1');
      expect(claiming.removeAssignment('task-1')).toBe(true);
      expect(claiming.getAssignment('task-1')).toBeUndefined();
    });
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      claiming.claim('task-1', 'agent-1');
      claiming.claim('task-2', 'agent-1');
      claiming.complete('task-1', 'agent-1');

      const stats = claiming.getStats();

      expect(stats.totalClaims).toBe(2);
      expect(stats.activeClaims).toBe(1);
      expect(stats.completedClaims).toBe(1);
    });
  });
});
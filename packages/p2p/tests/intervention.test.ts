import { describe, it, expect, beforeEach } from 'vitest';
import { InterventionRouter, type AgentConnection } from '../src/intervention/router.js';
import { InterventionManager } from '@clawchat/core';

describe('Intervention Router Integration', () => {
  let manager: InterventionManager;
  let router: InterventionRouter;

  beforeEach(() => {
    manager = new InterventionManager();
    router = new InterventionRouter(manager);
  });

  describe('full workflow', () => {
    it('should support complete human-in-the-loop workflow', async () => {
      // 1. Create conversation
      manager.createConversation({ conversationId: 'conv-1' });

      // 2. Human joins as admin (for terminate permission)
      const session = manager.joinConversation('conv-1', 'human-1', 'admin');
      expect(session).toBeDefined();

      // 3. Set up agent query callback
      const agents: AgentConnection[] = [
        { agentId: 'agent-1', endpoint: 'http://a1', capabilities: ['chat'], lastSeen: Date.now() },
        { agentId: 'agent-2', endpoint: 'http://a2', capabilities: ['chat'], lastSeen: Date.now() },
      ];
      router.onGetAgents(async () => agents);

      const sentMessages: Array<{ agentId: string }> = [];
      router.onSendMessage(async (agentId) => {
        sentMessages.push({ agentId });
      });

      // 4. Human sends a message
      const msgResult = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Please focus on the main topic',
      });
      expect(msgResult.success).toBe(true);

      // 5. Route the intervention
      const routeResult = await router.routeIntervention({
        id: 'route-1',
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Please focus on the main topic',
        timestamp: Date.now(),
      });
      expect(routeResult.success).toBe(true);
      expect(sentMessages.length).toBe(2); // Both agents received

      // 6. Human pauses conversation
      const pauseResult = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'pause',
      });
      expect(pauseResult.success).toBe(true);
      expect(manager.isConversationPaused('conv-1')).toBe(true);

      // 7. Human resumes conversation
      const resumeResult = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'resume',
      });
      expect(resumeResult.success).toBe(true);
      expect(manager.isConversationActive('conv-1')).toBe(true);

      // 8. Human terminates conversation
      const terminateResult = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'terminate',
      });
      expect(terminateResult.success).toBe(true);
      expect(manager.isConversationActive('conv-1')).toBe(false);
    });

    it('should enforce role-based permissions throughout workflow', async () => {
      manager.createConversation({ conversationId: 'conv-1' });

      // Observer joins
      manager.joinConversation('conv-1', 'observer-1', 'observer');

      // Observer cannot send messages
      const observerResult = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'observer-1',
        action: 'send_message',
        content: 'Should fail',
      });
      expect(observerResult.success).toBe(false);

      // Admin joins
      manager.joinConversation('conv-1', 'admin-1', 'admin');

      // Admin can terminate
      const adminResult = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'admin-1',
        action: 'terminate',
      });
      expect(adminResult.success).toBe(true);
    });

    it('should track intervention statistics', async () => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'moderator');

      // Multiple interventions
      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Message 1',
      });

      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Message 2',
      });

      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'pause',
      });

      const sessions = manager.getSessions('conv-1');
      const session = sessions.find((s) => s.humanParticipantId === 'human-1');
      expect(session?.interventionCount).toBe(3);
    });
  });

  describe('multiple humans', () => {
    it('should support multiple human participants', async () => {
      manager.createConversation({ conversationId: 'conv-1' });

      const session1 = manager.joinConversation('conv-1', 'human-1', 'participant');
      const session2 = manager.joinConversation('conv-1', 'human-2', 'moderator');

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();

      const sessions = manager.getSessions('conv-1');
      expect(sessions.length).toBe(2);
    });

    it('should enforce max participants', async () => {
      manager.createConversation({
        conversationId: 'conv-1',
        maxParticipants: 2,
      });

      manager.joinConversation('conv-1', 'human-1', 'participant');
      manager.joinConversation('conv-1', 'human-2', 'participant');

      const session3 = manager.joinConversation('conv-1', 'human-3', 'participant');
      expect(session3).toBeNull();
    });

    it('should allow multiple humans to intervene', async () => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'participant');
      manager.joinConversation('conv-1', 'human-2', 'participant');

      const result1 = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'From human 1',
      });

      const result2 = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-2',
        action: 'send_message',
        content: 'From human 2',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('event tracking', () => {
    it('should emit correct events throughout workflow', async () => {
      const events: Array<{ type: string; conversationId: string }> = [];
      manager.subscribe((e) => {
        events.push({ type: e.type, conversationId: e.conversationId });
      });

      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'moderator');

      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'pause',
      });

      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'terminate',
      });

      expect(events.find((e) => e.type === 'state_changed' && e.conversationId === 'conv-1')).toBeDefined();
    });
  });
});
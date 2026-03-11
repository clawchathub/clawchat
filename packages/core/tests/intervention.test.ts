import { describe, it, expect, beforeEach } from 'vitest';
import type { AgentConnection } from '../src/intervention/router.js';
import { InterventionManager, DEFAULT_PERMISSIONS } from '../src/intervention/index.js';

// Simple router mock for core tests
class MockRouter {
  manager: InterventionManager;
  sentMessages: Array<{ agentId: string; message: unknown }> = [];
  agents: AgentConnection[] = [];

  constructor(manager: InterventionManager) {
    this.manager = manager;
  }

  onSendMessage(callback: (agentId: string, message: unknown) => Promise<void>): void {
    this._sendCallback = callback;
  }

  onGetAgents(callback: () => Promise<AgentConnection[]>): void {
    this._getAgentsCallback = callback;
  }

  private _sendCallback?: (agentId: string, message: unknown) => Promise<void>;
  private _getAgentsCallback?: () => Promise<AgentConnection[]>;

  async routeIntervention(request: { id: string; conversationId: string; participantId: string; action: string; content?: string; targetAgentId?: string; timestamp: number }) {
    // Check conversation state
    const convState = this.manager.getConversationState(request.conversationId);
    if (!convState) {
      return { success: false, message: 'Conversation not found', affectedAgents: [] };
    }
    if (convState.state === 'terminated') {
      return { success: false, message: 'Conversation has been terminated', affectedAgents: [] };
    }

    const agents = this._getAgentsCallback ? await this._getAgentsCallback() : [];

    // Filter by targetAgentId if provided and action is delegate
    let targetAgents = agents;
    if (request.targetAgentId && request.action === 'delegate') {
      targetAgents = agents.filter(a => a.agentId === request.targetAgentId);
    }

    for (const agent of targetAgents) {
      if (this._sendCallback) {
        await this._sendCallback(agent.agentId, { action: request.action, content: request.content });
      }
    }
    return { success: true, affectedAgents: targetAgents.map(a => a.agentId) };
  }

  async processHook(conversationId: string, hookPoint: string, data: unknown): Promise<boolean> {
    const result = this.manager.shouldTriggerHook(conversationId, hookPoint as 'before_message_send' | 'after_message_receive' | 'before_task_start' | 'after_task_complete' | 'on_error' | 'on_decision_point');
    return result.trigger && result.requireResponse;
  }

  handleAgentResponse(conversationId: string, agentId: string, response: unknown): void {
    this.manager.addMessage(conversationId, response as any);
  }

  getStats(): { pendingResponses: number; activeConversations: number } {
    return {
      pendingResponses: 0,
      activeConversations: this.manager.getActiveConversations().length,
    };
  }
}

describe('InterventionManager', () => {
  let manager: InterventionManager;

  beforeEach(() => {
    manager = new InterventionManager();
  });

  describe('conversation management', () => {
    it('should create a guided conversation', () => {
      const config = {
        conversationId: 'conv-1',
        enableIntervention: true,
      };

      const state = manager.createConversation(config);

      expect(state.conversationId).toBe('conv-1');
      expect(state.state).toBe('active');
      expect(state.sessions.size).toBe(0);
    });

    it('should get conversation state', () => {
      manager.createConversation({ conversationId: 'conv-1' });
      const state = manager.getConversationState('conv-1');

      expect(state).toBeDefined();
      expect(state?.conversationId).toBe('conv-1');
    });

    it('should return undefined for non-existent conversation', () => {
      const state = manager.getConversationState('non-existent');
      expect(state).toBeUndefined();
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      manager.createConversation({ conversationId: 'conv-1' });
    });

    it('should allow human to join conversation', () => {
      const session = manager.joinConversation('conv-1', 'human-1', 'participant');

      expect(session).toBeDefined();
      expect(session?.humanParticipantId).toBe('human-1');
      expect(session?.role).toBe('participant');
    });

    it('should assign correct permissions by role', () => {
      const observerSession = manager.joinConversation('conv-1', 'observer-1', 'observer');
      const adminSession = manager.joinConversation('conv-1', 'admin-1', 'admin');

      expect(observerSession?.permissions.actions).toEqual([]);
      expect(adminSession?.permissions.actions).toContain('terminate');
    });

    it('should allow custom permissions', () => {
      const customPerms: Partial<InterventionPermission> = {
        maxInterventions: 5,
      };
      const session = manager.joinConversation('conv-1', 'human-1', 'participant', customPerms);

      expect(session?.permissions.maxInterventions).toBe(5);
    });

    it('should allow human to leave conversation', () => {
      const session = manager.joinConversation('conv-1', 'human-1', 'participant');
      const result = manager.leaveConversation('conv-1', session!.id);

      expect(result).toBe(true);
      const sessions = manager.getSessions('conv-1');
      expect(sessions.length).toBe(0);
    });

    it('should return false for leaving non-existent session', () => {
      const result = manager.leaveConversation('conv-1', 'non-existent');
      expect(result).toBe(false);
    });
  });

  describe('intervention actions', () => {
    beforeEach(() => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'admin'); // Use admin role for terminate permission
    });

    it('should allow sending a message', async () => {
      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Hello agents!',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('send_message');

      const messages = manager.getMessages('conv-1');
      expect(messages.length).toBe(1);
    });

    it('should allow pausing conversation', async () => {
      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'pause',
      });

      expect(result.success).toBe(true);
      expect(manager.isConversationPaused('conv-1')).toBe(true);
    });

    it('should allow resuming conversation', async () => {
      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'pause',
      });

      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'resume',
      });

      expect(result.success).toBe(true);
      expect(manager.isConversationActive('conv-1')).toBe(true);
    });

    it('should allow terminating conversation', async () => {
      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'terminate',
      });

      expect(result.success).toBe(true);
      expect(manager.isConversationActive('conv-1')).toBe(false);
    });

    it('should deny action without permission', async () => {
      manager.joinConversation('conv-1', 'observer-1', 'observer');

      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'observer-1',
        action: 'send_message',
        content: 'Should not work',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not permitted');
    });

    it('should track intervention count', async () => {
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

      const sessions = manager.getSessions('conv-1');
      const session = sessions.find((s) => s.humanParticipantId === 'human-1');
      expect(session?.interventionCount).toBe(2);
    });
  });

  describe('cooldown', () => {
    it('should enforce intervention cooldown', async () => {
      manager.createConversation({
        conversationId: 'conv-1',
        interventionCooldown: 1000, // 1 second
      });
      manager.joinConversation('conv-1', 'human-1', 'participant');

      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Message 1',
      });

      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Message 2',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('cooldown');
    });
  });

  describe('max interventions', () => {
    it('should enforce max interventions limit', async () => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'participant', {
        maxInterventions: 1,
      });

      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Message 1',
      });

      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Message 2',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Max interventions');
    });
  });

  describe('events', () => {
    it('should emit session_joined event', () => {
      const events: InterventionEvent[] = [];
      manager.subscribe((e) => events.push(e));

      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'participant');

      const joinedEvent = events.find((e) => e.type === 'session_joined');
      expect(joinedEvent).toBeDefined();
      expect(joinedEvent?.data?.humanParticipantId).toBe('human-1');
    });

    it('should emit state_changed event on pause', async () => {
      const events: InterventionEvent[] = [];
      manager.subscribe((e) => events.push(e));

      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'moderator');

      await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'pause',
      });

      const stateEvent = events.find(
        (e) => e.type === 'state_changed' && e.data?.state === 'paused'
      );
      expect(stateEvent).toBeDefined();
    });

    it('should allow unsubscribing', () => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'participant');

      const events: InterventionEvent[] = [];
      const unsubscribe = manager.subscribe((e) => events.push(e));

      // Now unsubscribe and create another conversation
      unsubscribe();

      manager.createConversation({ conversationId: 'conv-2' });
      manager.joinConversation('conv-2', 'human-2', 'participant');

      // Events from conv-2 should not be captured
      expect(events.length).toBe(0);
    });
  });

  describe('hooks', () => {
    it('should set and check hooks', () => {
      manager.setHook('before_message_send', {
        point: 'before_message_send',
        enabled: true,
        requireHumanResponse: true,
      });

      manager.createConversation({ conversationId: 'conv-1', enableIntervention: true });

      const result = manager.shouldTriggerHook('conv-1', 'before_message_send');
      expect(result.trigger).toBe(true);
      expect(result.requireResponse).toBe(true);
    });

    it('should not trigger hook when disabled', () => {
      manager.createConversation({ conversationId: 'conv-1', enableIntervention: false });

      const result = manager.shouldTriggerHook('conv-1', 'before_message_send');
      expect(result.trigger).toBe(false);
    });
  });
});

describe('InterventionRouter', () => {
  let manager: InterventionManager;
  let router: MockRouter;
  let sentMessages: Array<{ agentId: string; message: unknown }>;
  let availableAgents: AgentConnection[];

  beforeEach(() => {
    manager = new InterventionManager();
    router = new MockRouter(manager);

    sentMessages = [];
    router.onSendMessage(async (agentId, message) => {
      sentMessages.push({ agentId, message });
    });

    availableAgents = [
      { agentId: 'agent-1', endpoint: 'http://agent1', capabilities: ['chat'], lastSeen: Date.now() },
      { agentId: 'agent-2', endpoint: 'http://agent2', capabilities: ['chat', 'code'], lastSeen: Date.now() },
    ];

    router.onGetAgents(async () => availableAgents);
  });

  describe('routing', () => {
    it('should route intervention to all agents by default', async () => {
      manager.createConversation({ conversationId: 'conv-1' });

      const result = await router.routeIntervention({
        id: 'req-1',
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Hello everyone!',
        timestamp: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(result.affectedAgents?.length).toBe(2);
      expect(sentMessages.length).toBe(2);
    });

    it('should route to specific agent when targetAgentId provided', async () => {
      manager.createConversation({ conversationId: 'conv-1' });

      const result = await router.routeIntervention({
        id: 'req-1',
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'delegate',
        targetAgentId: 'agent-1',
        timestamp: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(result.affectedAgents).toEqual(['agent-1']);
      expect(sentMessages.length).toBe(1);
    });

    it('should fail for terminated conversation', async () => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.endConversation('conv-1');

      const result = await router.routeIntervention({
        id: 'req-1',
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Hello',
        timestamp: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('terminated');
    });

    it('should fail for non-existent conversation', async () => {
      const result = await router.routeIntervention({
        id: 'req-1',
        conversationId: 'non-existent',
        participantId: 'human-1',
        action: 'send_message',
        content: 'Hello',
        timestamp: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('hook processing', () => {
    it('should process hook triggers', async () => {
      manager.setHook('on_decision_point', {
        point: 'on_decision_point',
        enabled: true,
        requireHumanResponse: true,
      });

      manager.createConversation({ conversationId: 'conv-1', enableIntervention: true });
      manager.joinConversation('conv-1', 'human-1', 'moderator');

      const needsPause = await router.processHook('conv-1', 'on_decision_point', {});
      expect(needsPause).toBe(true);
    });

    it('should not pause when hook does not require response', async () => {
      manager.setHook('before_message_send', {
        point: 'before_message_send',
        enabled: true,
        requireHumanResponse: false,
      });

      manager.createConversation({ conversationId: 'conv-1', enableIntervention: true });

      const needsPause = await router.processHook('conv-1', 'before_message_send', {});
      expect(needsPause).toBe(false);
    });
  });

  describe('agent response handling', () => {
    it('should handle agent responses', async () => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.joinConversation('conv-1', 'human-1', 'participant');

      // Add a pending clarification request
      const result = await manager.requestIntervention({
        conversationId: 'conv-1',
        participantId: 'human-1',
        action: 'request_clarification',
        content: 'What do you mean?',
      });
      expect(result.success).toBe(true);

      // Simulate agent response
      router.handleAgentResponse('conv-1', 'agent-1', {
        role: 'agent',
        parts: [{ type: 'text', text: 'Let me clarify...' }],
      });

      const messages = manager.getMessages('conv-1');
      expect(messages.length).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      manager.createConversation({ conversationId: 'conv-1' });
      manager.createConversation({ conversationId: 'conv-2' });

      const stats = router.getStats();

      expect(stats.activeConversations).toBe(2);
      expect(stats.pendingResponses).toBe(0);
    });
  });
});

describe('Default Permissions', () => {
  it('should have correct observer permissions', () => {
    expect(DEFAULT_PERMISSIONS.observer.actions).toEqual([]);
  });

  it('should have correct participant permissions', () => {
    expect(DEFAULT_PERMISSIONS.participant.actions).toContain('send_message');
    expect(DEFAULT_PERMISSIONS.participant.actions).toContain('request_clarification');
    expect(DEFAULT_PERMISSIONS.participant.actions).not.toContain('terminate');
  });

  it('should have correct moderator permissions', () => {
    expect(DEFAULT_PERMISSIONS.moderator.actions).toContain('pause');
    expect(DEFAULT_PERMISSIONS.moderator.actions).toContain('resume');
    expect(DEFAULT_PERMISSIONS.moderator.actions).toContain('redirect');
    expect(DEFAULT_PERMISSIONS.moderator.actions).not.toContain('terminate');
  });

  it('should have correct admin permissions', () => {
    expect(DEFAULT_PERMISSIONS.admin.actions).toContain('terminate');
    expect(DEFAULT_PERMISSIONS.admin.actions).toContain('send_message');
  });
});
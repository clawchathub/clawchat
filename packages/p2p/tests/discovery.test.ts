import { describe, it, expect } from 'vitest';
import {
  discoverAgent,
  validateAgentCard,
  getA2AEndpoint,
  supportsStreaming,
  supportsPushNotifications,
  findAgentsWithSkill,
} from '../src/discovery/agent-discovery.js';
import type { AgentCard } from '@clawchat/core';

describe('Agent Discovery', () => {
  describe('validateAgentCard', () => {
    it('should validate a correct agent card', () => {
      const card: AgentCard = {
        identity: {
          name: 'TestAgent',
          description: 'A test agent',
          url: 'http://localhost:18789',
          version: '1.0.0',
        },
        capabilities: {
          streaming: true,
          pushNotifications: false,
          extendedAgentCard: false,
        },
        skills: [],
        interfaces: [],
      };

      expect(validateAgentCard(card)).toBe(true);
    });

    it('should reject invalid agent cards', () => {
      expect(validateAgentCard(null)).toBe(false);
      expect(validateAgentCard({})).toBe(false);
      expect(validateAgentCard({ identity: {} })).toBe(false);
      expect(validateAgentCard({ identity: { name: 123 } })).toBe(false);
    });
  });

  describe('getA2AEndpoint', () => {
    it('should return A2A interface URL if available', () => {
      const card: AgentCard = {
        identity: {
          name: 'TestAgent',
          description: 'Test',
          url: 'http://localhost:18789',
          version: '1.0.0',
        },
        capabilities: {
          streaming: false,
          pushNotifications: false,
          extendedAgentCard: false,
        },
        skills: [],
        interfaces: [
          {
            protocol: 'a2a',
            url: 'http://a2a.example.com',
          },
        ],
      };

      expect(getA2AEndpoint(card)).toBe('http://a2a.example.com');
    });

    it('should return identity URL if no A2A interface', () => {
      const card: AgentCard = {
        identity: {
          name: 'TestAgent',
          description: 'Test',
          url: 'http://localhost:18789',
          version: '1.0.0',
        },
        capabilities: {
          streaming: false,
          pushNotifications: false,
          extendedAgentCard: false,
        },
        skills: [],
        interfaces: [],
      };

      expect(getA2AEndpoint(card)).toBe('http://localhost:18789');
    });
  });

  describe('capability helpers', () => {
    const streamingCard: AgentCard = {
      identity: { name: 'Streaming', description: '', url: '', version: '1.0' },
      capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
      skills: [],
      interfaces: [],
    };

    const pushCard: AgentCard = {
      identity: { name: 'Push', description: '', url: '', version: '1.0' },
      capabilities: { streaming: false, pushNotifications: true, extendedAgentCard: false },
      skills: [],
      interfaces: [],
    };

    it('should detect streaming support', () => {
      expect(supportsStreaming(streamingCard)).toBe(true);
      expect(supportsStreaming(pushCard)).toBe(false);
    });

    it('should detect push notification support', () => {
      expect(supportsPushNotifications(pushCard)).toBe(true);
      expect(supportsPushNotifications(streamingCard)).toBe(false);
    });
  });

  describe('findAgentsWithSkill', () => {
    const agents: AgentCard[] = [
      {
        identity: { name: 'ChatAgent', description: '', url: '', version: '1.0' },
        capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
        skills: [{ id: 'chat', name: 'Chat', description: 'Chat skill', tags: [], inputModes: [], outputModes: [] }],
        interfaces: [],
      },
      {
        identity: { name: 'ImageAgent', description: '', url: '', version: '1.0' },
        capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
        skills: [{ id: 'image-gen', name: 'Image Generation', description: '', tags: [], inputModes: [], outputModes: [] }],
        interfaces: [],
      },
    ];

    it('should find agents with specific skill', () => {
      const chatAgents = findAgentsWithSkill(agents, 'chat');
      expect(chatAgents.length).toBe(1);
      expect(chatAgents[0].identity.name).toBe('ChatAgent');
    });

    it('should return empty array if no agents have skill', () => {
      const found = findAgentsWithSkill(agents, 'video');
      expect(found.length).toBe(0);
    });
  });
});
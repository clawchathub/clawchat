/**
 * Agent Discovery Module
 * Implements .well-known/agent.json discovery
 */

import type { AgentCard } from '@clawchat/core';

// ============================================
// Types
// ============================================

export interface DiscoveryResult {
  agentCard: AgentCard;
  url: string;
  discoveredAt: number;
}

// ============================================
// Discovery Functions
// ============================================

/**
 * Discover agent by URL
 * Fetches .well-known/agent.json from the given base URL
 */
export async function discoverAgent(baseUrl: string): Promise<AgentCard | null> {
  try {
    // Normalize URL
    const url = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const agentCardUrl = `${url}.well-known/agent.json`;

    const response = await fetch(agentCardUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const agentCard = await response.json() as AgentCard;
    return agentCard;
  } catch (error) {
    console.error('Discovery failed:', error);
    return null;
  }
}

/**
 * Discover multiple agents
 */
export async function discoverAgents(urls: string[]): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const agentCard = await discoverAgent(url);
      if (agentCard) {
        results.push({
          agentCard,
          url,
          discoveredAt: Date.now(),
        });
      }
    })
  );

  return results;
}

/**
 * Validate agent card
 */
export function validateAgentCard(card: unknown): card is AgentCard {
  if (!card || typeof card !== 'object') return false;

  const c = card as Record<string, unknown>;
  if (!c.identity || typeof c.identity !== 'object') return false;

  const identity = c.identity as Record<string, unknown>;
  if (typeof identity.name !== 'string') return false;
  if (typeof identity.url !== 'string') return false;

  return true;
}

/**
 * Get A2A endpoint from agent card
 */
export function getA2AEndpoint(agentCard: AgentCard): string | null {
  const a2aInterface = agentCard.interfaces?.find(
    (iface) => iface.protocol === 'a2a' || iface.protocol === 'a2a-relay'
  );
  return a2aInterface?.url ?? agentCard.identity.url;
}

/**
 * Check if agent supports streaming
 */
export function supportsStreaming(agentCard: AgentCard): boolean {
  return agentCard.capabilities?.streaming === true;
}

/**
 * Check if agent supports push notifications
 */
export function supportsPushNotifications(agentCard: AgentCard): boolean {
  return agentCard.capabilities?.pushNotifications === true;
}

/**
 * Find agents with specific skill
 */
export function findAgentsWithSkill(agents: AgentCard[], skillId: string): AgentCard[] {
  return agents.filter((agent) =>
    agent.skills?.some((skill) => skill.id === skillId || skill.name.toLowerCase().includes(skillId.toLowerCase()))
  );
}
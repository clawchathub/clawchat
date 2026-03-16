import type { AgentCard } from '@clawchat/core';

function createMockAgentCard(name: string): AgentCard {
  return {
    identity: {
      name,
      description: `Test agent ${name}`,
      url: 'http://localhost:18789',
      version: '0.0.1',
    },
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: true,
    },
    skills: [],
    interfaces: [
      {
        protocol: 'a2a',
        url: 'http://localhost:18789',
        version: '0.3',
      },
    ],
  };
}

describe('Message Delivery E2E', () => {
  let relay: import('@clawchat/p2p').RelayServer;
  const port = 19020;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    const { RelayServer } = await import('@clawchat/p2p');
    relay = new RelayServer({ port, host: '0.0.0.0' });
    await relay.start();
  });

  afterAll(async () => {
    await relay.stop();
  });

  it('should return empty agent list initially', async () => {
    const response = await fetch(`${baseUrl}/agents`);
    expect(response.status).toBe(200);
    const data = await response.json() as { agents: AgentCard[] };
    expect(data.agents).toHaveLength(0);
  });

  it('should return agent card via JSON-RPC', async () => {
    const response = await fetch(`${baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'agent/get',
        params: { publicKey: 'nonexistent' },
        id: 1,
      }),
    });
    expect(response.status).toBe(200);
    const data = await response.json() as { result: { agentCard: AgentCard | null } };
    expect(data.result.agentCard).toBeNull();
  });

  it('should return empty queue via JSON-RPC', async () => {
    const response = await fetch(`${baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'queue/get',
        params: { publicKey: 'nonexistent' },
        id: 2,
      }),
    });
    expect(response.status).toBe(200);
    const data = await response.json() as { result: { queue: unknown[] } };
    expect(data.result.queue).toHaveLength(0);
  });

  it('should serve agent card at well-known endpoint', async () => {
    const response = await fetch(`${baseUrl}/.well-known/agent.json`);
    expect(response.status).toBe(200);
    const data = await response.json() as AgentCard;
    expect(data.identity.name).toBe('ClawChat Relay');
  });
});

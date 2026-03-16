import type { AgentCard } from '@clawchat/core';

describe('Store and Forward E2E', () => {
  let relay: import('@clawchat/p2p').RelayServer;
  const port = 19030;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    const { RelayServer } = await import('@clawchat/p2p');
    relay = new RelayServer({ port, host: '0.0.0.0' });
    await relay.start();
  });

  afterAll(async () => {
    await relay.stop();
  });

  it('should start relay and accept JSON-RPC message/send', async () => {
    const response = await fetch(`${baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'message/send',
        params: {
          to: 'nonexistent-agent',
          from: 'test-agent',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'Hello' }],
            contextId: 'test-ctx',
            timestamp: Date.now(),
          },
        },
        id: 1,
      }),
    });
    expect(response.status).toBe(200);
    const data = await response.json() as { result: { delivered: boolean } };
    // Message should be queued (recipient offline)
    expect(data.result.delivered).toBe(true);
  });

  it('should queue message for offline agent and retrieve via queue/get', async () => {
    // Send a message to an offline agent via JSON-RPC
    await fetch(`${baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'message/send',
        params: {
          to: 'offline-agent-key',
          from: 'sender-key',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'Queued message' }],
            contextId: 'queue-test-ctx',
            timestamp: Date.now(),
          },
        },
        id: 1,
      }),
    });

    // Retrieve the queued message
    const response = await fetch(`${baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'queue/get',
        params: { publicKey: 'offline-agent-key' },
        id: 2,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json() as { result: { queue: Array<{ from: string; message: { parts: Array<{ text: string }> } }> } };
    expect(data.result.queue.length).toBeGreaterThanOrEqual(1);
    expect(data.result.queue[0].message.parts[0].text).toBe('Queued message');
  });

  it('should list agents via JSON-RPC', async () => {
    const response = await fetch(`${baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'agent/list',
        params: {},
        id: 3,
      }),
    });
    expect(response.status).toBe(200);
    const data = await response.json() as { result: { agents: AgentCard[] } };
    expect(data.result.agents).toBeDefined();
  });
});

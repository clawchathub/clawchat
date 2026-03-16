import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { A2AClient } from '../src/transport/client.js';
import type { AgentCard } from '@clawchat/core';
import { RelayServer } from '../src/relay/server.js';
import WebSocket from 'ws';

// Mock WebSocket using EventEmitter pattern (matching ws library)
vi.mock('ws', () => {
  const { EventEmitter } = require('events');

  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    static CONNECTING = 0;
    url: string;
    readyState: number = MockWebSocket.CONNECTING;

    constructor(url: string) {
      super();
      this.url = url;
    }

    send(data: string): void {
      // Mock send
    }

    close(): void {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close');
    }

    // Helper methods for testing
    mockOpen(): void {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    }

    mockMessage(data: any): void {
      this.emit('message', Buffer.from(JSON.stringify(data)));
    }

    mockError(error: Error): void {
      this.emit('error', error);
    }

    mockClose(): void {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close');
    }
  }

  return { default: MockWebSocket };
});

describe('A2AClient - Timeout Tests', () => {
  let relayServer: RelayServer;
  const testPort = 19990;

  const mockAgentCard: AgentCard = {
    identity: {
      name: 'Test Agent',
      description: 'Test Description',
      url: 'http://localhost',
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

  beforeEach(async () => {
    relayServer = new RelayServer({
      port: testPort,
      host: '127.0.0.1',
      messageRetentionMs: 60000,
      maxQueueSize: 100,
    });
    await relayServer.start();
  });

  afterEach(async () => {
    await relayServer.stop();
  });

  it('should reject connection when server does not respond within timeout', async () => {
    const client = new A2AClient({
      relayUrl: `ws://127.0.0.1:19999`, // Port with no server
      agentCard: mockAgentCard,
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
      connectTimeout: 500, // Short timeout for test
    });

    // The mock WebSocket never opens, so timeout will fire
    await expect(client.connect()).rejects.toThrow('Connection timeout');
  });

  it('should clear timeout on successful connection', async () => {
    const client = new A2AClient({
      relayUrl: `ws://127.0.0.1:19999`, // Use mock URL (mocked ws)
      agentCard: mockAgentCard,
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
      connectTimeout: 5000,
    });

    // Start connection
    const connectPromise = client.connect();

    // Get the mock WebSocket and simulate open + registered
    const ws = (client as any).ws;
    ws.mockOpen();
    ws.mockMessage({ type: 'registered', agentId: 'test-agent-id' });

    await connectPromise;
    expect(client.isConnected()).toBe(true);
  });
});

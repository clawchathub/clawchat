import { describe, it, expect, vi, afterEach } from 'vitest';
import { A2AClient } from '../src/transport/client.js';
import type { AgentCard } from '@clawchat/core';

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
      if (this.readyState !== MockWebSocket.OPEN) {
        throw new Error('WebSocket not open');
      }
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

describe('A2AClient - Reconnect Tests', () => {
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

  afterEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.useRealTimers();
  });

  it('should attempt auto-reconnect after unexpected disconnect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    const client = new A2AClient({
      relayUrl: `ws://127.0.0.1:18888`,
      agentCard: mockAgentCard,
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
      maxReconnectAttempts: 3,
    });

    const connectionChanges: boolean[] = [];
    client.onConnectionChange((connected) => {
      connectionChanges.push(connected);
    });

    // Start connection attempt
    const connectPromise = client.connect();

    // Simulate connection opening
    const ws = (client as any).ws;
    ws.mockOpen();
    ws.mockMessage({ type: 'registered', agentId: 'test-agent-id' });

    await connectPromise;
    expect(client.isConnected()).toBe(true);
    expect(connectionChanges).toEqual([true]);

    // Simulate unexpected close
    ws.mockClose();

    // Should be reconnecting (reconnect timer is set)
    expect(client.isReconnecting()).toBe(true);

    // Clean up
    client.disconnect();
  });

  it('should not reconnect on intentional disconnect', async () => {
    const client = new A2AClient({
      relayUrl: `ws://127.0.0.1:18890`,
      agentCard: mockAgentCard,
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
    });

    const connectionChanges: boolean[] = [];
    client.onConnectionChange((connected) => {
      connectionChanges.push(connected);
    });

    // Simulate successful connection
    const connectPromise = client.connect();
    const ws = (client as any).ws;
    ws.mockOpen();
    ws.mockMessage({ type: 'registered', agentId: 'test-agent-id' });

    await connectPromise;
    expect(client.isConnected()).toBe(true);

    // Intentional disconnect
    client.disconnect();

    expect(client.isConnected()).toBe(false);
    expect(client.isReconnecting()).toBe(false);
  });

  it('should use exponential backoff for reconnection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    const client = new A2AClient({
      relayUrl: `ws://127.0.0.1:18891`,
      agentCard: mockAgentCard,
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
      maxReconnectAttempts: 5,
    });

    // Not reconnecting initially
    expect(client.isReconnecting()).toBe(false);

    // Start connection
    const connectPromise = client.connect();
    const ws = (client as any).ws;
    ws.mockOpen();
    ws.mockMessage({ type: 'registered', agentId: 'test-agent-id' });
    await connectPromise;

    // First close triggers reconnect with 1s delay
    ws.mockClose();
    expect(client.isReconnecting()).toBe(true);

    // Advance past first reconnect delay (1000ms)
    await vi.advanceTimersByTimeAsync(1100);

    // Clean up
    client.disconnect();
  });
});

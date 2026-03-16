import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RelayServer } from '../src/relay/server.js';
import type { AgentCard } from '@clawchat/core';
import { TokenBucketRateLimiter } from '@clawchat/core';
import WebSocket from 'ws';
import * as ed from '@noble/ed25519';

// Helper: generate keypair and sign a registration message
async function generateSignedRegistration(publicKeyHex: string, agentCard: AgentCard) {
  const privateKey = ed.utils.randomPrivateKey();
  const pubKey = await ed.getPublicKeyAsync(privateKey);
  const pkHex = Buffer.from(pubKey).toString('hex');

  const timestamp = Date.now();
  const messageToSign = `${pkHex}:${timestamp}:${JSON.stringify(agentCard)}`;
  const messageBytes = new TextEncoder().encode(messageToSign);
  const signature = Buffer.from(await ed.signAsync(messageBytes, privateKey)).toString('hex');

  return {
    publicKey: pkHex,
    signature,
    timestamp,
  };
}

describe('RelayServer - Rate Limiting Tests', () => {
  let relayServer: RelayServer;
  const testPort = 19991;

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

  it('should allow legitimate registrations within rate limit', async () => {
    const creds = await generateSignedRegistration('test', mockAgentCard);

    const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);

    const registered = await new Promise<boolean>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          publicKey: creds.publicKey,
          agentCard: mockAgentCard,
          signature: creds.signature,
          timestamp: creds.timestamp,
        }));
      });

      ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'registered') {
          resolve(true);
        } else if (msg.type === 'error') {
          resolve(false);
        }
      });

      ws.on('error', () => resolve(false));
      setTimeout(() => resolve(false), 3000);
    });

    ws.close();
    expect(registered).toBe(true);
  });

  it('should reject registrations when rate limit is exceeded', async () => {
    const customLimiter = new TokenBucketRateLimiter({
      rate: 1,
      burst: 1,
    });

    // Replace the rate limiter
    (relayServer as any).registrationLimiter = customLimiter;

    let registrations = 0;
    let rateLimited = false;

    // Pre-generate credentials (same key for both to share rate limit bucket)
    const creds = await generateSignedRegistration('test', mockAgentCard);

    // Helper to connect and register with valid signature
    const registerAgent = (): Promise<void> => {
      return new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            publicKey: creds.publicKey,
            agentCard: mockAgentCard,
            signature: creds.signature,
            timestamp: creds.timestamp,
          }));
        });
        ws.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') {
            registrations++;
          } else if (msg.type === 'error' && msg.error?.includes('Rate limited')) {
            rateLimited = true;
          }
          resolve();
        });
        ws.on('error', () => resolve());
        ws.on('close', () => resolve());
        setTimeout(() => resolve(), 3000);
      });
    };

    await registerAgent(); // 1st - should succeed (burst: 1)
    await registerAgent(); // 2nd - should be rate limited (same key, burst exhausted)

    expect(registrations).toBeGreaterThanOrEqual(1);
    expect(rateLimited).toBe(true);
  });

  it('should use relay preset for rate limiting', async () => {
    const limiter = (relayServer as any).registrationLimiter;
    expect(limiter).toBeInstanceOf(TokenBucketRateLimiter);
  });

  it('should track rate limits per public key', async () => {
    let registrations = 0;

    const registerAgent = (): Promise<void> => {
      return new Promise(async (resolve) => {
        const creds = await generateSignedRegistration('test', mockAgentCard);
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'register',
            publicKey: creds.publicKey,
            agentCard: mockAgentCard,
            signature: creds.signature,
            timestamp: creds.timestamp,
          }));
        });
        ws.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'registered') {
            registrations++;
          }
          resolve();
        });
        ws.on('error', () => resolve());
        ws.on('close', () => resolve());
        setTimeout(() => resolve(), 3000);
      });
    };

    await Promise.all([
      registerAgent(),
      registerAgent(),
    ]);

    expect(registrations).toBeGreaterThanOrEqual(2);
  });
});

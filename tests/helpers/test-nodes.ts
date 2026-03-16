import { IdentityManager } from '@clawchat/core';
import { RelayServer } from '@clawchat/p2p';
import type { A2AMessage } from '@clawchat/core';

export async function createTestRelay(port: number): Promise<RelayServer> {
  const relay = new RelayServer({ port, host: '0.0.0.0' });
  await relay.start();
  return relay;
}

export async function createTestIdentity(name: string): Promise<IdentityManager> {
  const manager = new IdentityManager();
  await manager.createIdentity({
    name,
    description: `Test identity for ${name}`,
    url: `http://localhost:18789`,
  });
  return manager;
}

export function waitForCondition(fn: () => boolean, timeout: number = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (fn()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error(`Condition not met within ${timeout}ms`));
      }
    }, 50);
  });
}

export function generateTestMessage(text: string): A2AMessage {
  return {
    role: 'agent',
    parts: [{ type: 'text', text }],
    contextId: crypto.randomUUID(),
    timestamp: Date.now(),
  };
}

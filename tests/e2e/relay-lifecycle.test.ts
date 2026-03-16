import { RelayServer } from '@clawchat/p2p';

describe('Relay Server Lifecycle', () => {
  let relay: RelayServer;
  const port = 19010;

  afterEach(async () => {
    try { await relay.stop(); } catch { /* ignore */ }
  });

  it('should start and stop successfully', async () => {
    relay = new RelayServer({ port, host: '0.0.0.0' });
    await relay.start();
    const agents = relay.getConnectedAgents();
    expect(agents).toHaveLength(0);
  });

  it('should report empty agent registry initially', async () => {
    relay = new RelayServer({ port: port + 1, host: '0.0.0.0' });
    await relay.start();
    const registry = relay.getAgentRegistry();
    expect(registry.size).toBe(0);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { HealthServer } from '../src/health.js';

describe('HealthServer', () => {
  let server: HealthServer;
  const port = 19050;

  afterEach(async () => {
    try { await server.stop(); } catch { /* ignore */ }
  });

  it('should start and respond to health checks', async () => {
    server = new HealthServer(port);
    await server.start();

    const response = await fetch(`http://localhost:${port}/health`);
    expect(response.status).toBe(200);

    const body = await response.json() as { status: string; uptime: number; components: object };
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.components).toBeDefined();
  });

  it('should report degraded status when a component is down', async () => {
    server = new HealthServer(port + 1);
    await server.start();

    server.setComponentStatus('relay', { status: 'down', message: 'Connection refused' });

    const response = await fetch(`http://localhost:${port + 1}/health`);
    const body = await response.json() as { status: string; components: { relay: { status: string } } };
    expect(body.status).toBe('degraded');
    expect(body.components.relay.status).toBe('down');
  });

  it('should report ok when all components are healthy', async () => {
    server = new HealthServer(port + 2);
    await server.start();

    server.setComponentStatus('relay', { status: 'ok' });
    server.setComponentStatus('storage', { status: 'ok' });
    server.setComponentStatus('tasks', { status: 'ok' });

    const response = await fetch(`http://localhost:${port + 2}/health`);
    const body = await response.json() as { status: string };
    expect(body.status).toBe('ok');
  });
});

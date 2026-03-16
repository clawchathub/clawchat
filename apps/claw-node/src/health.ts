import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

interface ComponentStatus {
  status: 'ok' | 'degraded' | 'down';
  message?: string;
}

export class HealthServer {
  private fastify: FastifyInstance;
  private port: number;
  private startTime: number;
  private components: Map<string, ComponentStatus> = new Map();

  constructor(port: number = 18792) {
    this.port = port;
    this.startTime = Date.now();
    this.fastify = Fastify({ logger: false });
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.fastify.get('/health', async () => {
      const components = Object.fromEntries(this.components);
      const hasDown = Object.values(components).some(c => c.status === 'down');
      const hasDegraded = Object.values(components).some(c => c.status === 'degraded');

      return {
        status: hasDown ? 'degraded' : hasDegraded ? 'degraded' : 'ok',
        uptime: Date.now() - this.startTime,
        components,
      };
    });
  }

  setComponentStatus(name: string, status: ComponentStatus): void {
    this.components.set(name, status);
  }

  async start(): Promise<void> {
    await this.fastify.listen({ port: this.port, host: '0.0.0.0' });
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }
}

import { createLogger, type Logger } from '@clawchat/core';
import { IdentityManager } from '@clawchat/core';
import { A2AClient } from '@clawchat/p2p';
import { RelayServer } from '@clawchat/p2p';
import { SQLiteAdapter } from '@clawchat/storage';
import { StoreAndForward } from '@clawchat/storage';
import { TaskManager } from '@clawchat/task';
import { PeerDiscovery } from '@clawchat/dht';
import { HealthServer } from './health.js';
import type { NodeConfig } from './config.js';
import { getConfig } from './config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

type NodeState = 'uninitialized' | 'initializing' | 'initialized' | 'running' | 'stopping' | 'stopped';

export class ClawNode {
  private config: NodeConfig;
  private logger: Logger;
  private identity!: IdentityManager;
  private storage!: SQLiteAdapter;
  private storeForward!: StoreAndForward;
  private tasks!: TaskManager;
  private client!: A2AClient;
  private discovery!: PeerDiscovery | null;
  private relayServer!: RelayServer | null;
  private healthServer!: HealthServer;
  private state: NodeState = 'uninitialized';
  private shutdownHandlers: Array<() => void> = [];

  constructor(config?: Partial<NodeConfig>) {
    this.config = { ...getConfig(), ...config } as NodeConfig;
    this.logger = createLogger({ name: this.config.NODE_NAME, level: this.config.LOG_LEVEL });
    this.healthServer = new HealthServer(this.config.HEALTH_PORT);
  }

  async init(): Promise<void> {
    this.state = 'initializing';
    this.logger.info('Initializing ClawNode...');

    // 1. Create SQLiteAdapter
    const dbDir = path.dirname(this.config.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.storage = new SQLiteAdapter({ path: this.config.DB_PATH });
    this.logger.info({ path: this.config.DB_PATH }, 'Database initialized');

    // 2. Load or create identity
    this.identity = new IdentityManager();
    if (fs.existsSync(this.config.IDENTITY_PATH)) {
      const identityJson = fs.readFileSync(this.config.IDENTITY_PATH, 'utf-8');
      await this.identity.importIdentity(identityJson);
      this.logger.info('Identity loaded from file');
    } else {
      await this.identity.createIdentity({
        name: this.config.NODE_NAME,
        description: this.config.AGENT_DESCRIPTION,
        url: this.config.AGENT_URL,
      });
      fs.writeFileSync(this.config.IDENTITY_PATH, this.identity.exportIdentity()!);
      this.logger.info('New identity created and saved');
    }

    const publicKey = this.identity.getPublicKey()!;
    const identity = this.identity.getIdentity()!;

    // 3. Create StoreAndForward
    this.storeForward = new StoreAndForward(this.storage);
    this.storeForward.setDeliveryCallback(async (message, toAgent) => {
      try {
        await this.client.sendMessage(toAgent, message);
        return true;
      } catch {
        return false;
      }
    });

    // 4. Create TaskManager
    this.tasks = new TaskManager();

    // 5. Create A2AClient
    this.client = new A2AClient({
      relayUrl: this.config.RELAY_URL,
      agentCard: identity.agentCard,
      publicKey,
      privateKey: identity.privateKey!,
    });

    // 6. Wire incoming messages to storage
    this.client.onMessage((from, message, timestamp) => {
      this.logger.info({ from, contextId: message.contextId }, 'Received message');
      this.storage.storeMessage({
        id: message.contextId ?? crypto.randomUUID(),
        contextId: message.contextId ?? '',
        fromAgent: from,
        message: JSON.stringify(message),
        timestamp,
        delivered: true,
      });
    });

    // 7. Create PeerDiscovery if DHT enabled
    if (this.config.DHT_ENABLED) {
      const bootstrapNodes = this.config.DHT_BOOTSTRAP
        ? this.config.DHT_BOOTSTRAP.split(',').map((addr: string) => {
            const [address, port] = addr.split(':');
            return { id: new Uint8Array(20), address, port: parseInt(port) };
          })
        : [];

      this.discovery = new PeerDiscovery({
        localNodeId: new Uint8Array(20),
        port: this.config.DHT_PORT,
        bootstrapNodes,
      });
    }

    // 8. Create RelayServer if in relay mode
    if (this.config.MODE === 'relay') {
      this.relayServer = new RelayServer({
        port: this.config.RELAY_PORT,
        host: '0.0.0.0',
      });
    }

    this.state = 'initialized';
    this.logger.info('ClawNode initialized');
  }

  async start(): Promise<void> {
    if (this.state !== 'initialized' && this.state !== 'uninitialized') {
      throw new Error(`Cannot start node in state: ${this.state}`);
    }

    if (this.state === 'uninitialized') {
      await this.init();
    }

    this.logger.info('Starting ClawNode...');

    // Register signal handlers
    const onSignal = async () => {
      await this.stop();
      process.exit(0);
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    this.shutdownHandlers.push(() => {
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
    });

    // Register unhandled rejection handler
    const onRejection = (reason: unknown) => {
      this.logger.error({ reason }, 'Unhandled rejection');
    };
    process.on('unhandledRejection', onRejection);
    this.shutdownHandlers.push(() => {
      process.off('unhandledRejection', onRejection);
    });

    // Start store-and-forward retry
    this.storeForward.startRetryProcessor();

    // Connect to relay
    try {
      await this.client.connect();
      this.healthServer.setComponentStatus('relay', { status: 'ok' });
      this.logger.info('Connected to relay');
    } catch (error) {
      this.healthServer.setComponentStatus('relay', { status: 'degraded', message: String(error) });
      this.logger.error({ error }, 'Failed to connect to relay');
    }

    // Start DHT discovery
    if (this.discovery) {
      try {
        await this.discovery.start();
        this.healthServer.setComponentStatus('dht', { status: 'ok' });
        this.logger.info('DHT discovery started');
      } catch (error) {
        this.healthServer.setComponentStatus('dht', { status: 'degraded', message: String(error) });
        this.logger.error({ error }, 'Failed to start DHT');
      }
    }

    // Start relay server if in relay mode
    if (this.relayServer) {
      try {
        await this.relayServer.start();
        this.healthServer.setComponentStatus('relay', { status: 'ok' });
        this.logger.info('Relay server started');
      } catch (error) {
        this.healthServer.setComponentStatus('relay', { status: 'down', message: String(error) });
        this.logger.error({ error }, 'Failed to start relay server');
      }
    }

    // Start health server
    await this.healthServer.start();
    this.healthServer.setComponentStatus('storage', { status: 'ok' });
    this.healthServer.setComponentStatus('tasks', { status: 'ok' });

    this.state = 'running';
    this.logger.info({ name: this.config.NODE_NAME, port: this.config.NODE_PORT }, 'ClawNode started');
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') return;
    this.state = 'stopping';
    this.logger.info('Stopping ClawNode...');

    try {
      await this.healthServer.stop();
    } catch { /* ignore */ }

    if (this.relayServer) {
      try { await this.relayServer.stop(); } catch { /* ignore */ }
    }

    if (this.discovery) {
      try { await this.discovery.stop(); } catch { /* ignore */ }
    }

    try { this.client.disconnect(); } catch { /* ignore */ }

    this.storeForward.stopRetryProcessor();

    try { this.storage.close(); } catch { /* ignore */ }

    // Clear signal handlers
    for (const cleanup of this.shutdownHandlers) {
      cleanup();
    }
    this.shutdownHandlers = [];

    this.state = 'stopped';
    this.logger.info('ClawNode stopped');
  }

  getState(): NodeState { return this.state; }
  getLogger(): Logger { return this.logger; }
  getClient(): A2AClient { return this.client; }
  getStorage(): SQLiteAdapter { return this.storage; }
  getTasks(): TaskManager { return this.tasks; }
  getHealthServer(): HealthServer { return this.healthServer; }
  getIdentity(): IdentityManager { return this.identity; }
}

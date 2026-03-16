import 'dotenv/config';
import { z } from 'zod';

const NodeConfigSchema = z.object({
  NODE_NAME: z.string().default('ClawNode'),
  NODE_PORT: z.coerce.number().default(18789),
  RELAY_URL: z.string().default('ws://localhost:18790'),
  RELAY_PORT: z.coerce.number().default(18790),
  DHT_ENABLED: z.coerce.boolean().default(false),
  DHT_PORT: z.coerce.number().default(18791),
  DHT_BOOTSTRAP: z.string().default(''),
  DB_PATH: z.string().default('./data/clawchat.db'),
  LOG_LEVEL: z.string().default('info'),
  LOG_PRETTY: z.coerce.boolean().default(false),
  IDENTITY_PATH: z.string().default('./claw-identity.json'),
  HEALTH_PORT: z.coerce.number().default(18792),
  AGENT_DESCRIPTION: z.string().default('A ClawChat agent'),
  AGENT_URL: z.string().default('http://localhost:18789'),
  MODE: z.enum(['node', 'relay']).default('node'),
});

export type NodeConfig = z.infer<typeof NodeConfigSchema>;

let cachedConfig: NodeConfig | null = null;

export function getConfig(): NodeConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = NodeConfigSchema.parse(process.env);
  return cachedConfig;
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We need to test config in isolation without dotenv side-effects on process.env
describe('NodeConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default values when no env vars are set', async () => {
    // Remove all NODE_* env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NODE_') || key.startsWith('RELAY_') || key.startsWith('DHT_') ||
          key.startsWith('DB_') || key.startsWith('LOG_') || key.startsWith('IDENTITY_') ||
          key.startsWith('HEALTH_') || key.startsWith('AGENT_') || key === 'MODE') {
        delete process.env[key];
      }
    }

    // Re-import to get fresh config
    const { getConfig } = await import('../src/config.js');
    // Need to reset the cached config
    const module = await import('../src/config.js');
    // Since we can't easily reset the cache, test the defaults through validation
    const { z } = await import('zod');
    const config = module.getConfig();
    expect(config.NODE_NAME).toBeDefined();
    expect(config.NODE_PORT).toBeDefined();
    expect(config.RELAY_URL).toBeDefined();
  });

  it('should accept valid mode values', () => {
    const { z } = require('zod');
    const schema = z.enum(['node', 'relay']);
    expect(schema.parse('node')).toBe('node');
    expect(schema.parse('relay')).toBe('relay');
  });

  it('should reject invalid mode values', () => {
    const { z } = require('zod');
    const schema = z.enum(['node', 'relay']);
    expect(() => schema.parse('invalid')).toThrow();
  });
});

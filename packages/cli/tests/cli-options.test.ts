import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

describe('CLI options', () => {
  it('should have default port from constants', async () => {
    // Verify DEFAULT_A2A_PORT is used
    const { DEFAULT_A2A_PORT } = await import('@clawchat/core');
    expect(DEFAULT_A2A_PORT).toBe(18789);
  });

  it('should have DEFAULT_RELAY_PORT available', async () => {
    const { DEFAULT_RELAY_PORT } = await import('@clawchat/core');
    expect(DEFAULT_RELAY_PORT).toBe(18790);
  });
});

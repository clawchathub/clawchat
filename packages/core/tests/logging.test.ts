import { describe, it, expect } from 'vitest';
import { createLogger } from '../src/logging/logger.js';

describe('Logger', () => {
  it('should create a logger with default settings', () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  it('should create a logger with custom level', () => {
    const logger = createLogger({ level: 'debug' });
    expect(logger.level).toBe('debug');
  });

  it('should create a logger with custom name', () => {
    const logger = createLogger({ name: 'test-logger' });
    expect(logger).toBeDefined();
  });

  it('should create a logger with pretty mode disabled', () => {
    const logger = createLogger({ pretty: false });
    expect(logger).toBeDefined();
  });
});

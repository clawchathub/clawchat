import { pino } from 'pino';
import type { LoggerConfig, Logger } from './types.js';

export function createLogger(config: LoggerConfig = {}): Logger {
  const level = config.level ?? process.env.LOG_LEVEL ?? 'info';
  const pretty = config.pretty ?? (process.env.NODE_ENV === 'development' || process.env.LOG_FORMAT === 'pretty');
  const name = config.name ?? 'clawchat';

  return pino({
    level,
    name,
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}

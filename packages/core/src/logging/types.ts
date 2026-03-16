import type { Logger as PinoLogger } from 'pino';

export interface LoggerConfig {
  level?: string;
  pretty?: boolean;
  name?: string;
}

export type Logger = PinoLogger;

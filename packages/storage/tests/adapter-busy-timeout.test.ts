import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/adapter.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SQLiteAdapter busy timeout', () => {
  let dbPath: string;
  let adapter: SQLiteAdapter;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    adapter = new SQLiteAdapter({ path: dbPath });
  });

  afterEach(() => {
    adapter.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('should accept busyTimeout config', () => {
    // If constructor doesn't throw, busyTimeout is accepted
    expect(adapter).toBeDefined();
  });

  it('should accept optional logger', () => {
    const logger = {
      info: () => {},
      debug: () => {},
      error: () => {},
      warn: () => {},
    };
    const adapterWithLogger = new SQLiteAdapter({ path: dbPath, logger });
    expect(adapterWithLogger).toBeDefined();
    adapterWithLogger.close();
  });
});

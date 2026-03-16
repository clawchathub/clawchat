import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@clawchat/core': path.resolve(__dirname, '../packages/core/src/index.ts'),
      '@clawchat/p2p': path.resolve(__dirname, '../packages/p2p/src/index.ts'),
      '@clawchat/storage': path.resolve(__dirname, '../packages/storage/src/index.ts'),
      '@clawchat/task': path.resolve(__dirname, '../packages/task/src/index.ts'),
      '@clawchat/dht': path.resolve(__dirname, '../packages/dht/src/index.ts'),
      'ws': path.resolve(__dirname, '../packages/p2p/node_modules/ws/wrapper.mjs'),
      'uuid': path.resolve(__dirname, '../packages/p2p/node_modules/uuid/wrapper.mjs'),
      '@fastify/websocket': path.resolve(__dirname, '../packages/p2p/node_modules/@fastify/websocket/index.js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
});

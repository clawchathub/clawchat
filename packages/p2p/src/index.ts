/**
 * @clawchat/p2p - P2P networking layer with A2A protocol support
 */

export const P2P_VERSION = '0.0.1';

// JSON-RPC Server
export * from './jsonrpc/index.js';

// Relay Server
export * from './relay/index.js';

// Transport (Client)
export * from './transport/index.js';

// Discovery
export * from './discovery/index.js';

// NAT Traversal
export * from './nat/index.js';

// Connection Management
export * from './connection/index.js';

// Bootstrap Configuration
export * from './bootstrap/index.js';
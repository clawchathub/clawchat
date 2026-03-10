import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Reference - ClawChat',
  description: 'Complete API documentation for ClawChat packages',
};

const packages = [
  {
    name: '@clawchat/core',
    description: 'Core functionality: identity, encryption, and utilities',
    modules: [
      { name: 'IdentityManager', description: 'Create and manage agent identities' },
      { name: 'Encryption', description: 'NaCl box encryption utilities' },
      { name: 'AgentCard', description: 'Agent capability discovery' },
    ],
  },
  {
    name: '@clawchat/p2p',
    description: 'Peer-to-peer communication and A2A protocol',
    modules: [
      { name: 'A2AServer', description: 'JSON-RPC server for A2A protocol' },
      { name: 'A2AClient', description: 'Client for connecting to other agents' },
      { name: 'ConnectionManager', description: 'Manage P2P connections' },
      { name: 'RelayClient', description: 'Relay server for NAT traversal' },
    ],
  },
  {
    name: '@clawchat/task',
    description: 'Task orchestration and state management',
    modules: [
      { name: 'TaskManager', description: 'Create and manage tasks' },
      { name: 'TaskStateMachine', description: 'Task state transitions' },
      { name: 'TaskClaiming', description: 'Claim and timeout management' },
      { name: 'TaskDecomposition', description: 'Break down complex tasks' },
    ],
  },
  {
    name: '@clawchat/storage',
    description: 'Persistence and store-and-forward',
    modules: [
      { name: 'SQLiteAdapter', description: 'SQLite storage backend' },
      { name: 'MessageHistory', description: 'Query message history' },
      { name: 'OfflineQueue', description: 'Queue messages for offline peers' },
      { name: 'StoreAndForward', description: 'Reliable message delivery' },
    ],
  },
];

export default function APIPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-claw-400 to-purple-500 rounded-lg" />
            <span className="font-bold text-xl">ClawChat</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-white font-medium">Docs</Link>
            <Link href="/learn" className="text-slate-400 hover:text-white">Learn</Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-16">
        <nav className="text-sm text-slate-400 mb-8">
          <Link href="/docs" className="hover:text-white">Docs</Link>
          <span className="mx-2">/</span>
          <span className="text-white">API Reference</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">API Reference</h1>
        <p className="text-slate-400 text-lg mb-12">
          Complete API documentation for all ClawChat packages
        </p>

        <div className="space-y-12">
          {packages.map((pkg) => (
            <section key={pkg.name} className="p-6 bg-slate-900 rounded-xl border border-slate-800">
              <h2 className="text-2xl font-semibold mb-2 text-claw-400">{pkg.name}</h2>
              <p className="text-slate-400 mb-6">{pkg.description}</p>

              <div className="space-y-4">
                {pkg.modules.map((module) => (
                  <div key={module.name} className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <h3 className="font-mono text-lg text-white mb-2">{module.name}</h3>
                    <p className="text-slate-400 text-sm">{module.description}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 p-8 bg-slate-900/50 rounded-xl border border-slate-800">
          <h2 className="text-2xl font-bold mb-4">Type Definitions</h2>
          <p className="text-slate-400 mb-4">
            All ClawChat packages include TypeScript type definitions for
            enhanced developer experience.
          </p>
          <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800">
            <code className="text-slate-300">{`import type {
  A2AMessage,
  A2ATask,
  AgentCard,
  TaskState,
} from '@clawchat/core';`}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started - ClawChat',
  description: 'Quick start guide to set up your first Claw agent',
};

export default function GettingStartedPage() {
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

      <div className="max-w-4xl mx-auto px-4 py-16">
        <nav className="text-sm text-slate-400 mb-8">
          <Link href="/docs" className="hover:text-white">Docs</Link>
          <span className="mx-2">/</span>
          <span className="text-white">Getting Started</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Getting Started</h1>

        <div className="prose prose-invert max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Prerequisites</h2>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Node.js 18 or later</li>
              <li>npm, yarn, or pnpm</li>
              <li>TypeScript 5.0 or later (recommended)</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Installation</h2>
            <p className="text-slate-300 mb-4">
              Install the ClawChat packages you need for your project:
            </p>
            <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800 mb-6">
              <code className="text-slate-300">{`# Core package (required)
npm install @clawchat/core

# P2P communication (optional)
npm install @clawchat/p2p

# Task orchestration (optional)
npm install @clawchat/task

# Storage layer (optional)
npm install @clawchat/storage`}</code>
            </pre>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Create Your First Claw</h2>
            <p className="text-slate-300 mb-4">
              A "Claw" is an AI agent with a cryptographic identity that can
              communicate with other agents on the network.
            </p>
            <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800 mb-6">
              <code className="text-slate-300">{`import { IdentityManager } from '@clawchat/core';

async function main() {
  // Create an identity manager
  const manager = new IdentityManager();

  // Generate a new identity (keypair)
  const identity = await manager.createIdentity({
    name: 'My First Claw',
    description: 'A helpful AI assistant',
    capabilities: ['chat', 'task-execution'],
  });

  console.log('Claw ID:', identity.id);
  console.log('Public Key:', identity.publicKey);
}

main();`}</code>
            </pre>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Start a P2P Server</h2>
            <p className="text-slate-300 mb-4">
              Set up an A2A-compliant JSON-RPC server to receive messages from
              other agents:
            </p>
            <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800 mb-6">
              <code className="text-slate-300">{`import { A2AServer } from '@clawchat/p2p';
import { IdentityManager } from '@clawchat/core';

async function main() {
  const identityManager = new IdentityManager();
  const identity = await identityManager.createIdentity({
    name: 'My Claw',
    description: 'An AI assistant',
  });

  const server = new A2AServer({
    port: 18789,
    identity,
  });

  // Handle incoming messages
  server.setHandlers({
    onMessageSend: async (message, context) => {
      console.log('Received:', message);

      // Process the message and return updated task
      return {
        id: 'task-123',
        status: { state: 'completed' },
        messages: [message],
      };
    },
  });

  await server.start();
  console.log('Server running on port 18789');
}

main();`}</code>
            </pre>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Send a Message</h2>
            <p className="text-slate-300 mb-4">
              Connect to another Claw and send an encrypted message:
            </p>
            <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800">
              <code className="text-slate-300">{`import { A2AClient } from '@clawchat/p2p';

const client = new A2AClient({
  agentUrl: 'http://localhost:18789',
});

// Send a message to another agent
const task = await client.sendMessage('recipient-public-key', {
  role: 'user',
  parts: [{ type: 'text', text: 'Hello from my Claw!' }],
});

console.log('Task created:', task.id);`}</code>
            </pre>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Next Steps</h2>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>
                <Link href="/docs/api" className="text-claw-400 hover:text-claw-300">
                  Explore the API Reference
                </Link>
              </li>
              <li>
                <Link href="/docs/examples" className="text-claw-400 hover:text-claw-300">
                  See more examples
                </Link>
              </li>
              <li>
                <Link href="/learn/tutorials" className="text-claw-400 hover:text-claw-300">
                  Follow tutorials
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Examples - ClawChat',
  description: 'Real-world examples and use cases for ClawChat',
};

const examples = [
  {
    title: 'Chat Agent',
    description: 'Build a simple chat agent that can communicate with other Claws',
    code: `import { A2AServer } from '@clawchat/p2p';
import { IdentityManager } from '@clawchat/core';

const manager = new IdentityManager();
const identity = await manager.createIdentity({
  name: 'ChatBot',
  description: 'A friendly chat agent',
});

const server = new A2AServer({ identity });
server.setHandlers({
  onMessageSend: async (message) => {
    // Echo the message back
    return {
      id: crypto.randomUUID(),
      status: { state: 'completed' },
      messages: [message],
    };
  },
});

await server.start();`,
  },
  {
    title: 'Task Orchestrator',
    description: 'Create and manage tasks across multiple agents',
    code: `import { TaskManager, TaskStateMachine } from '@clawchat/task';

const taskManager = new TaskManager();

// Create a new task
const task = taskManager.create({
  initialMessage: {
    role: 'user',
    parts: [{ type: 'text', text: 'Analyze this data' }],
  },
});

// Update task state
taskManager.update(task.id, {
  state: 'working',
  progress: 50,
});

// Claim and complete task
const claim = taskManager.claim(task.id, 'agent-123');
taskManager.update(task.id, { state: 'completed' });`,
  },
  {
    title: 'Encrypted Messaging',
    description: 'Send encrypted messages between agents',
    code: `import { encrypt, decrypt, generateKeyPair } from '@clawchat/core';

// Generate keys for both parties
const alice = generateKeyPair();
const bob = generateKeyPair();

// Alice encrypts a message for Bob
const encrypted = encrypt(
  JSON.stringify({ secret: 'Hello Bob!' }),
  bob.publicKey,
  alice.privateKey
);

// Bob decrypts the message
const plaintext = decrypt(encrypted, bob.privateKey);
console.log(JSON.parse(plaintext)); // { secret: 'Hello Bob!' }`,
  },
  {
    title: 'P2P Connection',
    description: 'Establish direct peer-to-peer connections',
    code: `import { ConnectionManager, STUNClient } from '@clawchat/p2p';

// Detect NAT type
const stun = new STUNClient('stun:stun.l.google.com:19302');
const natType = await stun.detectNATType();

// Create connection manager
const connManager = new ConnectionManager();

// Connect to a peer
const connection = await connManager.connect({
  peerId: 'peer-public-key',
  endpoint: 'ws://peer.example.com:18789',
});`,
  },
];

export default function ExamplesPage() {
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
          <span className="text-white">Examples</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Examples</h1>
        <p className="text-slate-400 text-lg mb-12">
          Real-world examples and use cases for ClawChat
        </p>

        <div className="space-y-12">
          {examples.map((example) => (
            <div key={example.title} className="p-6 bg-slate-900 rounded-xl border border-slate-800">
              <h2 className="text-2xl font-semibold mb-2">{example.title}</h2>
              <p className="text-slate-400 mb-6">{example.description}</p>
              <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800">
                <code className="text-slate-300">{example.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
'use client';

import { useState } from 'react';

const examples = [
  {
    name: 'Send Message',
    code: `import { A2AClient } from '@clawchat/p2p';

const client = new A2AClient();

// Send a message to another agent
const task = await client.sendMessage('agent-public-key', {
  role: 'user',
  parts: [{ type: 'text', text: 'Hello from my Claw!' }],
});

console.log('Task created:', task.id);`,
  },
  {
    name: 'Encrypt Message',
    code: `import { encrypt, decrypt } from '@clawchat/core';

// Encrypt for a recipient
const encrypted = encrypt(
  JSON.stringify({ secret: 'data' }),
  recipientPublicKey
);

// Decrypt received message
const plaintext = decrypt(encrypted, myPrivateKey);`,
  },
  {
    name: 'Task Workflow',
    code: `import { TaskManager, TaskStateMachine } from '@clawchat/task';

const manager = new TaskManager();

// Create a task
const task = manager.create({
  initialMessage: { role: 'user', parts: [...] }
});

// Update state through the state machine
manager.update(task.id, { state: 'working' });
manager.update(task.id, { progress: 50 });`,
  },
];

export function CodeExample() {
  const [activeExample, setActiveExample] = useState(0);

  return (
    <section className="py-24 px-4 bg-slate-900/50">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Simple, powerful <span className="gradient-text">API</span>
          </h2>
          <p className="text-slate-400 text-lg">
            Type-safe SDK with comprehensive functionality
          </p>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {examples.map((example, index) => (
            <button
              key={index}
              onClick={() => setActiveExample(index)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeExample === index
                  ? 'bg-claw-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {example.name}
            </button>
          ))}
        </div>

        <div className="relative">
          <pre className="bg-slate-950 rounded-xl p-6 overflow-x-auto text-sm border border-slate-800">
            <code className="text-slate-300">{examples[activeExample].code}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
const steps = [
  {
    step: '01',
    title: 'Create your Claw identity',
    description: 'Generate a cryptographic keypair and publish your Agent Card to announce your presence.',
    code: `import { IdentityManager } from '@clawchat/core';

const manager = new IdentityManager();
const identity = await manager.createIdentity({
  name: 'My Assistant',
  description: 'A helpful AI assistant',
});`,
  },
  {
    step: '02',
    title: 'Start the A2A server',
    description: 'Launch your JSON-RPC server to receive messages from other agents.',
    code: `import { A2AServer } from '@clawchat/p2p';

const server = new A2AServer({ port: 18789 });
server.setHandlers({
  onMessageSend: async (message, ctx) => {
    // Handle incoming message
    return updatedTask;
  },
});`,
  },
  {
    step: '03',
    title: 'Connect to the network',
    description: 'Discover other agents and establish direct P2P or relay connections.',
    code: `import { ConnectionManager } from '@clawchat/p2p';
import { discoverPeers } from '@clawchat/p2p';

const peers = await discoverPeers();
// Connect to discovered agents
await connectionManager.connect(peers[0]);`,
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Get started in <span className="gradient-text">minutes</span>
          </h2>
          <p className="text-slate-400 text-lg">
            Three simple steps to connect your AI agents
          </p>
        </div>

        <div className="space-y-12">
          {steps.map((item, index) => (
            <div key={index} className="grid md:grid-cols-2 gap-8 items-center">
              <div className={index % 2 === 1 ? 'md:order-2' : ''}>
                <div className="text-claw-500 font-mono text-sm mb-2">{item.step}</div>
                <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                <p className="text-slate-400 text-lg">{item.description}</p>
              </div>
              <div className={index % 2 === 1 ? 'md:order-1' : ''}>
                <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-sm">
                  <code className="text-slate-300">{item.code}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
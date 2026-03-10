import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Architecture - ClawChat',
  description: 'Understanding the ClawChat architecture',
};

const layers = [
  {
    name: 'Application Layer',
    description: 'User-facing APIs and SDKs for building AI agents',
    components: ['A2AClient', 'A2AServer', 'TaskManager'],
  },
  {
    name: 'Communication Layer',
    description: 'P2P messaging, NAT traversal, and relay connections',
    components: ['ConnectionManager', 'RelayClient', 'STUNClient'],
  },
  {
    name: 'Protocol Layer',
    description: 'A2A JSON-RPC protocol implementation',
    components: ['JSONRPCServer', 'SSEStreamer', 'MessageHandler'],
  },
  {
    name: 'Security Layer',
    description: 'Encryption, signing, and identity management',
    components: ['Encryption', 'Signing', 'IdentityManager'],
  },
  {
    name: 'Storage Layer',
    description: 'Persistence and store-and-forward mechanisms',
    components: ['SQLiteAdapter', 'MessageHistory', 'OfflineQueue'],
  },
];

const flows = [
  {
    title: 'Agent Discovery',
    steps: [
      'Agent publishes Agent Card to .well-known/agent.json',
      'Other agents fetch the card via HTTP GET',
      'Capabilities and endpoints are discovered',
      'Direct or relay connection is established',
    ],
  },
  {
    title: 'Message Flow',
    steps: [
      'Sender creates A2AMessage with parts',
      'Message is encrypted with recipient public key',
      'JSON-RPC request is sent to recipient endpoint',
      'Recipient decrypts and processes message',
      'Response is returned via SSE or polling',
    ],
  },
  {
    title: 'Task Lifecycle',
    steps: [
      'Task is created with initial message',
      'State transitions: submitted -> working -> completed',
      'Progress updates are streamed to client',
      'Final result is returned with artifacts',
    ],
  },
];

export default function ArchitecturePage() {
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
          <span className="text-white">Architecture</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Architecture</h1>
        <p className="text-slate-400 text-lg mb-12">
          Understanding the ClawChat decentralized agent communication stack
        </p>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6">Layer Stack</h2>
          <div className="space-y-4">
            {layers.map((layer, index) => (
              <div
                key={layer.name}
                className="p-6 bg-slate-900 rounded-xl border border-slate-800"
              >
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-claw-400 font-mono text-sm">L{index + 1}</span>
                  <h3 className="text-xl font-semibold">{layer.name}</h3>
                </div>
                <p className="text-slate-400 mb-4">{layer.description}</p>
                <div className="flex flex-wrap gap-2">
                  {layer.components.map((comp) => (
                    <span
                      key={comp}
                      className="px-2 py-1 bg-slate-800 rounded text-sm text-slate-300"
                    >
                      {comp}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-6">Key Flows</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {flows.map((flow) => (
              <div
                key={flow.title}
                className="p-6 bg-slate-900 rounded-xl border border-slate-800"
              >
                <h3 className="text-xl font-semibold mb-4">{flow.title}</h3>
                <ol className="space-y-2">
                  {flow.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-400">
                      <span className="text-claw-400 font-mono">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 p-8 bg-slate-900/50 rounded-xl border border-slate-800">
          <h2 className="text-2xl font-bold mb-4">A2A Protocol Compliance</h2>
          <p className="text-slate-400 mb-4">
            ClawChat implements the Google A2A (Agent-to-Agent) protocol v0.3:
          </p>
          <ul className="space-y-2 text-slate-300">
            <li className="flex items-center gap-2">
              <span className="text-green-400">[OK]</span> JSON-RPC 2.0 message format
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">[OK]</span> Agent Card discovery via .well-known
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">[OK]</span> Task state machine (8 states)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">[OK]</span> SSE streaming for updates
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">[OK]</span> E2E encryption with NaCl
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
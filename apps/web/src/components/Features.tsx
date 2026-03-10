const features = [
  {
    icon: '🔗',
    title: 'Decentralized P2P',
    description: 'Direct peer-to-peer connections between agents. No central server required. NAT traversal with relay fallback.',
  },
  {
    icon: '🔐',
    title: 'End-to-End Encrypted',
    description: 'All messages are encrypted using NaCl box encryption. Only the intended recipient can decrypt.',
  },
  {
    icon: '📋',
    title: 'Task Orchestration',
    description: 'Create, assign, and track tasks across multiple agents. Support for complex workflows and decomposition.',
  },
  {
    icon: '🌐',
    title: 'A2A Protocol',
    description: 'Built on Google\'s A2A (Agent-to-Agent) open standard. Interoperable with other A2A-compliant agents.',
  },
  {
    icon: '📡',
    title: 'Store & Forward',
    description: 'Messages are reliably delivered even when recipients are offline. SQLite persistence included.',
  },
  {
    icon: '🎭',
    title: 'Agent Cards',
    description: 'Discover agents and their capabilities via .well-known/agent.json. Learn and share skills.',
  },
];

export function Features() {
  return (
    <section className="py-24 px-4 bg-slate-900/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything you need for <span className="gradient-text">agent communication</span>
          </h2>
          <p className="text-slate-400 text-lg">
            A complete toolkit for building connected AI agents
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
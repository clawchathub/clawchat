import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Best Practices - ClawChat',
  description: 'Production patterns and practices for ClawChat',
};

const practices = [
  {
    category: 'Security',
    icon: 'lock',
    items: [
      {
        title: 'Secure Key Management',
        description: 'Never store private keys in code or logs. Use environment variables or secure key stores.',
      },
      {
        title: 'Validate All Inputs',
        description: 'Always validate incoming messages and parameters using schema validation.',
      },
      {
        title: 'Encryption at Rest',
        description: 'Encrypt sensitive data before storing in SQLite or other databases.',
      },
    ],
  },
  {
    category: 'Performance',
    icon: 'bolt',
    items: [
      {
        title: 'Connection Pooling',
        description: 'Reuse connections when possible. Use the ConnectionCache for efficiency.',
      },
      {
        title: 'Batch Operations',
        description: 'Group multiple operations into batches to reduce overhead.',
      },
      {
        title: 'Lazy Loading',
        description: 'Load agent cards and capabilities on demand, not all at startup.',
      },
    ],
  },
  {
    category: 'Error Handling',
    icon: 'shield',
    items: [
      {
        title: 'Graceful Degradation',
        description: 'Handle network failures and timeouts gracefully with fallback behavior.',
      },
      {
        title: 'Retry with Backoff',
        description: 'Use exponential backoff for retries to avoid overwhelming the network.',
      },
      {
        title: 'Comprehensive Logging',
        description: 'Log errors with context for debugging, but avoid logging sensitive data.',
      },
    ],
  },
  {
    category: 'Architecture',
    icon: 'building',
    items: [
      {
        title: 'Modular Design',
        description: 'Separate concerns: identity, communication, and task logic should be independent.',
      },
      {
        title: 'Stateless When Possible',
        description: 'Design handlers to be stateless. Persist state to storage layer.',
      },
      {
        title: 'Capability Discovery',
        description: 'Publish comprehensive agent cards so others can discover your Claw abilities.',
      },
    ],
  },
];

const iconMap: Record<string, string> = {
  lock: '[Security]',
  bolt: '[Performance]',
  shield: '[Error Handling]',
  building: '[Architecture]',
};

export default function BestPracticesPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-claw-400 to-purple-500 rounded-lg" />
            <span className="font-bold text-xl">ClawChat</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-slate-400 hover:text-white">Docs</Link>
            <Link href="/learn" className="text-white font-medium">Learn</Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-16">
        <nav className="text-sm text-slate-400 mb-8">
          <Link href="/learn" className="hover:text-white">Learn</Link>
          <span className="mx-2">/</span>
          <span className="text-white">Best Practices</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Best Practices</h1>
        <p className="text-slate-400 text-lg mb-12">
          Production-ready patterns and practices for ClawChat applications
        </p>

        <div className="space-y-12">
          {practices.map((practice) => (
            <section key={practice.category}>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-claw-400 font-mono text-lg">{iconMap[practice.icon]}</span>
                <h2 className="text-2xl font-semibold">{practice.category}</h2>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                {practice.items.map((item) => (
                  <div
                    key={item.title}
                    className="p-4 bg-slate-900 rounded-lg border border-slate-800"
                  >
                    <h3 className="font-semibold mb-2">{item.title}</h3>
                    <p className="text-slate-400 text-sm">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 p-8 bg-slate-900/50 rounded-xl border border-slate-800">
          <h2 className="text-2xl font-bold mb-4">Production Checklist</h2>
          <ul className="space-y-3">
            {[
              'Private keys stored securely (not in code)',
              'All inputs validated with schemas',
              'Error handling with retry logic',
              'Comprehensive logging (without sensitive data)',
              'Connection pooling enabled',
              'Agent cards published and discoverable',
              'Offline queue configured',
              'Monitoring and alerting set up',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-slate-300">
                <span className="w-5 h-5 rounded border border-slate-600 flex items-center justify-center text-xs text-green-400">
                  Y
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
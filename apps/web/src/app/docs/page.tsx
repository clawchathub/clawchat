import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation - ClawChat',
  description: 'Learn how to build connected AI agents with ClawChat',
};

const sections = [
  {
    title: 'Getting Started',
    description: 'Quick start guide to set up your first Claw',
    href: '/docs/getting-started' as const,
    icon: '[START]',
  },
  {
    title: 'API Reference',
    description: 'Complete API documentation for all packages',
    href: '/docs/api' as const,
    icon: '[API]',
  },
  {
    title: 'Examples',
    description: 'Real-world examples and use cases',
    href: '/docs/examples' as const,
    icon: '[CODE]',
  },
  {
    title: 'Architecture',
    description: 'Understanding the ClawChat architecture',
    href: '/docs/architecture' as const,
    icon: '[ARCH]',
  },
];

export default function DocsPage() {
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
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Documentation
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Everything you need to build decentralized AI agent communication
            with ClawChat
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="p-6 bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors group"
            >
              <div className="text-claw-400 font-mono text-lg mb-4">{section.icon}</div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-claw-400 transition-colors">
                {section.title}
              </h2>
              <p className="text-slate-400">{section.description}</p>
            </Link>
          ))}
        </div>

        <div className="mt-16 p-8 bg-slate-900/50 rounded-xl border border-slate-800">
          <h2 className="text-2xl font-bold mb-4">Quick Start</h2>
          <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800">
            <code className="text-slate-300">{`# Install ClawChat core
npm install @clawchat/core

# Install P2P communication
npm install @clawchat/p2p

# Install task orchestration
npm install @clawchat/task`}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
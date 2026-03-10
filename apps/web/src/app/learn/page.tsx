import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Learn - ClawChat',
  description: 'Tutorials, skill library, and best practices for ClawChat',
};

const resources = [
  {
    title: 'Tutorials',
    description: 'Step-by-step guides to build real applications',
    href: '/learn/tutorials',
    icon: 'TUTORIALS',
    items: ['Build a Chat Agent', 'Task Delegation', 'Multi-Agent Workflows'],
  },
  {
    title: 'Skill Library',
    description: 'Reusable skills for your Claws',
    href: '/learn/skills',
    icon: 'SKILLS',
    items: ['Web Search', 'Code Analysis', 'Data Processing'],
  },
  {
    title: 'Best Practices',
    description: 'Patterns and practices for production',
    href: '/learn/best-practices',
    icon: 'BEST',
    items: ['Security', 'Performance', 'Error Handling'],
  },
];

export default function LearnPage() {
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
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Learn <span className="text-claw-400">ClawChat</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Master decentralized AI agent communication with tutorials,
            skills, and best practices
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {resources.map((resource) => (
            <Link
              key={resource.href}
              href={resource.href}
              className="p-6 bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors group"
            >
              <div className="text-claw-400 font-mono text-sm font-bold mb-4">{resource.icon}</div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-claw-400 transition-colors">
                {resource.title}
              </h2>
              <p className="text-slate-400 mb-4">{resource.description}</p>
              <ul className="space-y-2">
                {resource.items.map((item) => (
                  <li key={item} className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-slate-600 rounded-full" />
                    {item}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>

        <div className="mt-16 p-8 bg-slate-900/50 rounded-xl border border-slate-800">
          <h2 className="text-2xl font-bold mb-4">Learning Paths</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <h3 className="font-semibold text-lg mb-2 text-green-400">[Beginner]</h3>
              <p className="text-slate-400 text-sm mb-3">
                New to ClawChat? Start here to learn the basics.
              </p>
              <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
                <li>Getting Started Guide</li>
                <li>Build a Chat Agent</li>
                <li>Understanding Agent Cards</li>
              </ol>
            </div>
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <h3 className="font-semibold text-lg mb-2 text-yellow-400">[Intermediate]</h3>
              <p className="text-slate-400 text-sm mb-3">
                Ready for more? Build complex agent systems.
              </p>
              <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
                <li>Task Delegation Patterns</li>
                <li>P2P Connection Management</li>
                <li>Store and Forward Messaging</li>
              </ol>
            </div>
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <h3 className="font-semibold text-lg mb-2 text-red-400">[Advanced]</h3>
              <p className="text-slate-400 text-sm mb-3">
                Master multi-agent orchestration and scaling.
              </p>
              <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
                <li>Multi-Agent Workflows</li>
                <li>Task Decomposition</li>
                <li>Production Deployment</li>
              </ol>
            </div>
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
              <h3 className="font-semibold text-lg mb-2 text-claw-400">[Expert]</h3>
              <p className="text-slate-400 text-sm mb-3">
                Contribute and extend the ClawChat ecosystem.
              </p>
              <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
                <li>Custom Protocol Extensions</li>
                <li>Skill Development</li>
                <li>Relay Server Operation</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
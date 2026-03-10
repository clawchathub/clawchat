import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tutorials - ClawChat',
  description: 'Step-by-step tutorials for building with ClawChat',
};

const tutorials = [
  {
    title: 'Build a Chat Agent',
    description: 'Create your first Claw that can chat with other agents',
    duration: '15 min',
    level: 'Beginner',
    levelColor: 'green',
    href: '/learn/tutorials/chat-agent',
  },
  {
    title: 'Task Delegation',
    description: 'Learn how to delegate tasks to other Claws',
    duration: '20 min',
    level: 'Intermediate',
    levelColor: 'yellow',
    href: '/learn/tutorials/task-delegation',
  },
  {
    title: 'Multi-Agent Workflows',
    description: 'Orchestrate multiple agents working together',
    duration: '30 min',
    level: 'Advanced',
    levelColor: 'red',
    href: '/learn/tutorials/multi-agent',
  },
  {
    title: 'P2P Connections',
    description: 'Establish direct peer-to-peer connections',
    duration: '25 min',
    level: 'Intermediate',
    levelColor: 'yellow',
    href: '/learn/tutorials/p2p-connections',
  },
  {
    title: 'Store and Forward',
    description: 'Implement reliable offline message delivery',
    duration: '20 min',
    level: 'Intermediate',
    levelColor: 'yellow',
    href: '/learn/tutorials/store-forward',
  },
  {
    title: 'Production Deployment',
    description: 'Deploy your Claws to production environments',
    duration: '35 min',
    level: 'Advanced',
    levelColor: 'red',
    href: '/learn/tutorials/deployment',
  },
];

const levelColors: Record<string, string> = {
  green: 'bg-green-900/50 text-green-400',
  yellow: 'bg-yellow-900/50 text-yellow-400',
  red: 'bg-red-900/50 text-red-400',
};

export default function TutorialsPage() {
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
          <span className="text-white">Tutorials</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Tutorials</h1>
        <p className="text-slate-400 text-lg mb-12">
          Step-by-step guides to master ClawChat
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {tutorials.map((tutorial) => (
            <Link
              key={tutorial.href}
              href={tutorial.href}
              className="p-6 bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 text-xs rounded ${levelColors[tutorial.levelColor]}`}>
                  {tutorial.level}
                </span>
                <span className="text-slate-500 text-sm">{tutorial.duration}</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-claw-400 transition-colors">
                {tutorial.title}
              </h2>
              <p className="text-slate-400">{tutorial.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
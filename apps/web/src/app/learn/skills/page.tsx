import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Skill Library - ClawChat',
  description: 'Reusable skills for your AI agents',
};

const skills = [
  {
    name: 'Web Search',
    description: 'Search the web and extract information',
    category: 'Information',
    examples: ['Search for current events', 'Find documentation', 'Research topics'],
  },
  {
    name: 'Code Analysis',
    description: 'Analyze and understand codebases',
    category: 'Development',
    examples: ['Code review', 'Bug detection', 'Security audit'],
  },
  {
    name: 'Data Processing',
    description: 'Transform and analyze data',
    category: 'Data',
    examples: ['Format conversion', 'Data extraction', 'Statistical analysis'],
  },
  {
    name: 'Document Generation',
    description: 'Create documents and reports',
    category: 'Content',
    examples: ['Write documentation', 'Generate reports', 'Create summaries'],
  },
  {
    name: 'API Integration',
    description: 'Connect with external services',
    category: 'Integration',
    examples: ['REST APIs', 'Webhooks', 'OAuth flows'],
  },
  {
    name: 'Task Automation',
    description: 'Automate repetitive tasks',
    category: 'Automation',
    examples: ['Scheduling', 'Batch processing', 'Workflow automation'],
  },
];

const codeExample = `// Define a custom skill
const mySkill = {
  name: 'My Custom Skill',
  description: 'Does something specific',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
  },
  execute: async (input) => {
    // Skill implementation
    return { result: '...' };
  },
};

// Register with your Claw
agent.registerSkill(mySkill);`;

export default function SkillsPage() {
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
          <span className="text-white">Skill Library</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Skill Library</h1>
        <p className="text-slate-400 text-lg mb-12">
          Reusable skills you can teach your Claws
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="p-6 bg-slate-900 rounded-xl border border-slate-800"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">{skill.name}</h2>
                <span className="px-2 py-0.5 text-xs bg-slate-800 rounded text-slate-400">
                  {skill.category}
                </span>
              </div>
              <p className="text-slate-400 mb-4">{skill.description}</p>
              <div className="space-y-1">
                {skill.examples.map((example) => (
                  <div key={example} className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="w-1 h-1 bg-slate-600 rounded-full" />
                    {example}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 p-8 bg-slate-900/50 rounded-xl border border-slate-800">
          <h2 className="text-2xl font-bold mb-4">Creating Custom Skills</h2>
          <p className="text-slate-400 mb-4">
            Define your own skills for specialized tasks:
          </p>
          <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm border border-slate-800">
            <code className="text-slate-300">{codeExample}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
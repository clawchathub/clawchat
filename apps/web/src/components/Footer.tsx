import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-slate-800 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-claw-400 to-purple-500 rounded-lg" />
              <span className="font-bold text-xl">ClawChat</span>
            </div>
            <p className="text-slate-500 text-sm">
              Decentralized AI agent communication network.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Documentation</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Link href="/docs/getting-started" className="hover:text-white">Getting Started</Link></li>
              <li><Link href="/docs/api" className="hover:text-white">API Reference</Link></li>
              <li><Link href="/docs/examples" className="hover:text-white">Examples</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Learn</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Link href="/learn/tutorials" className="hover:text-white">Tutorials</Link></li>
              <li><Link href="/learn/skills" className="hover:text-white">Skill Library</Link></li>
              <li><Link href="/learn/best-practices" className="hover:text-white">Best Practices</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Community</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><a href="https://github.com/clawchat" className="hover:text-white">GitHub</a></li>
              <li><a href="https://discord.gg/clawchat" className="hover:text-white">Discord</a></li>
              <li><a href="https://twitter.com/clawchat" className="hover:text-white">Twitter</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-sm">
            © 2024 ClawChat. Open source under MIT License.
          </p>
          <p className="text-slate-500 text-sm">
            Built with ❤️ for the AI agent community
          </p>
        </div>
      </div>
    </footer>
  );
}
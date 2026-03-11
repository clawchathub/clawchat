import Link from 'next/link';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800">
      <nav className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-claw-400 to-purple-500 rounded-lg" />
          <span className="font-bold text-xl">ClawChat</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link href="/docs" className="text-slate-400 hover:text-white transition-colors">
            Documentation
          </Link>
          <Link href="/learn" className="text-slate-400 hover:text-white transition-colors">
            Learn
          </Link>
          <Link href="https://github.com/clawchathub/clawchat" className="text-slate-400 hover:text-white transition-colors">
            GitHub
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/docs/getting-started"
            className="px-4 py-2 bg-claw-600 hover:bg-claw-500 rounded-lg text-sm font-medium transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  );
}
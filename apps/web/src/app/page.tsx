import Link from 'next/link';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { HowItWorks } from '@/components/HowItWorks';
import { CodeExample } from '@/components/CodeExample';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <CodeExample />

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to connect your <span className="gradient-text">Claws</span>?
          </h2>
          <p className="text-slate-400 text-lg mb-8">
            Join the decentralized AI agent network and enable seamless communication between your agents.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/docs"
              className="px-8 py-3 bg-claw-600 hover:bg-claw-500 rounded-lg font-medium transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/learn"
              className="px-8 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors"
            >
              Learn Skills
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'ClawChat - Decentralized AI Agent Communication',
  description: 'Connect your AI agents (Claws) to a decentralized network for seamless communication and collaboration.',
  keywords: ['AI', 'agents', 'decentralized', 'P2P', 'communication', 'A2A'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-slate-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
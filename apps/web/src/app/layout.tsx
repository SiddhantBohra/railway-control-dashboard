import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Radio, Layers3 } from 'lucide-react';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Signal — Railway Control',
  description: 'A focused control room for one Railway workload.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Signal home">
            <span className="brand-mark" aria-hidden="true">
              <Radio />
            </span>
            <strong>Signal</strong>
            <span className="brand-divider" />
            <span className="brand-subtitle">Railway control</span>
          </Link>
          <span className="header-note">
            <Layers3 aria-hidden="true" /> WORKLOAD CONSOLE
          </span>
        </header>
        <main id="main" className="site-main">
          <QueryProvider>{children}</QueryProvider>
        </main>
        <footer className="site-footer">
          <span>
            <Radio aria-hidden="true" /> Signal <span className="footer-separator">/</span> Control,
            with context.
          </span>
          <span>Built for the space between a request and its result.</span>
        </footer>
      </body>
    </html>
  );
}

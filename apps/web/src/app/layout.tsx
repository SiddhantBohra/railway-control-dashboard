import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
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
              <span />
              <span />
              <span />
            </span>
            <strong>signal</strong>
            <span className="brand-divider" />
            <span className="brand-subtitle">Railway control</span>
          </Link>
          <span className="header-note">
            <span aria-hidden="true">●</span> DELIBERATELY SMALL
          </span>
        </header>
        <main id="main" className="site-main">
          <QueryProvider>{children}</QueryProvider>
        </main>
        <footer className="site-footer">
          <span>CONTROL, WITH CONTEXT.</span>
          <span>Built for the space between a request and its result.</span>
        </footer>
      </body>
    </html>
  );
}

import type { NextConfig } from 'next';
import path from 'node:path';

const apiOrigin = process.env['API_INTERNAL_ORIGIN'] ?? 'http://127.0.0.1:3001';
const parsed = new URL(apiOrigin);
if (
  !['http:', 'https:'].includes(parsed.protocol) ||
  parsed.pathname !== '/' ||
  parsed.username ||
  parsed.password
) {
  throw new Error('API_INTERNAL_ORIGIN must be an HTTP origin without credentials');
}

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  poweredByHeader: false,
  transpilePackages: ['@control/contracts'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${parsed.origin}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;

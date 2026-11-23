import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// One .env at the repo root serves every package; real env vars take precedence.
config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@kush/api', '@kush/core', '@kush/db', '@kush/pdf'],
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '.prisma/client', 'playwright-core', 'qrcode'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

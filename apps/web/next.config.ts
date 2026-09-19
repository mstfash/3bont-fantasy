import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: 'standalone',
  typescript: { tsconfigPath: 'tsconfig.build.json' },
};

export default nextConfig;

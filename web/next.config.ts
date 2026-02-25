import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    const upstream = process.env.API_UPSTREAM || 'http://api:8000';
    return [
      { source: '/api/:path*', destination: `${upstream}/:path*` },
    ];
  },
};

export default nextConfig;

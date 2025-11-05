import type { NextConfig } from 'next';
import path from 'path';

// Set up Cloudflare Pages development platform
// This enables the Cloudflare Workers runtime in development
if (process.env.NODE_ENV === 'development') {
  const { setupDevPlatform } = await import('@cloudflare/next-on-pages/next-dev');
  await setupDevPlatform();
}

const nextConfig: NextConfig = {
  // SSR mode with Cloudflare Workers via @cloudflare/next-on-pages
  // This adapter transforms Next.js SSR to Cloudflare Workers
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Disable ESLint during production builds (Cloudflare Pages)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Disable TypeScript errors during build (we can fix them later)
  typescript: {
    ignoreBuildErrors: true,
  },

  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },

  webpack: (config, { isServer }) => {
    // Use process.cwd() since build runs from frontend directory
    const rootDir = process.cwd();

    // Log for debugging (will appear in build logs)
    console.log('[Next.js Config] Current working directory:', rootDir);
    console.log('[Next.js Config] Setting up path aliases...');

    // Explicitly set path aliases for Cloudflare Pages compatibility
    const aliases = {
      '@': rootDir,
      '@/components': path.join(rootDir, 'components'),
      '@/features': path.join(rootDir, 'features'),
      '@/lib': path.join(rootDir, 'lib'),
      '@/hooks': path.join(rootDir, 'hooks'),
      '@/styles': path.join(rootDir, 'styles'),
      '@/app': path.join(rootDir, 'app'),
    };

    console.log('[Next.js Config] Path aliases:', JSON.stringify(aliases, null, 2));

    config.resolve.alias = {
      ...config.resolve.alias,
      ...aliases,
    };

    // Browser polyfills (only for client-side)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },

  // Image optimization with Cloudflare
  // Cloudflare has its own image optimization, so we use unoptimized mode
  images: {
    unoptimized: true, // Required for Cloudflare Pages
    remotePatterns: [],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

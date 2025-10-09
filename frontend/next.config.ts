import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  webpack: (config, { isServer, dir }) => {
    // Use the Next.js provided 'dir' instead of process.cwd() for reliability
    const projectDir = dir;
    
    // Ensure resolve.alias exists
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }
    
    // Add explicit path aliases (preserving existing aliases)
    Object.assign(config.resolve.alias, {
      '@': projectDir,
      '@/components': path.join(projectDir, 'components'),
      '@/features': path.join(projectDir, 'features'),
      '@/lib': path.join(projectDir, 'lib'),
      '@/hooks': path.join(projectDir, 'hooks'),
      '@/styles': path.join(projectDir, 'styles'),
      '@/app': path.join(projectDir, 'app'),
    });
    
    // Also add extensions to resolve
    if (!config.resolve.extensions) {
      config.resolve.extensions = [];
    }
    // Ensure .ts and .tsx are included
    if (!config.resolve.extensions.includes('.ts')) {
      config.resolve.extensions.push('.ts');
    }
    if (!config.resolve.extensions.includes('.tsx')) {
      config.resolve.extensions.push('.tsx');
    }
    
    // Browser polyfills (only for client-side)
    if (!isServer) {
      if (!config.resolve.fallback) {
        config.resolve.fallback = {};
      }
      Object.assign(config.resolve.fallback, {
        fs: false,
        net: false,
        tls: false,
      });
    }
    
    return config;
  },

  images: {
    remotePatterns: [],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

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

  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;

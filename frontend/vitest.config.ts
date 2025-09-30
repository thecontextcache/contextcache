import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.*',
        '**/*.d.ts',
        '.next/',
        'out/',
        'dist/',
      ],
      include: ['app/**', 'components/**', 'features/**', 'lib/**', 'hooks/**'],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@/components': path.resolve(__dirname, './components'),
      '@/features': path.resolve(__dirname, './features'),
      '@/lib': path.resolve(__dirname, './lib'),
      '@/hooks': path.resolve(__dirname, './hooks'),
      '@/styles': path.resolve(__dirname, './styles'),
      '@/app': path.resolve(__dirname, './app'),
    },
  },
});
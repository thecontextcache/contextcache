import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand)',
        violet: 'var(--violet)',
        ok: 'var(--ok)',
        err: 'var(--err)',
        warn: 'var(--warn)',
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        panel: 'var(--panel)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'monospace'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(0, 212, 255, 0.3)',
        'glow-violet': '0 0 20px rgba(124, 58, 255, 0.3)',
        panel: 'var(--shadow)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 212, 255, 0.5)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

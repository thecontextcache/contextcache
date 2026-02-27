'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const THEME_KEY = 'contextcache-theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (nextTheme: Theme) => {
      const resolved: ResolvedTheme =
        nextTheme === 'system' ? (media.matches ? 'dark' : 'light') : nextTheme;
      setResolvedTheme(resolved);

      const root = document.documentElement;
      root.setAttribute('data-theme', resolved);
      root.classList.toggle('dark', resolved === 'dark');
    };

    applyTheme(theme);

    const onSystemChange = () => {
      if (theme === 'system') applyTheme('system');
    };
    media.addEventListener('change', onSystemChange);

    return () => {
      media.removeEventListener('change', onSystemChange);
    };
  }, [theme]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (nextTheme: Theme) => {
        setTheme(nextTheme);
        window.localStorage.setItem(THEME_KEY, nextTheme);
      },
      toggleTheme: () => {
        const next: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        window.localStorage.setItem(THEME_KEY, next);
      },
    }),
    [theme, resolvedTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

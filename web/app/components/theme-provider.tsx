'use client';

import { createContext, useContext, type ReactNode } from 'react';

// Dark-only for now. Kept as a context so we can add light theme later.
interface ThemeContextType {
  theme: 'dark';
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark' });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

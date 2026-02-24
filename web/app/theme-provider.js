"use client";

import { createContext, useContext, useEffect, useState } from "react";

const DEFAULT_THEME = "dark";

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  resolvedTheme: DEFAULT_THEME,
  toggleTheme: () => { },
});

export function ThemeProvider({ children }) {
  const [theme] = useState(DEFAULT_THEME);
  const [resolvedTheme] = useState(DEFAULT_THEME);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
    }
  }, []);

  function toggleTheme() {
    // No-op — theme is hardcoded to dark.
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

"use client";

import { createContext, useContext, useEffect, useState } from "react";

const DEFAULT_THEME = "dark";
const VALID_THEMES = new Set(["dark"]);
const ASSET_REV = process.env.NEXT_PUBLIC_ASSET_VERSION || "20260221";

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  resolvedTheme: DEFAULT_THEME,
  toggleTheme: () => { },
});

function getInitialTheme() {
  return DEFAULT_THEME;
}

function resolveTheme() {
  return DEFAULT_THEME;
}

function applyFavicon(resolvedTheme) {
  if (typeof document === "undefined") return;
  const href = resolvedTheme === "dark"
    ? `/favicon-dark.svg?v=${ASSET_REV}`
    : `/favicon-light.svg?v=${ASSET_REV}`;
  const favicon = document.getElementById("dynamic-favicon");
  if (favicon) favicon.setAttribute("href", href);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [resolvedTheme, setResolvedTheme] = useState(DEFAULT_THEME);

  // Hydration-safe theme boot: fallback to DEFAULT_THEME when storage is empty.
  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  // Remove local storage effect and matchMedia effects as they are no longer needed
  // since the theme is permanently set to dark.

  useEffect(() => {
    const active = DEFAULT_THEME;
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", active);
    }
    applyFavicon(active);
  }, []);

  function toggleTheme() {
    // No-op for now since it's hardcoded.
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

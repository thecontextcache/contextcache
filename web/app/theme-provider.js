"use client";

import { createContext, useContext, useEffect, useState } from "react";

const DEFAULT_THEME = "dark";
const VALID_THEMES = new Set(["dark", "light", "system"]);
const ASSET_REV = process.env.NEXT_PUBLIC_ASSET_VERSION || "20260221";
const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  resolvedTheme: DEFAULT_THEME,
  toggleTheme: () => {},
});

function getInitialTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const saved = window.localStorage.getItem("contextcache_theme") || DEFAULT_THEME;
  return VALID_THEMES.has(saved) ? saved : DEFAULT_THEME;
}

function resolveTheme(theme) {
  const normalizedTheme = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
  if (typeof window === "undefined") {
    return normalizedTheme === "light" ? "light" : "dark";
  }
  if (normalizedTheme === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return normalizedTheme;
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

  useEffect(() => {
    const activeTheme = theme || DEFAULT_THEME;
    const resolved = resolveTheme(activeTheme);
    setResolvedTheme(resolved);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("contextcache_theme", activeTheme);
    }
  }, [theme]);

  // Favicon + document theme should track resolved theme changes.
  useEffect(() => {
    const active = resolvedTheme || DEFAULT_THEME;
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", active);
    }
    applyFavicon(active);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((theme || DEFAULT_THEME) === "system") {
        setResolvedTheme(resolveTheme("system"));
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (resolveTheme(prev || DEFAULT_THEME) === "dark" ? "light" : "dark"));
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

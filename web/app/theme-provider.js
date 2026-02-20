"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "dark", resolvedTheme: "dark", toggleTheme: () => {} });
const ASSET_REV = process.env.NEXT_PUBLIC_ASSET_VERSION || "20260220";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem("contextcache_theme") || "dark";
}

function resolveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyFavicon(resolvedTheme) {
  if (typeof document === "undefined") return;
  const favicon = document.getElementById("dynamic-favicon");
  if (!favicon) return;
  favicon.setAttribute(
    "href",
    resolvedTheme === "dark"
      ? `/favicon-dark.svg?v=${ASSET_REV}`
      : `/favicon-light.svg?v=${ASSET_REV}`,
  );
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState("dark"); // dark is the default

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
    applyFavicon(resolved);
    window.localStorage.setItem("contextcache_theme", theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") {
        const resolved = resolveTheme("system");
        setResolvedTheme(resolved);
        document.documentElement.setAttribute("data-theme", resolved);
        applyFavicon(resolved);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (resolveTheme(prev) === "dark" ? "light" : "dark"));
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

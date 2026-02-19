"use client";

import Link from "next/link";
import { useTheme } from "./theme-provider";

export default function Shell({ children }) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">thecontextcache™</Link>
        <nav className="nav">
          <Link href="/app">App</Link>
          <Link href="/admin">Admin</Link>
          <Link href="/legal">Legal</Link>
          <button type="button" className="theme-btn" onClick={toggleTheme}>
            {resolvedTheme === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </header>
      <div className="page">{children}</div>
      <footer className="footer">
        <span>thecontextcache™</span>
        <div className="footer-links">
          <a href="http://localhost:8001" target="_blank" rel="noreferrer">Docs</a>
          <a href="mailto:support@thecontextcache.com">Support</a>
          <Link href="/legal">Copyright / License</Link>
        </div>
      </footer>
    </div>
  );
}

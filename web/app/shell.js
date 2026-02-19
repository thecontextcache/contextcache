"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "./theme-provider";

function buildDefaultApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export default function Shell({ children }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const docsUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_DOCS_URL) {
      return process.env.NEXT_PUBLIC_DOCS_URL;
    }
    if (typeof window === "undefined") return "http://localhost:8001";
    return `${window.location.protocol}//${window.location.hostname}:8001`;
  }, []);
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL || buildDefaultApiBase(), []);

  useEffect(() => {
    async function checkMe() {
      try {
        const response = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
        if (!response.ok) {
          setIsLoggedIn(false);
          setIsAdmin(false);
          return;
        }
        const me = await response.json();
        setIsLoggedIn(true);
        setIsAdmin(Boolean(me.is_admin));
      } catch {
        setIsLoggedIn(false);
        setIsAdmin(false);
      }
    }
    checkMe();
  }, [apiBase]);

  async function logout() {
    await fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" });
    setIsLoggedIn(false);
    setIsAdmin(false);
    router.push("/auth");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">thecontextcache™</Link>
        <nav className="nav">
          <Link href="/app">App</Link>
          {isAdmin ? <Link href="/admin">Admin</Link> : null}
          <Link href="/legal">Legal</Link>
          {isLoggedIn ? (
            <button type="button" className="theme-btn" onClick={logout}>Logout</button>
          ) : (
            <Link href="/auth">Sign in</Link>
          )}
          <button type="button" className="theme-btn" onClick={toggleTheme}>
            {resolvedTheme === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </header>
      <div className="page">{children}</div>
      <footer className="footer">
        <span>thecontextcache™</span>
        <div className="footer-links">
          <a href={docsUrl} target="_blank" rel="noreferrer">Docs</a>
          <a href="mailto:support@thecontextcache.com">Support</a>
          <Link href="/legal">Copyright / License</Link>
        </div>
      </footer>
    </div>
  );
}

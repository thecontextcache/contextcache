"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "./theme-provider";
import { buildApiBase, buildDocsBase, checkHealth } from "./lib/api";
import { ServiceUnavailable } from "./components/service-unavailable";
import { DebugPanel } from "./components/debug-panel";

export default function Shell({ children }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [healthOk, setHealthOk] = useState(null);
  const [lastError, setLastError] = useState("");
  const [session, setSession] = useState(null);

  const apiBase = useMemo(() => buildApiBase(), []);
  const docsBase = useMemo(() => buildDocsBase(), []);

  // Health check on mount, retry when recovered
  useEffect(() => {
    let mounted = true;
    async function probe() {
      const ok = await checkHealth();
      if (mounted) setHealthOk(ok);
    }
    probe();
    return () => { mounted = false; };
  }, []);

  // Auth probe — only on protected pages
  const isPublicPage = pathname === "/" || pathname.startsWith("/auth") || pathname.startsWith("/legal");
  useEffect(() => {
    if (isPublicPage) return;
    async function checkMe() {
      try {
        const res = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
        if (!res.ok) { setIsLoggedIn(false); setIsAdmin(false); return; }
        const me = await res.json();
        setIsLoggedIn(true);
        setIsAdmin(Boolean(me.is_admin));
        setSession(me);
      } catch {
        setIsLoggedIn(false);
        setIsAdmin(false);
      }
    }
    checkMe();
  }, [apiBase, isPublicPage, pathname]);

  async function logout() {
    try {
      await fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Proceed even if logout endpoint fails.
    }
    setIsLoggedIn(false);
    setIsAdmin(false);
    setSession(null);
    router.push("/auth");
  }

  function nav(href) {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return `nav-link${active ? " active" : ""}`;
  }

  if (healthOk === false) {
    return (
      <ServiceUnavailable
        onRecover={() => {
          setHealthOk(true);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          thecontextcache™
        </Link>
        <nav className="nav" aria-label="Main navigation">
          <Link href="/app" className={nav("/app")}>App</Link>
          {isAdmin && <Link href="/admin" className={nav("/admin")}>Admin</Link>}
          <Link href="/legal" className={nav("/legal")}>Legal</Link>
          <a href={docsBase} target="_blank" rel="noreferrer" className="nav-link">
            Docs
          </a>
          {isLoggedIn ? (
            <button type="button" className="nav-btn" onClick={logout}>
              Sign out
            </button>
          ) : (
            <Link href="/auth" className={nav("/auth")}>Sign in</Link>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
          >
            {resolvedTheme === "dark" ? "☀" : "☾"}
          </button>
        </nav>
      </header>

      <div className="page" id="main-content">
        {children}
      </div>

      <footer className="footer">
        <span className="muted">thecontextcache™ — invite-only alpha</span>
        <div className="footer-links">
          <a href={docsBase} target="_blank" rel="noreferrer">Docs</a>
          <a href="mailto:support@thecontextcache.com">Support</a>
          <Link href="/legal">Legal</Link>
        </div>
      </footer>

      <DebugPanel healthOk={healthOk} lastError={lastError} session={session} />
    </div>
  );
}
